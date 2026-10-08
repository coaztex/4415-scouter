import "server-only";
import { readBoundedBody } from "@/lib/server/bounded-body";
import { nexusEventKeySchema } from "./schemas";
import {
  diagnosticText,
  logSyncError,
  responseDetails,
  retryDelay,
} from "@/lib/server/sync-diagnostics";

export class NexusError extends Error {
  constructor(
    public readonly code:
      "configuration" | "http" | "network" | "invalid_response",
    public readonly status?: number,
    public readonly context: {
      eventKey?: string;
      resource?: string;
      attempt?: number;
    } = {},
  ) {
    super(
      code === "configuration"
        ? "Configure the optional NEXUS_API_KEY on the server to sync pit maps."
        : code === "http" && (status === 401 || status === 403)
          ? "Nexus rejected the server API key. Check its configuration."
          : `Nexus ${context.resource ?? "pit data"} request failed${context.eventKey ? ` for ${context.eventKey}` : ""} (${code}${status ? `, upstream HTTP ${status}` : ""}). Cached pit data was retained.`,
    );
  }
}
type Options = {
  key: string;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};
export class NexusClient {
  constructor(private readonly options: Options) {
    if (!options.key.trim()) throw new NexusError("configuration");
  }
  pits(key: string) {
    return this.get(key, "pits");
  }
  map(key: string) {
    return this.get(key, "map");
  }
  inspection(key: string) {
    return this.get(key, "inspection");
  }
  private async get(
    key: string,
    resource: "pits" | "map" | "inspection",
  ): Promise<unknown | null> {
    const eventKey = nexusEventKeySchema.parse(key);
    const url = `https://frc.nexus/api/v1/event/${encodeURIComponent(eventKey)}/${resource}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await (this.options.fetcher ?? fetch)(url, {
          headers: {
            "Nexus-Api-Key": this.options.key,
            Accept: "application/json",
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 8000),
        });
        if (!response.ok) {
          const details = (await responseDetails(response)).replaceAll(
            this.options.key,
            "[redacted]",
          );
          logSyncError({
            provider: "nexus",
            stage: "upstream_response",
            eventKey: eventKey ?? "directory",
            resource,
            url,
            attempt: attempt + 1,
            upstreamStatus: response.status,
            responseDetails: details,
          });
          if (response.status === 404) return null;
          if (
            attempt < 2 &&
            [408, 429, 500, 502, 503, 504].includes(response.status)
          ) {
            await (
              this.options.sleep ??
              ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
            )(retryDelay(response, attempt));
            continue;
          }
          throw new NexusError("http", response.status, {
            eventKey: eventKey ?? undefined,
            resource,
            attempt: attempt + 1,
          });
        }
        const bytes = await readBoundedBody(response, 2_000_000);
        if (!bytes)
          throw new NexusError("invalid_response", response.status, {
            eventKey: eventKey ?? undefined,
            resource,
          });
        try {
          return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new NexusError("invalid_response", response.status, {
            eventKey: eventKey ?? undefined,
            resource,
          });
        }
      } catch (error) {
        if (error instanceof NexusError && error.code !== "invalid_response")
          throw error;
        logSyncError({
          provider: "nexus",
          stage:
            error instanceof NexusError && error.code === "invalid_response"
              ? "decode_response"
              : "upstream_request",
          eventKey: eventKey ?? "directory",
          resource,
          attempt: attempt + 1,
          upstreamStatus:
            error instanceof NexusError ? (error.status ?? null) : null,
          responseDetails: diagnosticText(
            error instanceof Error ? error.message : error,
          ).replaceAll(this.options.key, "[redacted]"),
        });
        if (error instanceof NexusError) throw error;
        if (attempt === 2)
          throw new NexusError("network", undefined, {
            eventKey: eventKey ?? undefined,
            resource,
            attempt: 3,
          });
        await (
          this.options.sleep ??
          ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
        )(250 * 2 ** attempt);
      }
    }
    throw new NexusError("network");
  }
}
