import { Badge } from "@/components/ui/badge";
import {
  scoringMechanismLabels,
  type ScoringMechanism,
} from "@/games/2026-rebuilt/pit-options";

export function MechanismBadge({
  mechanism,
  reported,
}: {
  mechanism: ScoringMechanism;
  reported: boolean;
}) {
  const description = !reported
    ? "Primary scoring mechanism unknown; not yet pit reported"
    : mechanism === "unknown"
      ? "Primary scoring mechanism unknown in pit report"
      : `Pit-reported primary scoring mechanism: ${scoringMechanismLabels[mechanism]}`;
  return (
    <Badge title={description} aria-label={description}>
      {scoringMechanismLabels[mechanism].toUpperCase()}
    </Badge>
  );
}

export function TeamMechanismSummary({
  mechanism,
  reported,
  otherType,
}: {
  mechanism: ScoringMechanism;
  reported: boolean;
  otherType: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>Pit mechanism</span>
      <MechanismBadge mechanism={mechanism} reported={reported} />
      {!reported && <span>Not yet pit reported</span>}
      {mechanism === "other" && otherType && <span>{otherType}</span>}
    </div>
  );
}
