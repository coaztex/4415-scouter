import type { z } from "zod";

export type GameObject = {
  [key: string]: import("@/types/database").Json | undefined;
};
export type MetricFormat = "decimal" | "integer" | "percent";
export type MetricDefinition = {
  id: string;
  label: string;
  description: string;
  format: MetricFormat;
  unit?: string;
  higherIsBetter?: boolean;
  subjective?: boolean;
  priority?: "primary" | "supporting";
};
export type AggregateSubmission<T> = {
  eventId: string;
  matchId: string;
  teamNumber: number;
  data: T;
};
export type EventAggregate<T> = {
  eventId: string | null;
  overall: T;
  teams: ReadonlyArray<{ teamNumber: number; metrics: T }>;
};
export interface GameModule<
  M extends GameObject,
  P extends GameObject,
  A = unknown,
> {
  readonly slug: string;
  readonly year: number;
  readonly displayName: string;
  readonly schemaVersion: number;
  readonly matchSchema: z.ZodType<M>;
  readonly pitSchema: z.ZodType<P>;
  parseMatch(input: unknown): M;
  parsePit(input: unknown): P;
  summarizeMatch?(input: unknown): readonly string[];
  aggregateTeam(submissions: readonly AggregateSubmission<M>[]): A;
  aggregateEvent(
    submissions: readonly AggregateSubmission<M>[],
  ): EventAggregate<A>;
  readonly metrics: readonly MetricDefinition[];
  readonly features?: {
    matchPrep?: { metricIds: readonly string[] };
    picklist?: { metricIds: readonly string[]; defaultSortMetric: string };
  };
}

export function parseGameData<M extends GameObject, P extends GameObject, A>(
  game: GameModule<M, P, A>,
  envelope: { game_slug: string; schema_version: number; game_data: unknown },
  kind: "match",
): M;
export function parseGameData<M extends GameObject, P extends GameObject, A>(
  game: GameModule<M, P, A>,
  envelope: { game_slug: string; schema_version: number; game_data: unknown },
  kind: "pit",
): P;
export function parseGameData<M extends GameObject, P extends GameObject, A>(
  game: GameModule<M, P, A>,
  envelope: { game_slug: string; schema_version: number; game_data: unknown },
  kind: "match" | "pit",
): M | P {
  if (
    envelope.game_slug !== game.slug ||
    envelope.schema_version !== game.schemaVersion
  ) {
    throw new Error("Unsupported game or payload schema version.");
  }
  return kind === "match"
    ? game.parseMatch(envelope.game_data)
    : game.parsePit(envelope.game_data);
}
