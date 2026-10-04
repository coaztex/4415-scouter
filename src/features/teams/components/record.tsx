import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deriveActivity } from "@/games/2026-rebuilt/activity";
import { formatNumber, fuelTotal, roleLabels } from "../model";
import type { RebuiltMatchData } from "@/games/2026-rebuilt/match-schema";
import {
  causeSourceLabels,
  type IncidentDisplay,
} from "@/features/incidents/model";
const pretty = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export function ScoutingRecord({
  data,
  incidents = [],
}: {
  data: RebuiltMatchData;
  incidents?: readonly IncidentDisplay[];
}) {
  const activity = data.teleop.activity
    ? deriveActivity(data.teleop.activity)
    : null;
  const abnormal =
    data.post_match.reliability !== "normal" ||
    data.post_match.fuel_estimate_confidence === "very_uncertain" ||
    (data.issues?.length ?? 0) > 0;
  return (
    <div className="space-y-5">
      {abnormal && (
        <p className="rounded-control border border-warning bg-surface p-3">
          <strong>Review context:</strong> this match contains an issue,
          incomplete reliability status, or very-uncertain FUEL estimate.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">FUEL estimates</h2>
          <dl className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <dt>AUTO</dt>
              <dd className="text-2xl font-bold">
                {formatNumber(data.auto.estimated_fuel_scored, 0)}
              </dd>
            </div>
            <div>
              <dt>TELEOP</dt>
              <dd className="text-2xl font-bold">
                {formatNumber(data.teleop.estimated_fuel_scored, 0)}
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className="text-2xl font-bold">
                {formatNumber(fuelTotal(data), 0)}
              </dd>
            </div>
          </dl>
          <p className="mt-3">
            Confidence:{" "}
            <strong>{pretty(data.post_match.fuel_estimate_confidence)}</strong>
          </p>
          {data.post_match.fuel_estimate_confidence === "very_uncertain" && (
            <p className="mt-2 text-sm text-muted">
              Visible here, excluded from default team FUEL aggregates.
            </p>
          )}
          {(data.post_match.reliability === "DNS" ||
            data.post_match.reliability === "DNF") && (
            <p className="mt-2 text-sm text-muted">
              Availability status is counted in reliability; this partial or
              absent output is excluded from default offensive averages.
            </p>
          )}
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Observed match summary</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt>Primary role</dt>
              <dd className="font-bold">
                {roleLabels[data.post_match.observed_role]}
              </dd>
            </div>
            <div>
              <dt>Reliability</dt>
              <dd className="font-bold">
                {pretty(data.post_match.reliability)}
              </dd>
            </div>
            <div>
              <dt>Defense effect</dt>
              <dd className="font-bold">
                {data.post_match.defense_effectiveness
                  ? pretty(data.post_match.defense_effectiveness)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Driver control</dt>
              <dd className="font-bold">
                {data.post_match.driver_control
                  ? pretty(data.post_match.driver_control)
                  : "—"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
      <Card>
        <h2 className="text-xl font-bold">Activity timeline summary</h2>
        {activity ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <p>
              Scoring{" "}
              <strong className="block">
                {formatNumber(activity.seconds.scoring)} sec
              </strong>
            </p>
            <p>
              Shuttling / passing{" "}
              <strong className="block">
                {formatNumber(activity.seconds.shuttling_passing)} sec
              </strong>
            </p>
            <p>
              Defending{" "}
              <strong className="block">
                {formatNumber(activity.seconds.defending)} sec
              </strong>
            </p>
            <p>
              Other / idle{" "}
              <strong className="block">
                {formatNumber(activity.seconds.other_idle)} sec
              </strong>
            </p>
          </div>
        ) : (
          <p className="mt-3 text-muted">
            Activity timing was not recorded or was deliberately omitted.
          </p>
        )}
      </Card>
      {incidents.some((incident) => incident.confirmed_cause) && (
        <Card>
          <h2 className="text-xl font-bold">Later confirmed causes</h2>
          <p className="mt-1 text-sm text-muted">
            These reviewer findings do not change the scout observations above.
          </p>
          <div className="mt-3 space-y-3">
            {incidents
              .filter((incident) => incident.confirmed_cause)
              .map((incident) => (
                <div
                  key={incident.id}
                  className="rounded-control bg-background p-3"
                >
                  <strong>{incident.confirmed_cause}</strong>
                  <p className="text-sm text-muted">
                    {causeSourceLabels[incident.cause_source]} ·{" "}
                    {incident.reviewer_name ?? "Reviewer"}
                  </p>
                  {incident.cause_evidence && (
                    <p className="text-sm">
                      Evidence: {incident.cause_evidence}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </Card>
      )}
      <Card>
        <h2 className="text-xl font-bold">AUTO observations</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>Start: {pretty(data.auto.start_position)}</Badge>
          <Badge>
            Execution:{" "}
            {data.auto.execution_result
              ? pretty(data.auto.execution_result)
              : "Unknown"}
          </Badge>
          <Badge>
            Collected additional FUEL:{" "}
            {pretty(data.auto.collected_additional_fuel)}
          </Badge>
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">Observed issues</h2>
        {data.issues?.length ? (
          <div className="mt-3 space-y-3">
            {data.issues.map((issue) => (
              <div key={issue.id} className="rounded-control bg-background p-3">
                <strong>{pretty(issue.observed.category)}</strong>
                <p className="text-sm">
                  {pretty(issue.phase)}
                  {issue.at_seconds == null
                    ? ""
                    : ` · about ${formatNumber(issue.at_seconds)} sec`}
                </p>
                {issue.observed.description && (
                  <p>{issue.observed.description}</p>
                )}
                <p className="text-sm text-muted">
                  Recovered:{" "}
                  {issue.recovered ? pretty(issue.recovered) : "Unknown"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-muted">No issue events recorded.</p>
        )}
      </Card>
      {data.post_match.important_note && (
        <Card>
          <h2 className="text-xl font-bold">Important note</h2>
          <p className="mt-3">{data.post_match.important_note}</p>
        </Card>
      )}
    </div>
  );
}
