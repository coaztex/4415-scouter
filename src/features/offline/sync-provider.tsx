"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  enqueue,
  queueRecords,
  claimNext,
  finishAttempt,
  retryQueue,
  cleanConfirmations,
} from "./store";
import { sendSubmission } from "./transport";
import type { QueueRecord, Submission } from "./model";
type SyncContext = {
  rows: QueueRecord[];
  loaded: boolean;
  online: boolean;
  storageError: string;
  queue: (payload: Submission) => Promise<void>;
  retry: () => Promise<void>;
};
const Context = createContext<SyncContext | null>(null);
export function SyncProvider({
  actorId,
  children,
}: {
  actorId: string | null;
  children: ReactNode;
}) {
  const [rows, setRows] = useState<QueueRecord[]>([]),
    [loaded, setLoaded] = useState(false),
    [online, setOnline] = useState(true),
    [storageError, setStorageError] = useState("");
  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (!actorId) {
      setRows([]);
      setLoaded(true);
      return;
    }
    setRows(await queueRecords(actorId));
    setLoaded(true);
  }, [actorId]);
  const pump = useCallback(async () => {
    if (!actorId || running.current) return;
    running.current = true;
    try {
      await cleanConfirmations(actorId);
      await refresh();
      if (navigator.onLine) {
        const row = await claimNext(actorId);
        if (row) {
          await refresh();
          const result = row.payload
            ? await sendSubmission(row.payload)
            : { ok: false as const, kind: "invalid" as const };
          await finishAttempt(row, result);
          await refresh();
        }
      }
      setStorageError("");
    } catch {
      setStorageError(
        "Device storage unavailable. Keep the form open and export a backup; sync is paused.",
      );
    } finally {
      running.current = false;
    }
  }, [actorId, refresh]);
  useEffect(() => {
    const status = () => {
      setOnline(navigator.onLine);
      void pump();
    };
    const frame = requestAnimationFrame(() => {
      status();
      if (!actorId) void refresh();
    });
    // Queue writes and reconnect events pump immediately; idle tabs need only
    // occasional lease/backoff checks, not a global rerender every two seconds.
    const interval = window.setInterval(status, 10_000);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
    };
  }, [actorId, pump, refresh]);
  async function queue(payload: Submission) {
    if (payload.actorId !== actorId)
      throw new Error("Sign in as the owner of this draft.");
    await enqueue(payload);
    await refresh();
    void pump();
  }
  async function retry() {
    if (!actorId) return;
    try {
      await retryQueue(actorId);
      await refresh();
      void pump();
    } catch {
      setStorageError(
        "Device storage unavailable. Queue records have not been removed.",
      );
    }
  }
  return (
    <Context.Provider
      value={{ rows, loaded, online, storageError, queue, retry }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSync() {
  const value = useContext(Context);
  if (!value) throw new Error("SyncProvider required");
  return value;
}
function exportRecord(record: QueueRecord) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `scouting-${record.client_submission_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
export function QueueNotice({ record }: { record: QueueRecord }) {
  const { retry } = useSync();
  return (
    <div
      role="status"
      className="rounded-control border border-border bg-surface p-3 text-sm space-y-2"
    >
      <p className="font-bold">
        {record.state === "synced"
          ? "Synced — server confirmed"
          : record.state === "error"
            ? "Sync error — device copy preserved"
            : "Saved on this device — waiting to sync"}
      </p>
      {record.lastError && <p>{record.lastError}</p>}
      {record.state !== "synced" && (
        <div className="flex flex-wrap gap-3">
          {record.failureKind !== "conflict" &&
            record.failureKind !== "invalid" && (
              <button
                className="min-h-12 underline"
                onClick={() => void retry()}
              >
                Retry sync
              </button>
            )}
          <button
            className="min-h-12 underline"
            onClick={() => exportRecord(record)}
          >
            Export for review
          </button>
        </div>
      )}
    </div>
  );
}
export function SyncIndicator() {
  const { rows, online, loaded, retry, storageError } = useSync();
  const pending = rows.filter((r) => r.state !== "synced"),
    syncing = pending.filter((r) => r.state === "syncing").length;
  const errors = pending.some((r) => r.state === "error");
  const count = `${pending.length} pending`;
  const label = storageError
    ? `Device storage error / ${count}`
    : !loaded
      ? "Checking device sync…"
      : !online
        ? `Offline / ${count}`
        : errors
          ? `Sync error / ${count}`
          : syncing
            ? `Syncing ${syncing} / ${count}`
            : pending.length
              ? `Online / ${count}`
              : "Online / 0 pending";
  return (
    <details className="text-sm max-w-lg">
      <summary className="min-h-12 cursor-pointer py-3" aria-live="polite">
        {label}
      </summary>
      {storageError && <p role="alert">{storageError}</p>}
      {pending.length > 0 && (
        <button className="min-h-12 underline" onClick={() => void retry()}>
          Retry sync
        </button>
      )}
      <div className="max-h-72 space-y-2 overflow-auto">
        {rows.map((row) => (
          <div key={row.client_submission_id}>
            <p>
              {row.eventKey} · Team {row.teamNumber} · {row.type}
            </p>
            <QueueNotice record={row} />
          </div>
        ))}
      </div>
    </details>
  );
}

export function OfflineBanner() {
  const { online, loaded, rows } = useSync();
  if (!loaded || online) return null;
  const pending = rows.filter((row) => row.state !== "synced").length;
  return (
    <div
      role="alert"
      className="border-b border-danger bg-surface px-4 py-3 text-center text-sm font-bold text-danger"
    >
      Offline — scouting drafts stay on this device. {pending} submission
      {pending === 1 ? "" : "s"} pending sync.
    </div>
  );
}
