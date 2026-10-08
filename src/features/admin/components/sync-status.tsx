import { hasPitGeometry } from "@/features/pit-map/model";
import type { PitMapCache } from "@/features/pit-map/server/cache";
type State = {
  source: "tba" | "statbotics";
  status: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};
export function SyncStatus({ states }: { states: State[] }) {
  return (
    <div className="my-5 grid gap-4 sm:grid-cols-2">
      {(["tba", "statbotics"] as const).map((source) => {
        const state = states.find((item) => item.source === source);
        return (
          <div
            key={source}
            className="rounded-control border border-border p-4 text-sm"
          >
            <h3 className="font-bold">
              {source === "tba" ? "The Blue Alliance" : "Statbotics"}:{" "}
              {state?.status ?? "Not synced"}
            </h3>
            <p className="mt-2 break-words text-muted">
              Last attempt: {state?.last_attempt_at ?? "Never"}
            </p>
            <p className="break-words text-muted">
              Last success: {state?.last_success_at ?? "Never"}
            </p>
            {state?.last_error && (
              <p className="mt-2 break-words text-danger">{state.last_error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function PitMapSyncStatus({ cache }: { cache: PitMapCache | null }) {
  return (
    <div className="my-4 rounded-control border border-border p-4 text-sm">
      <h3 className="font-bold">Pit Map: {cache?.status ?? "Not synced"}</h3>
      <p>
        Source: {cache?.source ?? "Nexus"}
        {cache?.sourceEventKey ? ` · ${cache.sourceEventKey}` : ""}
      </p>
      <p>Last synced: {cache?.fetchedAt ?? "Never"}</p>
      <p>Assigned pits: {cache?.layout?.assignments.length ?? 0}</p>
      <p>
        Graphical geometry:{" "}
        {hasPitGeometry(cache?.layout ?? null) ? "Available" : "Unavailable"}
      </p>
      {cache && (
        <p className="text-muted">
          Last attempt: {cache.lastAttemptAt}
          {cache.lastAttemptKey && cache.lastAttemptKey !== cache.sourceEventKey
            ? ` · ${cache.lastAttemptKey}`
            : ""}
        </p>
      )}
      {cache?.lastError && (
        <p className="mt-2 text-danger">{cache.lastError}</p>
      )}
      <a
        href="https://frc.nexus"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-bold text-accent"
      >
        Nexus ↗
      </a>
    </div>
  );
}
