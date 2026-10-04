import { z } from "zod";
import type { Database } from "@/types/database";
export const incidentColumns =
  "id,event_id,match_id,team_number,created_from_submission_id,observed_status,observed_issue,observed_phase,observed_at_seconds,observed_note,recovered,confirmed_cause,cause_source,cause_evidence,reviewed_by,reviewed_at,created_at";

export const causeSourceLabels = {
  unconfirmed: "Unconfirmed",
  team_confirmed: "Team-confirmed",
  strategy_confirmed: "Strategy-confirmed",
  other: "Other confirmed source",
} as const;
export const statusLabels = {
  normal: "Normal",
  minor_issue: "Minor issue",
  major_issue: "Major issue",
  DNF: "DNF",
  DNS: "DNS",
} as const;
export const issueLabels = {
  disabled: "Disabled / no movement",
  communications: "Communications",
  drivetrain: "Drivetrain impaired",
  intake: "Intake issue",
  shooter_scorer: "Scorer / shooter issue",
  tipped: "Tipped",
  other: "Other observed issue",
} as const;
export const confirmIncidentSchema = z.strictObject({
  eventKey: z.string().regex(/^\d{4}[a-z0-9]+$/),
  incidentId: z.uuid(),
  cause: z.string().trim().min(1).max(500),
  source: z.enum(["team_confirmed", "strategy_confirmed", "other"]),
  evidence: z.string().trim().min(1).max(1000),
});

export type IncidentDisplay = {
  id: string;
  event_id: string;
  match_id: string;
  team_number: number;
  created_from_submission_id: string;
  observed_status: keyof typeof statusLabels;
  observed_issue: keyof typeof issueLabels | null;
  observed_phase: string | null;
  observed_at_seconds: number | null;
  observed_note: string | null;
  recovered: string;
  confirmed_cause: string | null;
  cause_source: keyof typeof causeSourceLabels;
  cause_evidence: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  match_key: string;
  match_order: number;
  team_name: string | null;
  reviewer_name: string | null;
};
export type IncidentRow = Pick<
  Database["public"]["Tables"]["team_incidents"]["Row"],
  | "id"
  | "event_id"
  | "match_id"
  | "team_number"
  | "created_from_submission_id"
  | "observed_status"
  | "observed_issue"
  | "observed_phase"
  | "observed_at_seconds"
  | "observed_note"
  | "recovered"
  | "confirmed_cause"
  | "cause_source"
  | "cause_evidence"
  | "reviewed_by"
  | "reviewed_at"
  | "created_at"
>;

export function enrichIncidents(
  incidents: readonly IncidentRow[],
  matches: ReadonlyMap<
    string,
    {
      tba_match_key: string;
      match_number: number;
      set_number: number;
      comp_level: string;
    }
  >,
  teams: ReadonlyMap<number, { nickname: string | null }>,
  reviewers: ReadonlyMap<string, string>,
): IncidentDisplay[] {
  return incidents
    .map((incident) => {
      const match = matches.get(incident.match_id);
      return {
        ...incident,
        match_key: match?.tba_match_key ?? "Match unavailable",
        match_order: match
          ? ({ qm: 0, ef: 1, qf: 2, sf: 3, f: 4 }[match.comp_level] ?? 5) *
              10000 +
            match.set_number * 100 +
            match.match_number
          : Number.MAX_SAFE_INTEGER,
        team_name: teams.get(incident.team_number)?.nickname ?? null,
        reviewer_name: incident.reviewed_by
          ? (reviewers.get(incident.reviewed_by) ?? "Team member")
          : null,
      };
    })
    .sort(
      (a, b) =>
        a.match_order - b.match_order ||
        a.match_key.localeCompare(b.match_key) ||
        a.created_at.localeCompare(b.created_at),
    );
}

/** The availability signal is separate from offensive FUEL observations. */
export function notableIncident(
  incident: Pick<IncidentDisplay, "observed_status" | "observed_issue">,
) {
  return (
    incident.observed_status !== "normal" || incident.observed_issue !== null
  );
}

export function recentReliabilityFlag(
  incidents: readonly IncidentDisplay[],
  recentMatchIds: readonly string[],
) {
  const recent = new Set(recentMatchIds);
  return incidents.some(
    (incident) =>
      recent.has(incident.match_id) &&
      (incident.observed_status === "major_issue" ||
        incident.observed_status === "DNF" ||
        incident.observed_status === "DNS"),
  );
}
