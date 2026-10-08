import { z } from "zod";
import {
  getMatchStations,
  type MatchStation,
  type StationLabel,
} from "@/features/events/match-stations";
import type { GameModule, GameObject } from "@/games/core/module";

export type BoardConfig = NonNullable<
  NonNullable<GameModule<GameObject, GameObject>["features"]>["strategyBoard"]
>;
export const BOARD_SCHEMA_VERSION = 1;
// Leave room for the server-action envelope and JSONB serialization overhead.
export const MAX_BOARD_BYTES = 750_000;
export const boardBytes = (document: BoardDocument) =>
  new TextEncoder().encode(JSON.stringify(document)).length;
export const stationSchema = z.enum(["R1", "R2", "R3", "B1", "B2", "B3"]);
const unit = z.number().finite().min(0).max(1);
export const pointSchema = z.object({ x: unit, y: unit });
export type Point = z.infer<typeof pointSchema>;
const objectBase = {
  id: z.uuid(),
  phaseId: z.string().min(1).max(60),
  ownerStation: stationSchema.nullable(),
  ownerTeamNumber: z.number().int().positive().nullable(),
};
export const drawingSchema = z.discriminatedUnion("type", [
  z.object({
    ...objectBase,
    type: z.literal("freehand"),
    points: z.array(pointSchema).min(2).max(2000),
  }),
  z.object({
    ...objectBase,
    type: z.literal("line"),
    start: pointSchema,
    end: pointSchema,
  }),
  z.object({
    ...objectBase,
    type: z.literal("arrow"),
    start: pointSchema,
    end: pointSchema,
  }),
  z.object({
    ...objectBase,
    type: z.literal("circle"),
    center: pointSchema,
    radius: unit,
  }),
  z.object({
    ...objectBase,
    type: z.literal("text"),
    position: pointSchema,
    text: z.string().trim().min(1).max(200),
  }),
]);
export type DrawingObject = z.infer<typeof drawingSchema>;
export function moveDrawing(
  object: DrawingObject,
  dx: number,
  dy: number,
): DrawingObject {
  const points =
    object.type === "freehand"
      ? object.points
      : object.type === "line" || object.type === "arrow"
        ? [object.start, object.end]
        : [object.type === "circle" ? object.center : object.position];
  const x = Math.max(
    -Math.min(...points.map((p) => p.x)),
    Math.min(dx, 1 - Math.max(...points.map((p) => p.x))),
  );
  const y = Math.max(
    -Math.min(...points.map((p) => p.y)),
    Math.min(dy, 1 - Math.max(...points.map((p) => p.y))),
  );
  const move = (p: Point) => ({ x: p.x + x, y: p.y + y });
  if (object.type === "freehand")
    return { ...object, points: object.points.map(move) };
  if (object.type === "line" || object.type === "arrow")
    return { ...object, start: move(object.start), end: move(object.end) };
  if (object.type === "circle")
    return { ...object, center: move(object.center) };
  return { ...object, position: move(object.position) };
}
export const markerSchema = z.object({
  station: stationSchema,
  teamNumber: z.number().int().positive(),
  position: pointSchema,
});
export type RobotMarker = z.infer<typeof markerSchema>;
export const phaseSchema = z.object({
  objects: z.array(drawingSchema).max(300),
  markers: z.array(markerSchema).max(6),
  notes: z.string().max(4000),
});
export type PhaseState = z.infer<typeof phaseSchema>;
export const boardSchema = z.object({
  schemaVersion: z.literal(BOARD_SCHEMA_VERSION),
  gameSlug: z.string().min(1).max(80),
  phases: z.record(z.string().min(1).max(60), phaseSchema),
});
export type BoardDocument = z.infer<typeof boardSchema>;
export function blankBoard(
  gameSlug: string,
  config: BoardConfig,
  stations: readonly MatchStation[],
): BoardDocument {
  const lineup = getMatchStations(stations);
  const markers = [...lineup.red, ...lineup.blue].map((row) => ({
    station: row.stationLabel,
    teamNumber: row.team_number,
    position: {
      x: row.alliance === "red" ? 0.12 : 0.88,
      y: 0.2 + (row.station - 1) * 0.3,
    },
  }));
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    gameSlug,
    phases: Object.fromEntries(
      config.phases.map((phase) => [
        phase.id,
        { objects: [], markers: structuredClone(markers), notes: "" },
      ]),
    ),
  };
}
export function validateBoard(
  input: unknown,
  gameSlug: string,
  config: BoardConfig,
  stations: readonly MatchStation[],
) {
  const board = boardSchema.parse(input);
  if (
    board.gameSlug !== gameSlug ||
    Object.keys(board.phases).length !== config.phases.length ||
    config.phases.some((p) => !board.phases[p.id])
  )
    throw new Error("Board game or phases do not match.");
  const lineup = getMatchStations(stations);
  const expected = [...lineup.red, ...lineup.blue];
  const ids = new Set<string>();
  for (const [phaseId, phase] of Object.entries(board.phases)) {
    if (
      phase.markers.length !== expected.length ||
      new Set(phase.markers.map((m) => m.station)).size !== expected.length ||
      phase.markers.some(
        (m) =>
          !expected.some(
            (s) =>
              s.stationLabel === m.station && s.team_number === m.teamNumber,
          ),
      )
    )
      throw new Error("Robot stations do not match the official match.");
    phase.markers.sort(
      (a, b) =>
        expected.findIndex((s) => s.stationLabel === a.station) -
        expected.findIndex((s) => s.stationLabel === b.station),
    );
    for (const object of phase.objects) {
      if (
        object.phaseId !== phaseId ||
        ids.has(object.id) ||
        (object.ownerStation === null) !== (object.ownerTeamNumber === null) ||
        (object.ownerStation &&
          !expected.some(
            (s) =>
              s.stationLabel === object.ownerStation &&
              s.team_number === object.ownerTeamNumber,
          ))
      )
        throw new Error("Invalid drawing identity or owner.");
      ids.add(object.id);
    }
  }
  if (boardBytes(board) > MAX_BOARD_BYTES)
    throw new Error("Board exceeds supported size.");
  return board;
}
export function phaseHasEdits(phase: PhaseState, initial: PhaseState) {
  return (
    phase.objects.length > 0 ||
    phase.notes.length > 0 ||
    JSON.stringify(phase.markers) !== JSON.stringify(initial.markers)
  );
}
export function duplicatePhase(
  board: BoardDocument,
  previous: string,
  current: string,
  id: () => string = () => crypto.randomUUID(),
): BoardDocument {
  const source = board.phases[previous];
  if (!source || !board.phases[current]) throw new Error("Unknown phase.");
  return {
    ...board,
    phases: {
      ...board.phases,
      [current]: {
        ...board.phases[current],
        markers: structuredClone(source.markers),
        objects: source.objects.map((object) => ({
          ...structuredClone(object),
          id: id(),
          phaseId: current,
        })),
      },
    },
  };
}
export const boardDraftSchema = z.object({
  eventId: z.uuid(),
  matchId: z.uuid(),
  matchKey: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  unsynced: z.boolean().default(true),
  document: boardSchema,
});
export const boardDraftKey = (actor: string, event: string, match: string) =>
  `strategy-board:${actor}:${event}:${match}`;
export const MAX_BOARD_IMPORT_BYTES = MAX_BOARD_BYTES + 4096;
export function parseBoardImport(
  source: string,
  context: {
    eventId: string;
    matchId: string;
    matchKey: string;
    gameSlug: string;
    config: BoardConfig;
    lineup: readonly MatchStation[];
  },
) {
  if (new TextEncoder().encode(source).length > MAX_BOARD_IMPORT_BYTES)
    throw new Error("Draft file is too large.");
  const draft = boardDraftSchema.parse(JSON.parse(source));
  if (
    draft.eventId !== context.eventId ||
    draft.matchId !== context.matchId ||
    draft.matchKey !== context.matchKey
  )
    throw new Error("This draft belongs to a different event or match.");
  return validateBoard(
    draft.document,
    context.gameSlug,
    context.config,
    context.lineup,
  );
}
export const boardHref = (eventKey: string, matchKey: string) =>
  `/events/${encodeURIComponent(eventKey)}/matches/${encodeURIComponent(matchKey)}/strategy-board`;
export function advancePhase(
  config: BoardConfig,
  current: string,
  direction: -1 | 1,
) {
  const index = config.phases.findIndex((p) => p.id === current);
  return config.phases[
    Math.max(0, Math.min(config.phases.length - 1, index + direction))
  ].id;
}
export type BoardTeam = { station: StationLabel; teamNumber: number };
