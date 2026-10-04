import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rebuiltMatchSchema,
  matchCaptureConfig,
} from "../src/games/2026-rebuilt/legacy/v1/match-schema";
import { rebuiltPitSchema } from "../src/games/2026-rebuilt/legacy/v1/pit-schema";
import { matchData, pitData } from "./fixtures/rebuilt-v1";

test("match accepts zeros and explicit unknowns without coercing missing observations", () => {
  assert.equal(rebuiltMatchSchema.parse(matchData()).auto.fuelScored, 0);
  const data = matchData();
  data.auto = { fuelScored: null, shuffleCount: null, movement: null };
  data.teleop = { fuelScored: null, shuffleCount: null };
  data.postMatch = { defense: null, reliability: null };
  assert.deepEqual(rebuiltMatchSchema.parse(data), data);
  assert.deepEqual(matchCaptureConfig.fuelIncrements, [5, 10, 20]);
  assert.equal(matchCaptureConfig.allowUndo, true);
  for (const fuelScored of [-1, 1.2, "0", NaN, Infinity, undefined]) {
    assert.equal(
      rebuiltMatchSchema.safeParse({
        ...matchData(),
        auto: { ...matchData().auto, fuelScored },
      }).success,
      false,
    );
  }
  assert.equal(
    rebuiltMatchSchema.safeParse({ ...matchData(), passing: 1 }).success,
    false,
  );
});

test("defense effectiveness is required only when defense is observed", () => {
  for (const defense of [
    { amount: "some" },
    { amount: "heavy" },
    { amount: "none", effectiveness: "poor" },
  ]) {
    assert.equal(
      rebuiltMatchSchema.safeParse({
        ...matchData(),
        postMatch: { ...matchData().postMatch, defense },
      }).success,
      false,
    );
  }
  for (const amount of ["some", "heavy"] as const) {
    assert.ok(
      rebuiltMatchSchema.safeParse({
        ...matchData(),
        postMatch: {
          ...matchData().postMatch,
          defense: { amount, effectiveness: "okay" },
        },
      }).success,
    );
  }
});

test("shuffle observations preserve occurrence timing and reject inconsistent counts/IDs", () => {
  const data = matchData();
  data.auto.shuffleCount = 2;
  data.shuffleEvents = [
    { id: "10000000-0000-4000-8000-000000000001", phase: "auto", atSeconds: 0 },
  ];
  assert.equal(rebuiltMatchSchema.parse(data).shuffleEvents?.[0].atSeconds, 0);
  data.auto.shuffleCount = 0;
  assert.equal(rebuiltMatchSchema.safeParse(data).success, false);
  data.auto.shuffleCount = null;
  assert.equal(rebuiltMatchSchema.safeParse(data).success, false);
  data.auto.shuffleCount = 2;
  data.shuffleEvents.push({ ...data.shuffleEvents[0] });
  assert.equal(rebuiltMatchSchema.safeParse(data).success, false);
  data.shuffleEvents.pop();
  data.shuffleEvents[0].atSeconds = -1;
  assert.equal(rebuiltMatchSchema.safeParse(data).success, false);
});

test("observed issues do not require a diagnosis; confirmed causes require provenance", () => {
  const data = matchData();
  data.issues = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      phase: "teleop",
      atSeconds: null,
      observed: { category: "disabled" },
      recovered: "unknown",
    },
  ];
  assert.ok(rebuiltMatchSchema.safeParse(data).success);
  assert.equal(
    rebuiltMatchSchema.safeParse({
      ...data,
      issues: [
        { ...data.issues[0], confirmedCause: { category: "communications" } },
      ],
    }).success,
    false,
  );
  data.issues[0].confirmedCause = {
    category: "communications",
    evidence: "Confirmed by team after inspection",
    confirmedByUserId: "30000000-0000-4000-8000-000000000001",
    confirmedAt: "2026-03-10T12:00:00Z",
  };
  assert.ok(rebuiltMatchSchema.safeParse(data).success);
  assert.equal(
    rebuiltMatchSchema.parse(data).issues?.[0].observed.category,
    "disabled",
  );
});

test("climb stays optional and DNS cannot include positive field actions", () => {
  const data = matchData();
  data.postMatch.climb = { observation: "attempted", achievedLevel: "level_2" };
  assert.ok(rebuiltMatchSchema.safeParse(data).success);
  assert.equal(
    rebuiltMatchSchema.safeParse({
      ...data,
      postMatch: {
        ...data.postMatch,
        climb: { observation: "not_observed", achievedLevel: "level_2" },
      },
    }).success,
    false,
  );
  data.postMatch.reliability = "DNS";
  assert.equal(rebuiltMatchSchema.safeParse(data).success, false);
  delete data.postMatch.climb;
  assert.ok(rebuiltMatchSchema.safeParse(data).success);
  data.auto.fuelScored = 5;
  assert.equal(rebuiltMatchSchema.safeParse(data).success, false);
});

test("pit accepts concise multi-routine capture and optional volunteered details", () => {
  const data = pitData();
  data.fuelCapacity = { band: "low", volunteeredExact: 0 };
  data.preferredScoringAreas = ["close", "far"];
  data.traversal = ["trench", "bump"];
  data.climbing = { capability: "yes", highestDemonstratedLevel: "level_3" };
  data.autonomousRoutines = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      startSide: "left",
      scoresFuel: "yes",
      collectsAdditionalFuel: "yes",
      reliabilityClaim: "consistent",
      climb: "no",
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      startSide: "unknown",
      scoresFuel: "unknown",
      collectsAdditionalFuel: "no",
      reliabilityClaim: "untested",
    },
  ];
  assert.deepEqual(rebuiltPitSchema.parse(data), data);
  assert.equal(
    rebuiltPitSchema.safeParse({
      ...data,
      preferredScoringAreas: ["close", "close"],
    }).success,
    false,
  );
  assert.equal(
    rebuiltPitSchema.safeParse({ ...data, traversal: ["unknown", "bump"] })
      .success,
    false,
  );
  assert.equal(
    rebuiltPitSchema.safeParse({
      ...data,
      climbing: { capability: "none", highestDemonstratedLevel: "level_1" },
    }).success,
    false,
  );
  assert.equal(
    rebuiltPitSchema.safeParse({
      ...data,
      autonomousRoutines: [
        data.autonomousRoutines[0],
        data.autonomousRoutines[0],
      ],
    }).success,
    false,
  );
  assert.equal(
    rebuiltPitSchema.safeParse({
      ...data,
      photoMediaIds: ["https://example.com/signed-photo"],
    }).success,
    false,
  );
});
