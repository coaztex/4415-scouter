/** Statbotics retry policy: never shorten the provider's requested cooldown. */
export function statboticsRetryDelay(
  response: Response,
  attempt: number,
  now = Date.now(),
  random = Math.random,
) {
  const header = response.headers.get("retry-after")?.trim();
  const requested = header
    ? /^\d+$/.test(header)
      ? Number(header) * 1000
      : Date.parse(header) - now
    : 0;
  const retryAfterMs = Number.isFinite(requested) ? Math.max(0, requested) : 0;
  return {
    // Equal jitter: exponential floor, plus up to another floor in random delay.
    delayMs: Math.max(250 * 2 ** attempt * (1 + random()), retryAfterMs),
    retryNotBefore: retryAfterMs
      ? new Date(now + retryAfterMs).toISOString()
      : null,
  };
}
