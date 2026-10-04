import "server-only";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { getEvent } from "@/features/events/server/queries";
import { getGameModule } from "@/games/registry";
import { rebuiltMatchSchema } from "@/games/2026-rebuilt/match-schema";
import { reconcileAlliance2026 } from "@/games/2026-rebuilt/reconciliation";
import { matchSchema as tbaMatchSchema } from "@/lib/tba/schemas";
import {
  discrepancyMagnitude,
  duplicateCandidateGroups,
  isAbnormal,
  needsFuelReview,
  needsSchemaReview,
} from "../model";

type ReviewOptions = { sort?: string; flagged?: string };

export async function getDataReview(eventKey: string, options: ReviewOptions) {
  const { db } = await requireRole("strategy");
  const event = await getEvent(eventKey);
  const [assignments, pits, matchRows, pitRows, matches, conflicts, reviews] =
    await Promise.all([
      db
        .from("scouting_assignments")
        .select("id,match_id,team_number,status,scout_user_id")
        .eq("event_id", event.id)
        .eq("assignment_type", "match")
        .in("status", ["assigned", "in_progress", "missed"]),
      db
        .from("event_teams")
        .select("team_number,pit_status")
        .eq("event_id", event.id)
        .eq("pit_status", "needs_review"),
      db
        .from("match_scouting_submissions")
        .select(
          "id,client_submission_id,event_id,match_id,team_number,scout_user_id,game_slug,schema_version,game_data,revision,correction_provenance,completed_at",
        )
        .eq("event_id", event.id)
        .eq("status", "final"),
      db
        .from("pit_scouting_submissions")
        .select(
          "id,client_submission_id,event_id,team_number,scout_user_id,game_slug,schema_version,game_data,revision,correction_provenance,completed_at",
        )
        .eq("event_id", event.id)
        .eq("status", "final"),
      db
        .from("matches")
        .select("id,tba_match_key,raw_tba_payload,actual_time")
        .eq("event_id", event.id),
      db
        .from("scouting_sync_conflicts")
        .select(
          "id,submission_kind,client_submission_id,assignment_id,match_id,team_number,kind,status,attempted_payload,created_at",
        )
        .eq("event_id", event.id)
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      db
        .from("scouting_submission_reviews")
        .select(
          "id,submission_kind,match_submission_id,pit_submission_id,resolution,flag_reason,updated_at",
        )
        .eq("event_id", event.id),
    ]);
  for (const result of [
    assignments,
    pits,
    matchRows,
    pitRows,
    matches,
    conflicts,
    reviews,
  ])
    if (result.error) throw new Error("Data review queue is unavailable.");

  const schemaFailures = [
    ...(matchRows.data ?? []).flatMap((row) => {
      try {
        const current = getGameModule(row.game_slug);
        const parsed = current.matchSchema.safeParse(row.game_data);
        return !needsSchemaReview(
          row.schema_version,
          current.schemaVersion,
          parsed.success,
        )
          ? []
          : [{ ...row, submissionKind: "match" as const }];
      } catch {
        return [{ ...row, submissionKind: "match" as const }];
      }
    }),
    ...(pitRows.data ?? []).flatMap((row) => {
      try {
        const current = getGameModule(row.game_slug);
        const parsed = current.pitSchema.safeParse(row.game_data);
        return !needsSchemaReview(
          row.schema_version,
          current.schemaVersion,
          parsed.success,
        )
          ? []
          : [{ ...row, submissionKind: "pit" as const }];
      } catch {
        return [{ ...row, submissionKind: "pit" as const }];
      }
    }),
  ];

  const validMatchRows = (matchRows.data ?? []).flatMap((row) => {
    const parsed = rebuiltMatchSchema.safeParse(row.game_data);
    return row.game_slug === "2026-rebuilt" &&
      row.schema_version === 2 &&
      parsed.success
      ? [{ ...row, data: parsed.data }]
      : [];
  });
  const matchById = new Map(
    (matches.data ?? []).map((match) => [match.id, match]),
  );
  let reconciliations = (matches.data ?? []).flatMap((match) => {
    if (!match.actual_time || !match.raw_tba_payload) return [];
    const officialMatch = tbaMatchSchema.safeParse(match.raw_tba_payload);
    if (!officialMatch.success) return [];
    return (["red", "blue"] as const).flatMap((alliance) => {
      const roster = new Set(
        officialMatch.data.alliances[alliance].team_keys.map((key) =>
          Number(key.slice(3)),
        ),
      );
      const rows = validMatchRows.filter(
        (row) => row.match_id === match.id && roster.has(row.team_number),
      );
      let result;
      try {
        result = reconcileAlliance2026(
          officialMatch.data,
          alliance,
          rows.map((row) => ({
            id: row.id,
            eventKey: event.tba_key,
            matchKey: match.tba_match_key,
            teamNumber: row.team_number,
            schemaVersion: 2 as const,
            data: row.data,
          })),
        );
      } catch {
        return [];
      }
      if (result.status !== "ready") return [];
      const contributions = rows
        .filter((row) => result.contributingSubmissionIds.includes(row.id))
        .map((row) => ({
          id: row.id,
          clientSubmissionId: row.client_submission_id,
          teamNumber: row.team_number,
          confidence: row.data.post_match.fuel_estimate_confidence,
          reliability: row.data.post_match.reliability,
          abnormal: isAbnormal(row.data),
        }));
      const phases = [result.auto, result.teleop, result.total];
      return [
        {
          ...result,
          matchId: match.id,
          magnitude: discrepancyMagnitude(phases),
          needsReview: needsFuelReview(phases),
          contributions,
        },
      ];
    });
  });
  if (options.flagged === "1")
    reconciliations = reconciliations.filter((row) => row.needsReview);
  if (options.sort === "match")
    reconciliations.sort((a, b) => a.matchKey.localeCompare(b.matchKey));
  else reconciliations.sort((a, b) => b.magnitude - a.magnitude);

  return {
    event,
    assignments: (assignments.data ?? []).filter(
      (row) =>
        row.status === "missed" ||
        (row.match_id !== null &&
          Boolean(matchById.get(row.match_id)?.actual_time)),
    ),
    needsReviewPits: pits.data ?? [],
    conflicts: conflicts.data ?? [],
    duplicateGroups: duplicateCandidateGroups([
      ...(matchRows.data ?? []).map((row) => ({
        ...row,
        match_id: row.match_id,
      })),
      ...(pitRows.data ?? []),
    ]),
    schemaFailures,
    veryUncertain: validMatchRows.filter(
      (row) =>
        row.data.post_match.fuel_estimate_confidence === "very_uncertain",
    ),
    reconciliations,
    reviews: reviews.data ?? [],
    matchById,
  };
}

export async function getReviewSubmission(
  eventKey: string,
  kind: "match" | "pit",
  submissionId: string,
) {
  const { db } = await requireRole("strategy");
  const event = await getEvent(eventKey);
  const table =
    kind === "match"
      ? "match_scouting_submissions"
      : "pit_scouting_submissions";
  const result = await db
    .from(table)
    .select("*")
    .eq("id", submissionId)
    .eq("event_id", event.id)
    .eq("status", "final")
    .maybeSingle();
  if (result.error) throw new Error("Submission review is unavailable.");
  if (!result.data) notFound();
  const [history, review, match] = await Promise.all([
    db
      .from("scouting_submission_revisions")
      .select(
        "id,revision,snapshot,editor_user_id,correction_reason,provenance,recorded_at",
      )
      .eq(
        kind === "match" ? "match_submission_id" : "pit_submission_id",
        submissionId,
      )
      .order("revision", { ascending: false }),
    db
      .from("scouting_submission_reviews")
      .select("resolution,flag_reason,resolved_by,resolved_at,updated_at")
      .eq(
        kind === "match" ? "match_submission_id" : "pit_submission_id",
        submissionId,
      )
      .maybeSingle(),
    kind === "match"
      ? db
          .from("matches")
          .select("tba_match_key,actual_time,raw_tba_payload")
          .eq("id", (result.data as { match_id: string }).match_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (history.error || review.error || match.error)
    throw new Error("Submission review context is unavailable.");
  return {
    event,
    kind,
    submission: result.data,
    history: history.data ?? [],
    review: review.data,
    match: match.data,
  };
}
