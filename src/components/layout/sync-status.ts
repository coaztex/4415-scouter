import type { QueueRecord } from "@/features/offline/model";

export function syncAttentionLabel({
  rows,
  loaded,
  online,
  storageError,
}: {
  rows: readonly QueueRecord[];
  loaded: boolean;
  online: boolean;
  storageError: string;
}) {
  if (!loaded) return null;
  const pending = rows.filter((row) => row.state !== "synced");
  if (online && !storageError && pending.length === 0) return null;
  const issue = storageError
    ? "Device storage error"
    : !online
      ? "Offline"
      : pending.some((row) => row.state === "error")
        ? "Sync needs attention"
        : "";
  const count = `${pending.length} pending`;
  return issue ? `${issue} · ${count}` : count;
}
