import { getGameModule } from "../../src/games/registry";
import { blankBoard } from "../../src/features/strategy-board/model";
import { getMatchStations } from "../../src/features/events/match-stations";
import type { StrategyBoardContext } from "../../src/features/strategy-board/server/queries";
export const boardId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function boardFixture(n = 1): StrategyBoardContext {
  const config = getGameModule("2026-rebuilt").features!.strategyBoard!;
  const rows = [700, 50, 1000, 900, 20, 300].map((team_number, i) => ({
    match_id: boardId(n + 10),
    team_number,
    alliance: i < 3 ? ("red" as const) : ("blue" as const),
    station: (i % 3) + 1,
  }));
  const grouped = getMatchStations([
      rows[4],
      rows[1],
      rows[3],
      rows[0],
      rows[5],
      rows[2],
    ]),
    lineup = [...grouped.red, ...grouped.blue];
  return {
    eventId: boardId(100),
    eventKey: "2026test",
    matchId: boardId(n + 10),
    matchKey: `2026test_qm${n}`,
    matchLabel: `Q${n}`,
    gameSlug: "2026-rebuilt",
    actorId: boardId(200),
    config,
    lineup,
    document: blankBoard("2026-rebuilt", config, lineup),
    revision: 0,
    updatedAt: null,
    readOnly: false,
    viewOnly: false,
  };
}
