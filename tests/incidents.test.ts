import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmIncidentSchema,
  enrichIncidents,
  notableIncident,
  recentReliabilityFlag,
  type IncidentRow,
} from "../src/features/incidents/model";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function observation(
  match: number,
  status: IncidentRow["observed_status"],
): IncidentRow {
  return {
    id: id(match),
    event_id: id(100),
    match_id: id(match + 200),
    team_number: 254,
    created_from_submission_id: id(match + 300),
    observed_status: status,
    observed_issue: status === "normal" ? "intake" : null,
    observed_phase: null,
    observed_at_seconds: null,
    observed_note: "Observed symptom",
    recovered: "unknown",
    confirmed_cause: null,
    cause_source: "unconfirmed",
    cause_evidence: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

test("incident projection preserves scout observation and separately labels later confirmation", () => {
  const old = observation(2, "DNF");
  const reviewed = {
    ...old,
    confirmed_cause: "Team described a disconnected cable",
    cause_source: "team_confirmed" as const,
    cause_evidence: "Pit conversation after QM2",
    reviewed_by: id(500),
    reviewed_at: "2026-01-02T00:00:00Z",
  };
  const rows = enrichIncidents(
    [reviewed, observation(1, "minor_issue")],
    new Map([
      [
        id(201),
        {
          tba_match_key: "2026test_qm1",
          match_number: 1,
          set_number: 1,
          comp_level: "qm",
        },
      ],
      [
        id(202),
        {
          tba_match_key: "2026test_qm2",
          match_number: 2,
          set_number: 1,
          comp_level: "qm",
        },
      ],
    ]),
    new Map([[254, { nickname: "Cheesy Poofs" }]]),
    new Map([[id(500), "Reviewer"]]),
  );
  assert.deepEqual(
    rows.map((row) => row.match_key),
    ["2026test_qm1", "2026test_qm2"],
  );
  assert.equal(rows[1].observed_note, "Observed symptom");
  assert.equal(rows[1].confirmed_cause, "Team described a disconnected cable");
  assert.equal(rows[1].cause_source, "team_confirmed");
  assert.equal(rows[1].reviewer_name, "Reviewer");
  assert.equal(notableIncident(observation(3, "normal")), true);
  assert.equal(recentReliabilityFlag(rows, [id(201)]), false);
  assert.equal(recentReliabilityFlag(rows, [id(202)]), true);
});

test("confirmation requires a documented source and cannot claim unconfirmed", () => {
  const valid = {
    eventKey: "2026test",
    incidentId: id(2),
    cause: "Cable loose",
    source: "team_confirmed",
    evidence: "Team pit conversation",
  };
  assert.equal(confirmIncidentSchema.safeParse(valid).success, true);
  assert.equal(
    confirmIncidentSchema.safeParse({ ...valid, source: "unconfirmed" })
      .success,
    false,
  );
  assert.equal(
    confirmIncidentSchema.safeParse({ ...valid, evidence: " " }).success,
    false,
  );
});
