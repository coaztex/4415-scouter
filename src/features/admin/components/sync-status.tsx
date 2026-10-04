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
