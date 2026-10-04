type Route =
  | "events"
  | "event"
  | "schedule"
  | "match"
  | "teams"
  | "team"
  | "stats"
  | "picklist";

function Bar({
  width = "w-40",
  height = "h-4",
}: {
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={`${width} ${height} max-w-full rounded bg-border/70 motion-safe:animate-pulse`}
    />
  );
}

function Heading({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      <Bar width="w-24" />
      <Bar width={compact ? "w-48" : "w-72"} height="h-9" />
      <Bar width="w-64" />
    </div>
  );
}

function Panel({
  lines = 2,
  height = "min-h-36",
}: {
  lines?: number;
  height?: string;
}) {
  return (
    <div
      className={`${height} space-y-4 rounded-card border border-border bg-surface p-5`}
    >
      <Bar width="w-40" height="h-6" />
      {Array.from({ length: lines }, (_, index) => (
        <Bar key={index} width={index % 2 ? "w-32" : "w-64"} />
      ))}
    </div>
  );
}

export function RouteSkeleton({ route }: { route: Route }) {
  const title: Record<Route, string> = {
    events: "Loading events",
    event: "Loading event workspace",
    schedule: "Loading event schedule",
    match: "Loading match details",
    teams: "Loading teams",
    team: "Loading team",
    stats: "Loading stats",
    picklist: "Loading picklist",
  };
  return (
    <div role="status" aria-label={title[route]} className="space-y-6">
      <span className="sr-only">{title[route]}…</span>
      <div aria-hidden="true" className="space-y-6">
        <Heading compact={route === "match" || route === "team"} />
        {route === "schedule" && (
          <div className="flex flex-wrap gap-3">
            <Bar width="w-80" height="h-12" />
            <Bar width="w-32" height="h-12" />
          </div>
        )}
        {(route === "teams" || route === "stats" || route === "picklist") && (
          <div className="flex flex-wrap gap-3">
            <Bar width="w-72" height="h-12" />
            <Bar width="w-44" height="h-12" />
          </div>
        )}
        {route === "team" && (
          <div className="flex gap-4">
            <Bar width="w-20" height="h-20" />
            <div className="space-y-3">
              <Bar width="w-44" height="h-8" />
              <Bar width="w-32" />
            </div>
          </div>
        )}
        <div
          className={
            route === "events" || route === "event" || route === "teams"
              ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              : "space-y-4"
          }
        >
          {Array.from(
            { length: route === "match" ? 3 : route === "schedule" ? 4 : 3 },
            (_, index) => (
              <Panel
                key={index}
                lines={route === "match" || route === "schedule" ? 3 : 2}
                height={route === "match" ? "min-h-48" : "min-h-36"}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
