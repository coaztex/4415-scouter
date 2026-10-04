import { openDB, type DBSchema } from "idb";
import {
  CONFIRMATION_TTL,
  MAX_ATTEMPTS,
  retryDelay,
  safeErrors,
  submissionId,
  validateSubmission,
  type QueueRecord,
  type Submission,
  type SyncReply,
} from "./model";

type DeviceDraft = {
  key: string;
  actorId: string;
  value: string;
  revision: number;
  updatedAt: number;
};
interface ScoutDB extends DBSchema {
  drafts: { key: string; value: DeviceDraft };
  queue: { key: string; value: QueueRecord; indexes: { actor: string } };
}
let connection: ReturnType<typeof openDB<ScoutDB>> | undefined;
function db() {
  return (connection ??= openDB<ScoutDB>("frc-scout-device", 1, {
    upgrade(database) {
      database.createObjectStore("drafts", { keyPath: "key" });
      database
        .createObjectStore("queue", { keyPath: "client_submission_id" })
        .createIndex("actor", "actorId");
    },
    blocking() {
      void connection?.then((value) => value.close());
      connection = undefined;
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  }));
}
export async function readDraft(key: string, actorId: string) {
  const value = await (await db()).get("drafts", key);
  if (value && value.actorId !== actorId) throw new Error("Wrong draft owner");
  return value;
}
export async function writeDraft(
  key: string,
  actorId: string,
  value: string,
  expected: number,
) {
  const tx = (await db()).transaction(["drafts", "queue"], "readwrite");
  const previous = await tx.objectStore("drafts").get(key);
  const queued = (
    await tx.objectStore("queue").index("actor").getAll(actorId)
  ).some((row) => row.draftKey === key);
  if (
    queued ||
    (previous?.revision ?? 0) !== expected ||
    (previous && previous.actorId !== actorId)
  ) {
    await tx.done;
    throw new Error(
      "Draft changed in another tab or was queued. Reload to review the saved copy.",
    );
  }
  const revision = expected + 1;
  await tx
    .objectStore("drafts")
    .put({ key, actorId, value, revision, updatedAt: Date.now() });
  await tx.done;
  return revision;
}
export async function deleteDraft(key: string, actorId: string) {
  const tx = (await db()).transaction("drafts", "readwrite");
  const row = await tx.store.get(key);
  if (row?.actorId === actorId) await tx.store.delete(key);
  await tx.done;
}
export async function queueRecords(actorId: string) {
  return (await db()).getAllFromIndex("queue", "actor", actorId);
}
export async function enqueue(input: Submission, now = Date.now()) {
  const payload = validateSubmission(input),
    id = submissionId(payload);
  const tx = (await db()).transaction("queue", "readwrite");
  const previous = await tx.store.get(id);
  if (previous) {
    if (
      previous.actorId !== payload.actorId ||
      (previous.payload &&
        JSON.stringify(previous.payload) !== JSON.stringify(payload))
    ) {
      await tx.done;
      throw new Error(
        "This submission is already queued with different content. Keep it for review.",
      );
    }
    await tx.done;
    return previous;
  }
  const others = await tx.store.index("actor").getAll(payload.actorId);
  if (others.some((row) => row.draftKey === payload.draftKey)) {
    await tx.done;
    throw new Error(
      "This report already has a device submission. Review its sync status.",
    );
  }
  const record: QueueRecord = {
    client_submission_id: id,
    actorId: payload.actorId,
    type: payload.type,
    eventId: payload.eventId,
    eventKey: payload.eventKey,
    draftKey: payload.draftKey,
    teamNumber:
      payload.type === "match"
        ? payload.draft.identity.teamNumber
        : payload.teamNumber,
    assignmentId:
      payload.type === "match" ? payload.draft.identity.assignmentId : null,
    matchId: payload.type === "match" ? payload.draft.identity.matchId : null,
    payload,
    created_at: now,
    updated_at: now,
    state: "pending",
    retryCount: 0,
    lastError: null,
    failureKind: null,
    nextAttemptAt: now,
    lease: null,
  };
  await tx.store.add(record);
  await tx.done;
  return record;
}
// IndexedDB transaction leases prevent two tabs from actively syncing the same row.
export async function claimNext(actorId: string, now = Date.now()) {
  const tx = (await db()).transaction("queue", "readwrite");
  const rows = await tx.store.index("actor").getAll(actorId);
  const row = rows
    .sort((a, b) => a.created_at - b.created_at)
    .find(
      (r) =>
        (r.state === "pending" ||
          (r.state === "syncing" && r.nextAttemptAt <= now)) &&
        r.nextAttemptAt <= now,
    );
  if (!row) {
    await tx.done;
    return null;
  }
  if (row.retryCount >= MAX_ATTEMPTS) {
    await tx.store.put({
      ...row,
      state: "error",
      failureKind: "transient",
      lastError: safeErrors.transient,
      lease: null,
    });
    await tx.done;
    return null;
  }
  const claimed: QueueRecord = {
    ...row,
    state: "syncing",
    retryCount: row.retryCount + 1,
    lease: crypto.randomUUID(),
    nextAttemptAt: now + 60_000,
    updated_at: now,
  };
  await tx.store.put(claimed);
  await tx.done;
  return claimed;
}
export async function finishAttempt(
  row: QueueRecord,
  result: SyncReply,
  now = Date.now(),
) {
  const tx = (await db()).transaction(["queue", "drafts"], "readwrite");
  const current = await tx.objectStore("queue").get(row.client_submission_id);
  if (!current || current.lease !== row.lease) {
    await tx.done;
    return;
  }
  if (result.ok) {
    await tx.objectStore("queue").put({
      ...current,
      state: "synced",
      payload: null,
      lastError: null,
      failureKind: null,
      lease: null,
      updated_at: now,
    });
    await tx.objectStore("drafts").delete(row.draftKey);
  } else {
    await tx.objectStore("queue").put({
      ...current,
      state:
        result.kind === "transient" && current.retryCount < MAX_ATTEMPTS
          ? "pending"
          : "error",
      failureKind: result.kind,
      lastError: safeErrors[result.kind],
      lease: null,
      nextAttemptAt: now + retryDelay(current.retryCount),
      updated_at: now,
    });
  }
  await tx.done;
}
export async function retryQueue(actorId: string) {
  const tx = (await db()).transaction("queue", "readwrite");
  for (const row of await tx.store.index("actor").getAll(actorId)) {
    if (
      (row.state === "pending" || row.state === "error") &&
      row.failureKind !== "conflict" &&
      row.failureKind !== "invalid"
    )
      await tx.store.put({
        ...row,
        state: "pending",
        retryCount: 0,
        nextAttemptAt: Date.now(),
        lastError: null,
      });
  }
  await tx.done;
}
export async function cleanConfirmations(actorId: string, now = Date.now()) {
  const tx = (await db()).transaction("queue", "readwrite");
  for (const row of await tx.store.index("actor").getAll(actorId)) {
    if (row.state === "synced" && now - row.updated_at > CONFIRMATION_TTL)
      await tx.store.delete(row.client_submission_id);
  }
  await tx.done;
}
