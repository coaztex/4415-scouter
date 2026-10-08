import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { buttonStyles } from "@/components/ui/button";
import { FUEL_REVIEW_THRESHOLD } from "@/features/data-review/model";
import { getDataReview } from "@/features/data-review/server/queries";
import { resolveSyncConflictAction } from "@/features/data-review/server/actions";

export const metadata = { title: "Data Review" };
const pct = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
const number = (value: number | null) => (value === null ? "—" : value);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string }>;
  searchParams: Promise<{ sort?: string; flagged?: string }>;
}) {
  const { eventKey } = await params;
  const filters = await searchParams;
  const review = await getDataReview(eventKey, filters);
  const submissionHref = (kind: "match" | "pit", id: string) =>
    `/events/${eventKey}/data-review/submissions/${kind}/${id}`;
  return (
    <div className="space-y-6">
      <PageHeading
        title="Data Review"
        description="Official totals and scout estimates are compared for review; records are unchanged."
      />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">2026 official FUEL comparison</h2>
            <p className="mt-1 text-sm text-muted">
              Review threshold: {FUEL_REVIEW_THRESHOLD.percentage}% difference,
              or {FUEL_REVIEW_THRESHOLD.absoluteWhenOfficialIsZero} FUEL when
              the official value is zero. Differences flag review, not robot
              error.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className={buttonStyles("secondary")}
              href={`/events/${eventKey}/data-review?sort=discrepancy${filters.flagged === "1" ? "&flagged=1" : ""}`}
            >
              Largest first
            </Link>
            <Link
              className={buttonStyles("secondary")}
              href={`/events/${eventKey}/data-review?sort=match${filters.flagged === "1" ? "&flagged=1" : ""}`}
            >
              Match order
            </Link>
            <Link
              className={buttonStyles("secondary")}
              href={`/events/${eventKey}/data-review?sort=${filters.sort === "match" ? "match" : "discrepancy"}${filters.flagged === "1" ? "" : "&flagged=1"}`}
            >
              {filters.flagged === "1" ? "Show all" : "Needs review only"}
            </Link>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {review.reconciliations.map((row) => (
            <article
              key={`${row.matchKey}-${row.alliance}`}
              className={`rounded-control border p-4 ${row.needsReview ? "border-warning" : "border-border"}`}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-bold">
                  {row.matchKey.split("_").at(-1)?.toUpperCase()} ·{" "}
                  {row.alliance.toUpperCase()}
                </h3>
                <span>
                  {row.needsReview ? "Needs review" : "Within threshold"}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr>
                      <th>Phase</th>
                      <th>Official TBA</th>
                      <th>Scout sum</th>
                      <th>Absolute</th>
                      <th>Percent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["auto", "teleop", "total"] as const).map((phase) => (
                      <tr key={phase} className="border-t border-border">
                        <th className="py-2 uppercase">{phase}</th>
                        <td>{number(row[phase].official)}</td>
                        <td>{number(row[phase].estimate)}</td>
                        <td>{number(row[phase].absoluteDifference)}</td>
                        <td>{pct(row[phase].percentageDifference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {row.contributions.map((item) => (
                  <InteractiveCard
                    key={item.id}
                    href={submissionHref("match", item.id)}
                    className="block p-3 text-sm"
                  >
                    <strong>Team {item.teamNumber}</strong>
                    <span className="block">ID {item.clientSubmissionId}</span>
                    <span className="block">
                      Confidence: {item.confidence.replaceAll("_", " ")}
                    </span>
                    <span className="block">
                      Status: {item.reliability}
                      {item.abnormal ? " · abnormal" : ""}
                    </span>
                  </InteractiveCard>
                ))}
              </div>
            </article>
          ))}
          {!review.reconciliations.length && (
            <p className="text-muted">
              No completed three-submission alliance comparison matches these
              filters.
            </p>
          )}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Queue title="Sync conflicts" empty="No unresolved sync conflicts.">
          {review.conflicts.map((row) => (
            <li key={row.id}>
              Team {row.team_number} · {row.kind.replaceAll("_", " ")} ·{" "}
              {row.client_submission_id}
              <details className="mt-1">
                <summary className="font-bold text-accent">
                  Inspect preserved candidate
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-control bg-background p-2 text-xs">
                  {JSON.stringify(row.attempted_payload, null, 2)}
                </pre>
                <form
                  action={resolveSyncConflictAction}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  <input type="hidden" name="eventKey" value={eventKey} />
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    name="resolution"
                    value="reviewed_no_change"
                    className={buttonStyles("secondary")}
                  >
                    Keep canonical / resolve
                  </button>
                  <button
                    name="resolution"
                    value="video_review_requested"
                    className={buttonStyles("secondary")}
                  >
                    Defer for video review
                  </button>
                </form>
              </details>
            </li>
          ))}
        </Queue>
        <Queue
          title="Incomplete / missed assignments"
          empty="No incomplete or missed assignments."
        >
          {review.assignments.map((row) => (
            <li key={row.id}>
              Team {row.team_number ?? "—"} · {row.status.replaceAll("_", " ")}
            </li>
          ))}
        </Queue>
        <Queue
          title="Duplicate candidate submissions"
          empty="No duplicate candidates."
        >
          {review.duplicateGroups.map((group, index) => (
            <li key={index}>
              Team {group[0].team_number} · {group.length} candidate records:{" "}
              {group.map((row) => row.client_submission_id).join(", ")}
            </li>
          ))}
        </Queue>
        <Queue
          title="Pit records needing review"
          empty="No pit records are marked needs review."
        >
          {review.needsReviewPits.map((row) => (
            <li key={row.team_number}>Team {row.team_number}</li>
          ))}
        </Queue>
        <Queue
          title="Current-schema failures"
          empty="All final records validate against the current game schema."
        >
          {review.schemaFailures.map((row) => (
            <li key={`${row.submissionKind}-${row.id}`}>
              <Link
                className="font-bold text-accent"
                href={submissionHref(row.submissionKind, row.id)}
              >
                {row.submissionKind} · Team {row.team_number}
              </Link>{" "}
              · stored schema v{row.schema_version}
            </li>
          ))}
        </Queue>
        <Queue
          title="Very-uncertain FUEL"
          empty="No final match records have very-uncertain FUEL."
        >
          {review.veryUncertain.map((row) => (
            <li key={row.id}>
              <Link
                className="font-bold text-accent"
                href={submissionHref("match", row.id)}
              >
                Team {row.team_number}
              </Link>{" "}
              ·{" "}
              {review.matchById
                .get(row.match_id)
                ?.tba_match_key.split("_")
                .at(-1)
                ?.toUpperCase()}
            </li>
          ))}
        </Queue>
      </div>
    </div>
  );
}

function Queue({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <Card>
      <h2 className="text-xl font-bold">{title}</h2>
      {items.length && items.some(Boolean) ? (
        <ul className="mt-3 list-disc space-y-2 pl-5">{children}</ul>
      ) : (
        <p className="mt-3 text-muted">{empty}</p>
      )}
    </Card>
  );
}
