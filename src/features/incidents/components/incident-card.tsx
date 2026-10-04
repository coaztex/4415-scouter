import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  causeSourceLabels,
  issueLabels,
  statusLabels,
  type IncidentDisplay,
} from "../model";
import { ReviewForm } from "./review-form";

export function IncidentCard({
  incident,
  eventKey,
  reviewable = false,
}: {
  incident: IncidentDisplay;
  eventKey: string;
  reviewable?: boolean;
}) {
  const match = incident.match_key.split("_").at(-1)?.toUpperCase() ?? "Match";
  const recordHref = `/events/${encodeURIComponent(eventKey)}/teams/${incident.team_number}/matches/${incident.created_from_submission_id}`;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">
            {match} · Team {incident.team_number}
          </h3>
          {incident.team_name && (
            <p className="text-sm text-muted">{incident.team_name}</p>
          )}
        </div>
        <Badge>
          {incident.reviewed_at
            ? causeSourceLabels[incident.cause_source]
            : "Unconfirmed"}
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="font-bold">Scout observation</h4>
          <p>Status: {statusLabels[incident.observed_status]}</p>
          <p>
            Observed issue:{" "}
            {incident.observed_issue
              ? issueLabels[incident.observed_issue]
              : "No issue category recorded"}
          </p>
          {incident.observed_phase && (
            <p>
              When: {incident.observed_phase.toUpperCase()}
              {incident.observed_at_seconds == null
                ? ""
                : ` · about ${incident.observed_at_seconds}s`}
            </p>
          )}
          {incident.observed_note && (
            <p className="mt-2 whitespace-pre-wrap">{incident.observed_note}</p>
          )}
          <p className="text-sm text-muted">
            Recovered: {incident.recovered} · recorded{" "}
            {new Date(incident.created_at).toLocaleString()}
          </p>
        </div>
        <div className="border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <h4 className="font-bold">Later confirmation</h4>
          {incident.confirmed_cause ? (
            <>
              <p>{incident.confirmed_cause}</p>
              <p className="text-sm text-muted">
                {causeSourceLabels[incident.cause_source]} ·{" "}
                {incident.reviewer_name ?? "Reviewer"} ·{" "}
                {incident.reviewed_at
                  ? new Date(incident.reviewed_at).toLocaleString()
                  : ""}
              </p>
              {incident.cause_evidence && (
                <p className="mt-2 text-sm">
                  Evidence: {incident.cause_evidence}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              No cause confirmed. The observed symptom remains available for
              review.
            </p>
          )}
        </div>
      </div>
      <Link
        className="inline-block font-bold text-accent underline-offset-2 hover:underline"
        href={recordHref}
      >
        Read original scouting record →
      </Link>
      {reviewable && !incident.reviewed_at && (
        <ReviewForm eventKey={eventKey} incidentId={incident.id} />
      )}
    </Card>
  );
}
