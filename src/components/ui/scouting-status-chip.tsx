import type { PitStatus } from "@/features/pit/model";

const labels: Record<PitStatus, string> = {
  not_scouted: "Not scouted",
  in_progress: "In progress",
  completed: "Completed",
  needs_review: "Needs review",
};

export function ScoutingStatusChip({ status }: { status: PitStatus }) {
  return (
    <span
      className={`scouting-status-${status} inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold`}
    >
      {labels[status]}
    </span>
  );
}
