import "server-only";
import { z } from "zod";
import { readBoundedBody } from "@/lib/server/bounded-body";
import {
  diagnosticText,
  logSyncError,
  responseDetails,
} from "@/lib/server/sync-diagnostics";
import { statboticsRetryDelay } from "./retry";
import {
  statboticsEventKey,
  teamEventSchema,
  normalizeTeamEvent,
} from "./schemas";

export class StatboticsError extends Error {
  constructor(
    public readonly code: "http" | "network" | "invalid_response",
    public readonly status?: number,
    public readonly context: {
      eventKey?: string;
      stage?: string;
      attempt?: number;
      responseDetails?: string;
      retryNotBefore?: string | null;
    } = {},
  ) {
    super(
      `Statbotics ${code === "http" ? `API returned HTTP ${status}` : code === "network" ? "API could not be reached" : "API returned invalid EPA data"}${context.eventKey ? ` for ${context.eventKey}` : ""}${context.attempt ? ` after ${context.attempt} attempt${context.attempt === 1 ? "" : "s"}` : ""}. ${code === "http" && status === 404 ? "Event EPA is unavailable; offseason events may not be covered." : "Try again later."} Cached metrics were retained.`,
    );
  }
}
export class StatboticsClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly random = Math.random,
    private readonly now = Date.now,
  ) {}
  async teamEvents(key: string) {
    const event = statboticsEventKey.parse(key);
    // Event-sized requests only; fail closed on truncation instead of silently caching a partial roster.
    const url = `https://api.statbotics.io/v3/team_events?event=${event}&limit=1000`;
    const startedAt = this.now();
    // Leave enough time for every 8-second request, without waiting through long Retry-After values.
    const deadline = startedAt + 28_000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const requestStartedAt = this.now();
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
      } catch (error) {
        logSyncError({
          provider: "statbotics",
          stage: "upstream_request",
          eventKey: event,
          url,
          attempt: attempt + 1,
          upstreamStatus: null,
          origin: "upstream_transport",
          durationMs: this.now() - requestStartedAt,
          errorKind: error instanceof Error ? error.name : "unknown",
          responseDetails: diagnosticText(
            error instanceof Error ? error.message : error,
          ),
        });
        const delay = 250 * 2 ** attempt * (1 + this.random());
        if (attempt === 2 || this.now() + delay + 8000 > deadline)
          throw new StatboticsError("network", undefined, {
            eventKey: event,
            stage: "upstream_request",
            attempt: attempt + 1,
          });
        await this.sleep(delay);
        continue;
      }
      if (!response.ok) {
        const details = await responseDetails(response);
        const retry = statboticsRetryDelay(
          response,
          attempt,
          this.now(),
          this.random,
        );
        logSyncError({
          provider: "statbotics",
          stage: "upstream_response",
          eventKey: event,
          url,
          attempt: attempt + 1,
          upstreamStatus: response.status,
          origin: "upstream_http",
          durationMs: this.now() - requestStartedAt,
          responseDetails: details,
          retryAfter: response.headers.get("retry-after"),
          retryDelayMs: retry.delayMs,
          retryNotBefore: retry.retryNotBefore,
        });
        if (
          attempt < 2 &&
          [408, 429, 500, 502, 503, 504].includes(response.status) &&
          this.now() + retry.delayMs + 8000 <= deadline
        ) {
          await this.sleep(retry.delayMs);
          continue;
        }
        throw new StatboticsError("http", response.status, {
          eventKey: event,
          stage: "upstream_response",
          attempt: attempt + 1,
          responseDetails: details,
          retryNotBefore: retry.retryNotBefore,
        });
      }
      let bytes: Uint8Array | null;
      try {
        bytes = await readBoundedBody(response, 5_000_000);
      } catch (error) {
        logSyncError({
          provider: "statbotics",
          stage: "upstream_body",
          origin: "upstream_transport",
          eventKey: event,
          url,
          attempt: attempt + 1,
          upstreamStatus: response.status,
          durationMs: this.now() - requestStartedAt,
          errorKind: error instanceof Error ? error.name : "unknown",
          responseDetails: diagnosticText(
            error instanceof Error ? error.message : error,
          ),
        });
        const delay = 250 * 2 ** attempt * (1 + this.random());
        if (attempt < 2 && this.now() + delay + 8000 <= deadline) {
          await this.sleep(delay);
          continue;
        }
        throw new StatboticsError("network", response.status, {
          eventKey: event,
          stage: "upstream_body",
          attempt: attempt + 1,
        });
      }
      try {
        if (!bytes) throw new Error("Statbotics response exceeded 5 MB.");
        const rows = z
          .array(teamEventSchema)
          .max(999)
          .parse(JSON.parse(new TextDecoder().decode(bytes)));
        if (
          rows.some((row) => row.event !== event) ||
          new Set(rows.map((row) => row.team)).size !== rows.length
        )
          throw new Error(
            "Statbotics returned duplicate teams or rows for another event.",
          );
        const metrics = rows.map(normalizeTeamEvent);
        console.info(
          JSON.stringify({
            type: "external_sync_result",
            provider: "statbotics",
            stage: "transform",
            origin: "upstream_http",
            eventKey: event,
            url,
            upstreamStatus: response.status,
            attempt: attempt + 1,
            durationMs: this.now() - startedAt,
            rowCount: metrics.length,
          }),
        );
        return metrics;
      } catch (error) {
        logSyncError({
          provider: "statbotics",
          stage: "transform",
          eventKey: event,
          url,
          attempt: attempt + 1,
          upstreamStatus: response.status,
          origin: "internal_parser",
          durationMs: this.now() - requestStartedAt,
          responseDetails: diagnosticText(
            error instanceof Error ? error.message : error,
          ),
        });
        throw new StatboticsError("invalid_response", response.status, {
          eventKey: event,
          stage: "transform",
          attempt: attempt + 1,
        });
      }
    }
    throw new StatboticsError("network");
  }
}
