import { generateSchedule } from "./planner";
import type {
  GenerateConfig,
  PlanOperations,
  ScheduleActionState,
  ScheduleSnapshot,
} from "./model";

export class StaleSchedulePreview extends Error {}

export function previewSchedule(
  snapshot: ScheduleSnapshot,
  config: GenerateConfig,
) {
  return generateSchedule(snapshot, config);
}

/** Recompute the exact reviewed plan; only the accepted path invokes save. */
export async function publishAcceptedPreview(
  snapshot: ScheduleSnapshot,
  config: GenerateConfig,
  previous: ScheduleActionState,
  claimed: { version: unknown; observationVersion: unknown },
  save: (operations: PlanOperations) => Promise<void>,
) {
  if (
    !previous.preview ||
    !previous.config ||
    JSON.stringify(previous.config) !== JSON.stringify(config)
  )
    throw new StaleSchedulePreview(
      "Generate and review this exact selection before publishing.",
    );
  if (
    claimed.version !== snapshot.version ||
    previous.version !== snapshot.version ||
    claimed.observationVersion !== snapshot.observationVersion ||
    previous.observationVersion !== snapshot.observationVersion
  )
    throw new StaleSchedulePreview(
      "The preview is stale. Refresh and preview again.",
    );
  const preview = generateSchedule(snapshot, config);
  if (
    JSON.stringify(preview.operations) !==
    JSON.stringify(previous.preview.operations)
  )
    throw new StaleSchedulePreview(
      "The schedule changed. Generate a new preview.",
    );
  await save(preview.operations);
  return preview;
}
