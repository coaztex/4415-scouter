import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  advancePhase,
  parseBoardImport,
  MAX_BOARD_IMPORT_BYTES,
  boardDraftKey,
  boardDraftSchema,
  boardSchema,
  duplicatePhase,
  moveDrawing,
  phaseHasEdits,
  validateBoard,
} from "../src/features/strategy-board/model";
import { boardFixture, boardId } from "./fixtures/strategy-board";
import { readDraft, writeDraft } from "../src/features/offline/store";
test("approved PNG is byte-identical and game viewport uses its exact intrinsic ratio", () => {
  const f = boardFixture(),
    asset = readFileSync(`public${f.config.field.backgroundAsset}`);
  assert.equal(asset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const width = asset.readUInt32BE(16),
    height = asset.readUInt32BE(20);
  assert.deepEqual([width, height], [7992, 3240]);
  assert.equal(
    createHash("sha256").update(asset).digest("hex"),
    "8f7a3bdfa9ec8eef4522261fe9e699eaff66ef4d239b35e267cfc596bb693576",
  );
  assert.ok(
    Math.abs(f.config.field.width / f.config.field.height - width / height) <
      1e-12,
  );
  assert.equal(f.config.field.width, 1000);
});
test("game module supplies seven phases and official station/team identity", () => {
  const f = boardFixture();
  assert.deepEqual(
    f.config.phases.map((p) => p.label),
    [
      "Auto",
      "Transition",
      "Active HUB 1",
      "Inactive HUB 1",
      "Active HUB 2",
      "Inactive HUB 2",
      "Endgame",
    ],
  );
  assert.deepEqual(
    f.document.phases.auto.markers.map((m) => [m.station, m.teamNumber]),
    [
      ["R1", 700],
      ["R2", 50],
      ["R3", 1000],
      ["B1", 900],
      ["B2", 20],
      ["B3", 300],
    ],
  );
  assert.equal(f.config.field.backgroundAsset, "/fields/2026-field-gray.png");
  assert.notEqual(
    f.document.phases.auto.markers,
    f.document.phases.transition.markers,
  );
});
test("phase documents and notes persist independently through typed JSON reload", () => {
  const f = boardFixture(),
    doc = f.document;
  doc.phases.auto.notes = "Auto only";
  doc.phases.auto.markers[0].position = { x: 0.4, y: 0.5 };
  doc.phases.auto.objects.push({
    id: boardId(1),
    phaseId: "auto",
    type: "arrow",
    ownerStation: "R1",
    ownerTeamNumber: 700,
    start: { x: 0.1, y: 0.2 },
    end: { x: 0.5, y: 0.8 },
  });
  const loaded = validateBoard(
    JSON.parse(JSON.stringify(doc)),
    f.gameSlug,
    f.config,
    f.lineup,
  );
  assert.equal(loaded.phases.auto.notes, "Auto only");
  assert.equal(loaded.phases.transition.notes, "");
  assert.equal(loaded.phases.transition.objects.length, 0);
  assert.equal(loaded.phases.transition.markers[0].position.x, 0.12);
  assert.equal(loaded.phases.auto.markers[0].position.x, 0.4);
});
test("duplicate phase assigns new IDs, keeps current notes and creates independently editable geometry", () => {
  const f = boardFixture(),
    doc = f.document;
  doc.phases.auto.objects = [
    {
      id: boardId(1),
      phaseId: "auto",
      type: "freehand",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      ownerStation: null,
      ownerTeamNumber: null,
    },
  ];
  doc.phases.transition.notes = "Transition notes";
  assert.ok(
    phaseHasEdits(
      doc.phases.transition,
      boardFixture().document.phases.transition,
    ),
  );
  const copied = duplicatePhase(doc, "auto", "transition", () => boardId(2));
  assert.equal(copied.phases.transition.objects[0].id, boardId(2));
  assert.equal(copied.phases.transition.objects[0].phaseId, "transition");
  assert.equal(copied.phases.transition.notes, "Transition notes");
  copied.phases.transition.markers[0].position.x = 0.9;
  assert.equal(doc.phases.auto.markers[0].position.x, 0.12);
  assert.equal(
    validateBoard(copied, f.gameSlug, f.config, f.lineup).phases.auto.objects
      .length,
    1,
  );
});
test("invalid versions, phases, station teams and drawing owners fail validation", () => {
  const f = boardFixture();
  assert.equal(
    boardSchema.safeParse({ ...f.document, schemaVersion: 2 }).success,
    false,
  );
  const invalid = structuredClone(f.document);
  invalid.phases.auto.markers[0].teamNumber = 999;
  assert.throws(
    () => validateBoard(invalid, f.gameSlug, f.config, f.lineup),
    /stations/,
  );
  const invalidPhase = structuredClone(f.document);
  delete invalidPhase.phases.auto;
  assert.throws(
    () => validateBoard(invalidPhase, f.gameSlug, f.config, f.lineup),
    /phases/,
  );
  const wrongOwner = structuredClone(f.document);
  wrongOwner.phases.auto.objects.push({
    id: boardId(1),
    phaseId: "transition",
    type: "text",
    ownerStation: "R1",
    ownerTeamNumber: 999,
    position: { x: 0.2, y: 0.2 },
    text: "Plan",
  });
  assert.throws(
    () => validateBoard(wrongOwner, f.gameSlug, f.config, f.lineup),
    /identity/,
  );
});
test("manual Live phase stepping is bounded; initial game phase is Auto", () => {
  const { config } = boardFixture();
  assert.equal(config.phases[0].id, "auto");
  assert.equal(advancePhase(config, "auto", -1), "auto");
  assert.equal(advancePhase(config, "auto", 1), "transition");
  assert.equal(advancePhase(config, "endgame", 1), "endgame");
});
test("drawing movement preserves IDs and clamps geometry without distorting lines", () => {
  const object = {
    id: boardId(1),
    phaseId: "auto",
    type: "line" as const,
    ownerStation: null,
    ownerTeamNumber: null,
    start: { x: 0.2, y: 0.4 },
    end: { x: 0.8, y: 0.6 },
  };
  const moved = moveDrawing(object, 0.5, -0.5);
  assert.equal(moved.id, object.id);
  assert.ok(moved.type === "line");
  assert.deepEqual(moved.end, { x: 1, y: 0.19999999999999996 });
  assert.equal(object.end.x, 0.8);
});
test("shared device draft store isolates account/event/match and rejects stale-tab writes", async () => {
  const f = boardFixture(91),
    other = boardFixture(92);
  const key = boardDraftKey(f.actorId, f.eventId, f.matchId),
    otherKey = boardDraftKey(other.actorId, other.eventId, other.matchId);
  f.document.phases.auto.notes = "Offline plan";
  const value = JSON.stringify({
    eventId: f.eventId,
    matchId: f.matchId,
    matchKey: f.matchKey,
    baseRevision: 0,
    document: f.document,
  });
  await writeDraft(key, f.actorId, value, 0);
  assert.equal(
    boardDraftSchema.parse(JSON.parse((await readDraft(key, f.actorId))!.value))
      .document.phases.auto.notes,
    "Offline plan",
  );
  assert.equal(await readDraft(otherKey, other.actorId), undefined);
  await assert.rejects(readDraft(key, boardId(999)));
  await assert.rejects(writeDraft(key, f.actorId, value, 0));
});

test("six station colors follow match assignments, preserve missing slots and meet text contrast", async () => {
  const {
    STATION_PALETTE,
    STATION_ORDER,
    STRATEGY_INK,
    stationSlots,
    drawingColor,
  } = await import("../src/features/strategy-board/station-palette");
  assert.equal(new Set(Object.values(STATION_PALETTE)).size, 6);
  const f = boardFixture(),
    markers = f.document.phases.auto.markers;
  assert.deepEqual(
    stationSlots([...markers].reverse()).map((s) => [
      s.station,
      s.team?.teamNumber,
    ]),
    markers.map((m) => [m.station, m.teamNumber]),
  );
  const missing = stationSlots(markers.filter((m) => m.station !== "R2"));
  assert.deepEqual(
    missing.map((s) => s.station),
    STATION_ORDER,
  );
  assert.equal(missing[1].team, null);
  assert.equal(missing[2].team?.teamNumber, 1000);
  const changed = markers.map((m) => ({
    ...m,
    teamNumber:
      m.station === "R3" ? 700 : m.station === "R1" ? 1000 : m.teamNumber,
  }));
  assert.notEqual(
    stationSlots(markers).find((s) => s.team?.teamNumber === 700)?.color,
    stationSlots(changed).find((s) => s.team?.teamNumber === 700)?.color,
  );
  assert.equal(drawingColor("R1"), STATION_PALETTE.R1);
  const luminance = (hex: string) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  for (const color of Object.values(STATION_PALETTE))
    assert.ok(
      (luminance(color) + 0.05) / (luminance(STRATEGY_INK) + 0.05) >= 4.5,
    );
});

test("owned version-1 drawings survive save parsing, move and independent phase duplication", () => {
  const f = boardFixture();
  f.document.phases.auto.objects = [
    {
      id: boardId(61),
      type: "text",
      phaseId: "auto",
      ownerStation: "B2",
      ownerTeamNumber: 20,
      position: { x: 0.5, y: 0.4 },
      text: "Pass",
    },
  ];
  const copied = duplicatePhase(
    validateBoard(
      JSON.parse(JSON.stringify(f.document)),
      f.gameSlug,
      f.config,
      f.lineup,
    ),
    "auto",
    "transition",
    () => boardId(62),
  );
  const moved = moveDrawing(copied.phases.transition.objects[0], 0.1, 0.1);
  assert.equal(moved.ownerStation, "B2");
  assert.equal(moved.ownerTeamNumber, 20);
  assert.equal(copied.phases.auto.objects[0].id, boardId(61));
  assert.equal(copied.phases.transition.objects[0].id, boardId(62));
  assert.equal(moved.phaseId, "transition");
});

test("draft import restores every phase and rejects invalid, mismatched or oversized exports", () => {
  const f = boardFixture(610);
  for (const [i, phase] of Object.values(f.document.phases).entries()) {
    phase.notes = `Phase note ${i}`;
    phase.markers[0].position = { x: 0.4, y: 0.6 };
  }
  const envelope = {
    eventId: f.eventId,
    matchId: f.matchId,
    matchKey: f.matchKey,
    baseRevision: 99,
    document: f.document,
  };
  assert.deepEqual(parseBoardImport(JSON.stringify(envelope), f), f.document);
  assert.throws(() => parseBoardImport("bad JSON", f));
  assert.throws(
    () =>
      parseBoardImport(
        JSON.stringify({ ...envelope, matchKey: "other_qm1" }),
        f,
      ),
    /different event or match/,
  );
  assert.throws(
    () => parseBoardImport("x".repeat(MAX_BOARD_IMPORT_BYTES + 1), f),
    /too large/,
  );
  assert.throws(() =>
    parseBoardImport(
      JSON.stringify({
        ...envelope,
        document: { ...f.document, schemaVersion: 2 },
      }),
      f,
    ),
  );
  const wrong = structuredClone(f.document);
  wrong.phases.auto.markers[0].teamNumber = 9999;
  assert.throws(
    () => parseBoardImport(JSON.stringify({ ...envelope, document: wrong }), f),
    /stations/,
  );
});
