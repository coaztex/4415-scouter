import "fake-indexeddb/auto";
import { openDB } from "idb";
import test from "node:test";
import assert from "node:assert/strict";
import { blankPit } from "../src/features/pit/model";
import { freshDraft, markDns } from "../src/features/scouting/match/model";
import { pitDeviceDraftSchema } from "../src/features/pit/device-draft";
import {
  MAX_ATTEMPTS,
  CONFIRMATION_TTL,
  type Submission,
  validateSubmission,
} from "../src/features/offline/model";
import {
  enqueue,
  queueRecords,
  claimNext,
  finishAttempt,
  retryQueue,
  cleanConfirmations,
  readDraft,
  writeDraft,
} from "../src/features/offline/store";
import { sendSubmission } from "../src/features/offline/transport";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function pit(n: number): Submission {
  return {
    type: "pit",
    actorId: id(n),
    eventId: id(999),
    eventKey: "2026test",
    draftKey: `pit:${n}`,
    clientSubmissionId: id(n + 100),
    teamNumber: n,
    gameData: blankPit(),
    expectedRevision: 0,
    takeover: false,
  };
}
test("IndexedDB stores drafts, rejects stale tab writes, and preserves partial pit input", async () => {
  const revision = await writeDraft("draft-1", id(1), "first", 0);
  assert.equal((await readDraft("draft-1", id(1)))?.value, "first");
  await assert.rejects(writeDraft("draft-1", id(1), "stale", 0));
  assert.equal(await writeDraft("draft-1", id(1), "next", revision), 2);
  await assert.rejects(readDraft("draft-1", id(2)));
  assert.equal(
    pitDeviceDraftSchema.parse({
      data: { ...blankPit(), strategy_note: "  " },
      numeric: "",
      capacityMode: "approximate_count",
      clientId: id(1),
      revision: 0,
      claimed: true,
    }).numeric,
    "",
  );
});
test("enqueue is durable, immutable, account scoped, and prevents duplicate workers", async () => {
  const p = pit(10);
  await enqueue(p, 1000);
  await enqueue(p, 1000);
  const reopened = await openDB("frc-scout-device", 1);
  assert.equal((await reopened.get("queue", id(110))).state, "pending");
  reopened.close();
  assert.equal((await queueRecords(p.actorId)).length, 1);
  assert.equal((await queueRecords(id(11))).length, 0);
  await assert.rejects(enqueue({ ...p, eventKey: "2026changed" }));
  const claimed = await Promise.all([
    claimNext(p.actorId, 1000),
    claimNext(p.actorId, 1000),
  ]);
  assert.equal(claimed.filter(Boolean).length, 1);
  assert.equal((await queueRecords(p.actorId))[0].state, "syncing");
  // A browser crash leaves a persisted lease, which is recoverable after timeout.
  assert.equal(await claimNext(p.actorId, 2000), null);
  const recovered = await claimNext(p.actorId, 61_001);
  assert.ok(recovered);
  assert.equal(recovered.retryCount, 2);
  await finishAttempt(claimed.find(Boolean)!, { ok: true }, 62_000);
  assert.equal(
    (await queueRecords(p.actorId))[0].state,
    "syncing",
    "stale worker cannot overwrite new lease",
  );
  await finishAttempt(recovered, { ok: true }, 63_000);
  const confirmed = (await queueRecords(p.actorId))[0];
  assert.equal(confirmed.state, "synced");
  assert.equal(confirmed.payload, null);
});
test("simulated fetch loss backs off, stops after five attempts, and permits manual retry", async () => {
  const p = pit(20);
  let now = 1000;
  await enqueue(p, now);
  let calls = 0;
  const failedFetch: typeof fetch = async () => {
    calls++;
    throw new TypeError("simulated secret-bearing network diagnostic");
  };
  for (let count = 1; count <= MAX_ATTEMPTS; count++) {
    const row = await claimNext(p.actorId, now);
    assert.ok(row);
    await finishAttempt(row, await sendSubmission(p, failedFetch), now);
    const stored = (await queueRecords(p.actorId))[0];
    assert.equal(stored.retryCount, count);
    assert.doesNotMatch(stored.lastError!, /secret-bearing/);
    assert.equal(await claimNext(p.actorId, now + 1), null);
    now = stored.nextAttemptAt;
  }
  assert.equal(calls, 5);
  assert.equal((await queueRecords(p.actorId))[0].state, "error");
  await retryQueue(p.actorId);
  assert.equal((await queueRecords(p.actorId))[0].retryCount, 0);
});
test("conflicts remain preserved, manual retry cannot overwrite, cleanup never removes pending work", async () => {
  const p = pit(30);
  await enqueue(p, 1000);
  const row = await claimNext(p.actorId, 1000);
  assert.ok(row);
  const conflict: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, kind: "conflict" }), {
      status: 409,
    });
  await finishAttempt(row, await sendSubmission(p, conflict), 1000);
  await retryQueue(p.actorId);
  await cleanConfirmations(p.actorId, 1000 + 2 * CONFIRMATION_TTL);
  const saved = (await queueRecords(p.actorId))[0];
  assert.equal(saved.state, "error");
  assert.equal(saved.failureKind, "conflict");
  assert.ok(saved.payload);
  assert.equal(await claimNext(p.actorId, Date.now()), null);
});
test("durable success removes its draft and retains only a short confirmation", async () => {
  const p = pit(40);
  await writeDraft(p.draftKey, p.actorId, "draft", 0);
  await enqueue(p, 1000);
  await assert.rejects(
    writeDraft(p.draftKey, p.actorId, "edit after enqueue", 1),
  );
  const row = await claimNext(p.actorId, 1000);
  assert.ok(row);
  const accepted: typeof fetch = async (_url, options) => {
    assert.equal(options?.method, "POST");
    assert.equal(JSON.parse(String(options?.body)).clientSubmissionId, id(140));
    return new Response('{"ok":true}');
  };
  await finishAttempt(row, await sendSubmission(p, accepted), 2000);
  assert.equal(await readDraft(p.draftKey, p.actorId), undefined);
  await cleanConfirmations(p.actorId, 3000);
  assert.equal((await queueRecords(p.actorId)).length, 1);
  await cleanConfirmations(p.actorId, 2001 + CONFIRMATION_TTL);
  assert.equal((await queueRecords(p.actorId)).length, 0);
});
test("malformed responses never count as success, session expiry pauses, and match data validates", async () => {
  assert.deepEqual(
    await sendSubmission(
      pit(50),
      async () => new Response("<html>Login</html>"),
    ),
    { ok: false, kind: "transient" },
  );
  assert.deepEqual(
    await sendSubmission(
      pit(50),
      async () => new Response("", { status: 401 }),
    ),
    { ok: false, kind: "auth" },
  );
  const identity = {
    actorId: id(60),
    assignedScoutId: id(60),
    matchId: id(61),
    assignmentId: id(62),
    teamNumber: 60,
  };
  const draft = markDns(freshDraft(identity, 1000, id(63)), 2000);
  const match = {
    type: "match" as const,
    actorId: id(60),
    eventId: id(999),
    eventKey: "2026test",
    draftKey: "match60",
    draft,
    override: false,
  };
  assert.equal(validateSubmission(match).type, "match");
  assert.throws(() => validateSubmission({ ...match, actorId: id(70) }));
  const created = await enqueue(match, 1000);
  assert.equal(created.assignmentId, id(62));
  assert.equal(created.matchId, id(61));
});
