import "server-only";
import { readBoundedBody } from "@/lib/server/bounded-body";
import { nexusEventKeySchema } from "./schemas";

export class NexusError extends Error {
  constructor(
    public readonly code:
      "configuration" | "http" | "network" | "invalid_response",
    public readonly status?: number,
  ) {
    super(
      code === "configuration"
        ? "Configure the optional NEXUS_API_KEY on the server to sync pit maps."
        : code === "http" && (status === 401 || status === 403)
          ? "Nexus rejected the server API key. Check its configuration."
          : `Nexus pit data request failed (${code}${status ? `, HTTP ${status}` : ""}). Cached pit data was retained.`,
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
  private async get(
    key: string,
    resource: "pits" | "map",
  ): Promise<unknown | null> {
    const eventKey = nexusEventKeySchema.parse(key);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await (this.options.fetcher ?? fetch)(
          `https://frc.nexus/api/v1/event/${encodeURIComponent(eventKey)}/${resource}`,
          {
            headers: {
              "Nexus-Api-Key": this.options.key,
              Accept: "application/json",
            },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(this.options.timeoutMs ?? 8000),
          },
        );
        if (response.status === 404) return null;
        if (!response.ok) {
          const retryAfter = response.headers.get("retry-after");
          const delay = retryAfter
            ? /^\d+$/.test(retryAfter)
              ? Number(retryAfter) * 1000
              : Date.parse(retryAfter) - Date.now()
            : 0;
          if (
            attempt < 2 &&
            [408, 429, 500, 502, 503, 504].includes(response.status) &&
            !(delay > 2000)
          ) {
            await (
              this.options.sleep ??
              ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
            )(Math.max(250 * 2 ** attempt, Number.isFinite(delay) ? delay : 0));
            continue;
          }
          throw new NexusError("http", response.status);
        }
        const bytes = await readBoundedBody(response, 2_000_000);
        if (!bytes) throw new NexusError("invalid_response");
        try {
          return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new NexusError("invalid_response");
        }
      } catch (error) {
        if (error instanceof NexusError) throw error;
        if (attempt === 2) throw new NexusError("network");
        await (
          this.options.sleep ??
          ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
        )(250 * 2 ** attempt);
      }
    }
    throw new NexusError("network");
  }
}
