import "server-only";
import { StatboticsClient, StatboticsError } from "@/lib/statbotics/client";
import type { StatboticsMetric } from "@/lib/statbotics/schemas";

export type StatboticsEvent = { id: string; tba_key: string };
export interface StatboticsRepository {
  commit(
    event: StatboticsEvent,
    attemptedAt: string,
    rows: StatboticsMetric[],
  ): Promise<void>;
  failed(
    event: StatboticsEvent,
    attemptedAt: string,
    message: string,
  ): Promise<void>;
}
export async function syncStatboticsForEvent(
  event: StatboticsEvent,
  repository: StatboticsRepository,
  client = new StatboticsClient(),
) {
  const attemptedAt = new Date().toISOString();
  try {
    const rows = await client.teamEvents(event.tba_key);
    await repository.commit(event, attemptedAt, rows);
    return { ok: true as const };
  } catch (error) {
    const message =
      error instanceof StatboticsError
        ? error.message
        : "Statbotics cache update failed. Previous metrics were retained.";
    await repository.failed(event, attemptedAt, message).catch(() => undefined);
    return { ok: false as const, message };
  }
}
