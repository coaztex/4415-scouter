import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { eventTime } from "@/features/events/timezone";
import { getReviewSubmission } from "@/features/data-review/server/queries";
import {
  correctSubmissionAction,
  reviewSubmissionAction,
} from "@/features/data-review/server/actions";

export const metadata = { title: "Review scouting submission" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string; kind: string; submissionId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { eventKey, kind: rawKind, submissionId } = await params;
  if (rawKind !== "match" && rawKind !== "pit") notFound();
  const detail = await getReviewSubmission(eventKey, rawKind, submissionId);
  const message = (await searchParams).message;
  const submission = detail.submission as typeof detail.submission & {
    client_submission_id: string;
    team_number: number;
    game_slug: string;
    schema_version: number;
    game_data: unknown;
    revision: number;
    correction_provenance: string;
    corrected_by: string | null;
    updated_at: string;
  };
  return (
    <div className="space-y-5">
      <Link
        href={`/events/${eventKey}/data-review`}
        className={buttonStyles("secondary")}
      >
        ← Data review
      </Link>
      <PageHeading
        eyebrow={`Team ${submission.team_number}`}
        title="Submission correction review"
        description="Corrections preserve the original record in version history."
      />
      {message && (
        <p className="rounded-control border border-success p-3">{message}</p>
      )}
      <Card>
        <h2 className="text-xl font-bold">Why this record is here</h2>
        <p className="mt-2">
          {detail.review?.flag_reason ??
            "Opened from a quality-review signal or reconciliation contribution."}
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt>Review state</dt>
            <dd className="font-bold">
              {detail.review?.resolution.replaceAll("_", " ") ??
                "Not yet reviewed"}
            </dd>
          </div>
          <div>
            <dt>Canonical revision</dt>
            <dd className="font-bold">{submission.revision}</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd className="font-bold">
              {submission.correction_provenance.replaceAll("_", " ")}
            </dd>
          </div>
        </dl>
        {detail.match && (
          <p className="mt-3 text-sm text-muted">
            Match context: {detail.match.tba_match_key} · official TBA source{" "}
            {detail.match.raw_tba_payload ? "available" : "unavailable"}.
            Official totals do not identify an individual robot scorer.
          </p>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">Review disposition</h2>
          <p className="mt-1 text-sm text-muted">
            Review status does not change scouting data.
          </p>
          <form action={reviewSubmissionAction} className="mt-4 space-y-3">
            <Hidden eventKey={eventKey} kind={rawKind} id={submissionId} />
            <label className="block font-bold">
              Reason / review note
              <textarea
                name="reason"
                required
                maxLength={1000}
                className="mt-1 min-h-24 w-full rounded-control border border-border bg-background p-3"
                defaultValue={detail.review?.flag_reason ?? ""}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                name="resolution"
                value="reviewed_no_change"
                className={buttonStyles("primary")}
              >
                Reviewed — no change
              </button>
              <button
                name="resolution"
                value="video_review_requested"
                className={buttonStyles("secondary")}
              >
                Mark for video re-scout
              </button>
              {detail.review && (
                <button
                  name="resolution"
                  value="open"
                  className={buttonStyles("secondary")}
                >
                  Reopen review
                </button>
              )}
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Current human observation</h2>
          <p className="mt-1 text-sm text-muted">
            Client submission ID: {submission.client_submission_id}
          </p>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-control bg-background p-3 text-xs">
            {JSON.stringify(submission.game_data, null, 2)}
          </pre>
        </Card>
      </div>
      <Card>
        <h2 className="text-xl font-bold">
          Create corrected canonical revision
        </h2>
        <p className="mt-1 text-sm text-muted">
          Correct verified entry errors or video-reviewed observations only. Do
          not change observations to match official alliance FUEL.
        </p>
        <form action={correctSubmissionAction} className="mt-4 space-y-4">
          <Hidden eventKey={eventKey} kind={rawKind} id={submissionId} />
          <input type="hidden" name="revision" value={submission.revision} />
          <label className="block font-bold">
            Correction provenance
            <select
              name="provenance"
              className="mt-1 block min-h-12 rounded-control border border-border bg-background px-3"
            >
              <option value="manual_correction">
                Manual data-entry correction
              </option>
              <option value="video_rescout">Video-reviewed correction</option>
            </select>
          </label>
          <label className="block font-bold">
            Correction reason (optional)
            <textarea
              name="reason"
              maxLength={1000}
              className="mt-1 min-h-20 w-full rounded-control border border-border bg-background p-3"
            />
          </label>
          <label className="block font-bold">
            Validated current-schema JSON payload
            <textarea
              name="payload"
              required
              className="mt-1 min-h-96 w-full rounded-control border border-border bg-background p-3 font-mono text-sm"
              defaultValue={JSON.stringify(submission.game_data, null, 2)}
            />
          </label>
          <button className={buttonStyles("primary")}>
            Save correction and preserve prior revision
          </button>
        </form>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">Revision history</h2>
        <p className="mt-1 text-sm text-muted">
          Previous revisions · preserved after corrections.
        </p>
        <div className="mt-3 space-y-3">
          {detail.history.map((entry) => (
            <details
              key={entry.id}
              className="rounded-control border border-border p-3"
            >
              <summary className="font-bold">
                Revision {entry.revision} ·{" "}
                {entry.provenance.replaceAll("_", " ")} ·{" "}
                {eventTime(entry.recorded_at, detail.event.timezone) ??
                  "Time unavailable"}
              </summary>
              <p className="mt-2 text-sm">
                Reason: {entry.correction_reason || "Not provided"}
              </p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-control bg-background p-3 text-xs">
                {JSON.stringify(entry.snapshot, null, 2)}
              </pre>
            </details>
          ))}
          {!detail.history.length && (
            <p className="text-muted">
              No corrections have superseded this original submission.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Hidden({
  eventKey,
  kind,
  id,
}: {
  eventKey: string;
  kind: string;
  id: string;
}) {
  return (
    <>
      <input type="hidden" name="eventKey" value={eventKey} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
    </>
  );
}
