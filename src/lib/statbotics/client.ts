import "server-only";
import { z } from "zod";
import {
  statboticsEventKey,
  teamEventSchema,
  normalizeTeamEvent,
} from "./schemas";

export class StatboticsError extends Error {
  constructor(
    public readonly code: "http" | "network" | "invalid_response",
    public readonly status?: number,
  ) {
    super(
      `Statbotics sync failed (${code}${status ? `, HTTP ${status}` : ""}). Cached metrics were retained.`,
    );
  }
}
export class StatboticsClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}
  async teamEvents(key: string) {
    const event = statboticsEventKey.parse(key);
    // Event-sized requests only; fail closed on truncation instead of silently caching a partial roster.
    const url = `https://api.statbotics.io/v3/team_events?event=${event}&limit=1000`;
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        if (attempt === 2) throw new StatboticsError("network");
        await this.sleep(250 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        const retry = response.headers.get("retry-after");
        const delay = retry
          ? /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : Date.parse(retry) - Date.now()
          : 0;
        if (
          attempt < 2 &&
          [408, 429, 500, 502, 503, 504].includes(response.status) &&
          !(delay > 2000)
        ) {
          await this.sleep(
            Math.max(250 * 2 ** attempt, Number.isFinite(delay) ? delay : 0),
          );
          continue;
        }
        throw new StatboticsError("http", response.status);
      }
      try {
        const body = await response.text();
        if (body.length > 5_000_000) throw new Error();
        const rows = z.array(teamEventSchema).max(999).parse(JSON.parse(body));
        if (
          rows.some((row) => row.event !== event) ||
          new Set(rows.map((row) => row.team)).size !== rows.length
        )
          throw new Error();
        return rows.map(normalizeTeamEvent);
      } catch {
        throw new StatboticsError("invalid_response");
      }
    }
    throw new StatboticsError("network");
  }
}
