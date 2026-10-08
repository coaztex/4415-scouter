import "server-only";

/** Diagnostics stay on the server; never log headers, credentials or scouting records. */
export function diagnosticText(value: unknown, limit = 1000): string {
  let text = typeof value === "string" ? value : String(value ?? "");
  for (const name of [
    "NEXUS_API_KEY",
    "TBA_AUTH_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ])
    if (process.env[name])
      text = text.replaceAll(process.env[name]!, "[redacted]");
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[\x00-\x1f]/g, " ")
    .slice(0, limit);
}

export function logSyncError(context: {
  provider: "statbotics" | "nexus";
  stage: string;
  eventKey: string;
  [key: string]: unknown;
}) {
  console.error(JSON.stringify({ type: "external_sync_error", ...context }));
}

/** Read a bounded prefix, including large HTML error pages, then release the connection. */
export async function responseDetails(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < 1000) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value.subarray(0, 1000), { stream: true });
    }
    return diagnosticText(text);
  } catch {
    return diagnosticText(text || "Response body could not be read.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function retryDelay(response: Response, attempt: number) {
  const value = response.headers.get("retry-after");
  const requested = value
    ? /^\d+$/.test(value)
      ? Number(value) * 1000
      : Date.parse(value) - Date.now()
    : 0;
  return Math.max(
    250 * 2 ** attempt,
    Math.min(30_000, Number.isFinite(requested) ? requested : 0),
  );
}

export class SyncDatabaseError extends Error {
  readonly details: {
    code: string;
    message: string;
    details: string;
    hint: string;
  };
  constructor(
    provider: string,
    operation: string,
    error: { code?: string; message?: string; details?: string; hint?: string },
  ) {
    const code = diagnosticText(error.code ?? "unknown", 80);
    const message = diagnosticText(error.message, 240);
    super(
      `${provider} Supabase ${operation} failed (${code}): ${message}. Previously synchronized data was retained.`,
    );
    this.details = {
      code,
      message,
      details: diagnosticText(error.details),
      hint: diagnosticText(error.hint),
    };
  }
}
