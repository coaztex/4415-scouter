import "server-only";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { getEvent } from "@/features/events/server/queries";
import { getGameModule } from "@/games/registry";
import {
  getMatchStations,
  type MatchStation,
} from "@/features/events/match-stations";
import { blankBoard, validateBoard } from "../model";
import { officialMatchLabel } from "@/features/event-schedule/model";

export async function getStrategyBoard(eventKey: string, matchKey: string) {
  const { db, profile } = await requireRole("scout");
  const viewOnly = profile.role === "scout";
  const event = await getEvent(eventKey);
  const config = getGameModule(event.game_slug).features?.strategyBoard;
  if (!config)
    throw new Error("This game does not configure a Strategy Board.");
  const matchResult = await db
    .from("matches")
    .select("id,tba_match_key,comp_level,set_number,match_number")
    .eq("event_id", event.id)
    .eq("tba_match_key", matchKey)
    .maybeSingle();
  if (matchResult.error) throw new Error("Match unavailable.");
  if (!matchResult.data) notFound();
  const match = matchResult.data;
  const [stationsResult, saved] = await Promise.all([
    db
      .from("match_teams")
      .select("match_id,team_number,alliance,station")
      .eq("event_id", event.id)
      .eq("match_id", match.id),
    viewOnly
      ? db
          .rpc("read_strategy_board_map", {
            target_event: event.id,
            target_match: match.id,
          })
          .maybeSingle()
      : db
          .from("strategy_boards")
          .select("board_data,schema_version,revision,updated_at")
          .eq("event_id", event.id)
          .eq("match_id", match.id)
          .maybeSingle(),
  ]);
  if (saved.error?.code === "PGRST205" || saved.error?.code === "42P01")
    throw new Error(
      "Strategy Board storage is not installed. Apply migration 20261023000000_strategy_boards.sql to this Supabase database. Existing data has not been overwritten.",
    );
  if (stationsResult.error || saved.error)
    throw new Error(
      "Strategy Board unavailable. Existing data has not been overwritten.",
    );
  const stations = getMatchStations(stationsResult.data as MatchStation[]);
  const lineup = [...stations.red, ...stations.blue];
  if (saved.data && saved.data.schema_version !== 1)
    throw new Error("Unsupported Strategy Board schema.");
  const document = saved.data
    ? validateBoard(saved.data.board_data, event.game_slug, config, lineup)
    : blankBoard(event.game_slug, config, lineup);
  return {
    eventId: event.id,
    eventKey,
    matchId: match.id,
    matchKey,
    matchLabel: officialMatchLabel(match),
    gameSlug: event.game_slug,
    actorId: profile.id,
    config,
    lineup,
    document,
    revision: saved.data?.revision ?? 0,
    updatedAt: saved.data?.updated_at ?? null,
    viewOnly,
    readOnly: viewOnly || event.status !== "active",
  };
}
export type StrategyBoardContext = Awaited<ReturnType<typeof getStrategyBoard>>;
