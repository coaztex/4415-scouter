import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { adminContext, adminEvents } from "@/features/admin/server/queries";
import { getTbaEnvironment } from "@/lib/server/env";
import { eventTime } from "@/features/events/timezone";

export const metadata = { title: "Competition Readiness" };

function tbaConfigured() {
  try {
    getTbaEnvironment();
    return true;
  } catch {
    return false;
  }
}
function count(result: { count: number | null; error: unknown }) {
  return result.error ? null : result.count;
}
function displayed(value: number | null) {
  return value === null ? "Unavailable" : value.toLocaleString();
}
function timestamp(value: string | null, timezone: string) {
  return eventTime(value, timezone) ?? "Never";
}

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ eventKey?: string }>;
}) {
  const { db } = await adminContext();
  const events = await adminEvents();
  const requested = (await searchParams).eventKey;
  // Resolve against the authorized event list; the route parameter is not a DB identity.
  const event =
    events.find((item) => item.tba_key === requested) ??
    events.find((item) => item.status === "active") ??
    events[0];
  const [database, scouts, teams, matches, assignments, missed, conflicts] =
    await Promise.all([
      db.from("events").select("id").limit(1),
      db
        .from("profiles")
        .select("id", { head: true, count: "exact" })
        .eq("role", "scout")
        .eq("active", true),
      event
        ? db
            .from("event_teams")
            .select("team_number", { head: true, count: "exact" })
            .eq("event_id", event.id)
        : Promise.resolve(null),
      event
        ? db
            .from("matches")
            .select("id", { head: true, count: "exact" })
            .eq("event_id", event.id)
        : Promise.resolve(null),
      event
        ? db
            .from("scouting_assignments")
            .select("id", { head: true, count: "exact" })
            .eq("event_id", event.id)
            .eq("assignment_type", "match")
        : Promise.resolve(null),
      event
        ? db
            .from("scouting_assignments")
            .select("id", { head: true, count: "exact" })
            .eq("event_id", event.id)
            .eq("status", "missed")
        : Promise.resolve(null),
      event
        ? db
            .from("scouting_sync_conflicts")
            .select("id", { head: true, count: "exact" })
            .eq("event_id", event.id)
            .eq("status", "open")
        : Promise.resolve(null),
    ]);
  const rows: [string, string][] = [
    ["Database", database.error ? "Unavailable" : "Reachable"],
    [
      "TBA server integration",
      tbaConfigured() ? "Configured" : "Not configured",
    ],
    ["Active scout accounts", displayed(count(scouts))],
  ];
  const sourceSuccess = (source: "tba" | "statbotics") =>
    event?.event_sync_state.find((state) => state.source === source)
      ?.last_success_at ??
    (source === "tba"
      ? event?.last_tba_sync_at
      : event?.last_statbotics_sync_at) ??
    null;
  return (
    <>
      <PageHeading
        eyebrow="Administration"
        title="Competition Readiness"
        description="Server-known checks for the selected event. Device-local pending sync cannot be measured globally."
      />
      <Card>
        <h2 className="text-xl font-bold">System</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="mt-5">
        <h2 className="text-xl font-bold">Event</h2>
        {events.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {events.map((item) => (
              <Link
                key={item.id}
                href={`/admin/health?eventKey=${encodeURIComponent(item.tba_key)}`}
                className="underline"
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}
        {!event ? (
          <p className="mt-3">No event imported yet.</p>
        ) : (
          <>
            <p className="mt-2 font-semibold">
              {event.name}{" "}
              <span className="text-sm text-muted">({event.tba_key})</span>
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Teams loaded", displayed(teams ? count(teams) : null)],
                  [
                    "Matches loaded",
                    displayed(matches ? count(matches) : null),
                  ],
                  [
                    "Match assignments",
                    displayed(assignments ? count(assignments) : null),
                  ],
                  [
                    "Missed assignments",
                    displayed(missed ? count(missed) : null),
                  ],
                  [
                    "Open server sync conflicts",
                    displayed(conflicts ? count(conflicts) : null),
                  ],
                  [
                    "Last successful TBA sync",
                    timestamp(sourceSuccess("tba"), event.timezone),
                  ],
                  [
                    "Last successful Statbotics sync",
                    timestamp(sourceSuccess("statbotics"), event.timezone),
                  ],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-muted">
              A zero means none recorded; “Unavailable” means the server could
              not read that check. Pending or failed submissions stored only on
              a scout’s device are not included.
            </p>
          </>
        )}
      </Card>
    </>
  );
}
