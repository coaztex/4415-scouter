import { RebuiltScoreBreakdown } from "./2026-rebuilt/score-breakdown";

/** Season presentation dispatch lives with game modules, outside match pages. */
export function GameScoreBreakdown({
  gameSlug,
  payload,
}: {
  gameSlug: string;
  payload: unknown;
}) {
  if (gameSlug === "2026-rebuilt")
    return <RebuiltScoreBreakdown payload={payload} />;
  return <p className="text-muted">Detailed score breakdown unavailable.</p>;
}
