import "server-only";
import { z } from "zod";
import {
  eventKeySchema,
  eventSchema,
  teamSchema,
  matchSchema,
  rankingsSchema,
  oprsSchema,
  coprsSchema,
  alliancesSchema,
  teamMediaSchema,
} from "./schemas";

export type TbaErrorCode =
  "configuration" | "timeout" | "network" | "http" | "invalid_response";
export class TbaError extends Error {
  constructor(
    public readonly code: TbaErrorCode,
    public readonly status?: number,
  ) {
    super(
      code === "configuration"
        ? "Configure TBA_AUTH_KEY on the server."
        : `TBA request failed (${code}${status ? `, HTTP ${status}` : ""}).`,
    );
    this.name = "TbaError";
  }
}
export type CacheMetadata = {
  etag: string | null;
  lastModified: string | null;
  cacheControl: string | null;
  fetchedAt: string;
};
export type TbaResult<T> = { data: T; cache: CacheMetadata };
type Options = {
  key: string;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

export class TbaClient {
  private readonly baseUrl: string;
  constructor(private readonly options: Options) {
    if (!options.key.trim()) throw new TbaError("configuration");
    this.baseUrl = options.baseUrl ?? "https://www.thebluealliance.com/api/v3";
    // Never forward the credential to a caller-supplied host or redirect.
    if (this.baseUrl !== "https://www.thebluealliance.com/api/v3")
      throw new TbaError("configuration");
  }
  private async get<T>(
    path: string,
    schema: z.ZodType<T>,
    optional = false,
  ): Promise<TbaResult<T | null>> {
    const retries = Math.min(2, Math.max(0, this.options.retries ?? 2));
    for (let attempt = 0; attempt <= retries; attempt++) {
      let response: Response | undefined;
      let error: TbaError;
      try {
        response = await (this.options.fetcher ?? fetch)(
          `${this.baseUrl}${path}`,
          {
            headers: {
              "X-TBA-Auth-Key": this.options.key,
              Accept: "application/json",
            },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(
              Math.min(15000, Math.max(100, this.options.timeoutMs ?? 8000)),
            ),
          },
        );
        const cache = {
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          cacheControl: response.headers.get("cache-control"),
          fetchedAt: new Date().toISOString(),
        };
        if (optional && response.status === 404) return { data: null, cache };
        if (!response.ok) throw new TbaError("http", response.status);
        // Limit decoded bodies too; do not store unrestricted provider payloads.
        const body = await response.text();
        if (body.length > 5_000_000) throw new TbaError("invalid_response");
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          throw new TbaError("invalid_response");
        }
        const result = schema.safeParse(parsed);
        if (!result.success) throw new TbaError("invalid_response");
        return { data: result.data, cache };
      } catch (cause) {
        error =
          cause instanceof TbaError
            ? cause
            : new TbaError(
                cause instanceof Error &&
                  ["TimeoutError", "AbortError"].includes(cause.name)
                  ? "timeout"
                  : "network",
              );
      }
      const transient =
        error.code === "network" ||
        error.code === "timeout" ||
        (error.code === "http" && TRANSIENT.has(error.status ?? 0));
      if (!transient || attempt === retries) throw error;
      const retryAfter = response?.headers.get("retry-after");
      const parsedDelay = retryAfter
        ? /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Date.parse(retryAfter) - Date.now()
        : 0;
      // A long Retry-After is honored by stopping, not retrying earlier than requested.
      if (parsedDelay > 2000) throw error;
      const delay = Math.max(
        250 * 2 ** attempt,
        Number.isFinite(parsedDelay) ? parsedDelay : 0,
      );
      await (
        this.options.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
      )(delay);
    }
    throw new TbaError("network");
  }
  private path(key: string, suffix = "") {
    return `/event/${eventKeySchema.parse(key)}${suffix}`;
  }
  async event(key: string) {
    const result = await this.get(this.path(key), eventSchema);
    if (!result.data) throw new TbaError("invalid_response");
    return { ...result, data: result.data };
  }
  async teams(key: string) {
    const result = await this.get(
      this.path(key, "/teams"),
      z.array(teamSchema),
    );
    if (!result.data) throw new TbaError("invalid_response");
    return { ...result, data: result.data };
  }
  async matches(key: string) {
    const result = await this.get(
      this.path(key, "/matches"),
      z.array(matchSchema),
    );
    if (!result.data) throw new TbaError("invalid_response");
    return { ...result, data: result.data };
  }
  rankings(key: string) {
    return this.get(this.path(key, "/rankings"), rankingsSchema, true);
  }
  oprs(key: string) {
    return this.get(this.path(key, "/oprs"), oprsSchema, true);
  }
  coprs(key: string) {
    return this.get(this.path(key, "/coprs"), coprsSchema, true);
  }
  alliances(key: string) {
    return this.get(this.path(key, "/alliances"), alliancesSchema, true);
  }
  teamMedia(key: string) {
    return this.get(this.path(key, "/team_media"), teamMediaSchema, true);
  }
}
