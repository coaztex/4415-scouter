import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { IncidentCard } from "@/features/incidents/components/incident-card";
import { getEventIncidents } from "@/features/incidents/server/queries";

export const metadata = { title: "Incident Review" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { eventKey } = await params;
  const { filter } = await searchParams;
  const selected =
    filter === "all" || filter === "confirmed" ? filter : "pending";
  const { incidents } = await getEventIncidents(eventKey);
  const shown = incidents.filter(
    (incident) =>
      selected === "all" ||
      (selected === "pending" ? !incident.reviewed_at : !!incident.reviewed_at),
  );
  return (
    <div className="space-y-5">
      <PageHeading
        title="Incident Review"
        description="Review scout-observed status and symptoms, then record a separately sourced cause when confirmed."
      />
      <nav aria-label="Incident filter" className="flex flex-wrap gap-2">
        {(["pending", "all", "confirmed"] as const).map((value) => (
          <Link
            key={value}
            href={`/events/${encodeURIComponent(eventKey)}/incidents?filter=${value}`}
            aria-current={selected === value ? "page" : undefined}
            className={`min-h-12 rounded-control px-4 py-3 font-bold ${selected === value ? "bg-foreground text-on-foreground" : "bg-surface text-muted"}`}
          >
            {value === "pending"
              ? "Needs review"
              : value === "all"
                ? "All"
                : "Confirmed"}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted" role="status">
        Showing {shown.length} of {incidents.length} notable incident records. A
        match may have several observed issues.
      </p>
      {shown.length ? (
        <div className="space-y-4">
          {shown.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              eventKey={eventKey}
              reviewable
            />
          ))}
        </div>
      ) : (
        <p className="rounded-control border border-border bg-surface p-5">
          No incidents in this view.
        </p>
      )}
    </div>
  );
}
