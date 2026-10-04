import "server-only";
import type { TbaClient, CacheMetadata } from "@/lib/tba/client";
import { TbaError } from "@/lib/tba/client";
import { eventKeySchema } from "@/lib/tba/schemas";
import { getGameModule } from "@/games/registry";

export type SyncSnapshot = Awaited<ReturnType<typeof fetchSnapshot>>;
export type SyncRepository = {
  commit(snapshot: SyncSnapshot): Promise<string>;
  failed(eventKey: string, attemptedAt: string, error: string): Promise<void>;
};
export async function previewEvent(client: TbaClient, key: string) {
  const eventKey = eventKeySchema.parse(key);
  const event = await client.event(eventKey);
  if (
    event.data.key !== eventKey ||
    event.data.year !== Number(eventKey.slice(0, 4))
  )
    throw new TbaError("invalid_response");
  // Metadata must succeed before the team request.
  const teams = await client.teams(eventKey);
  return { event: event.data, teamCount: teams.data.length };
}

export async function fetchSnapshot(
  client: TbaClient,
  key: string,
  gameSlug: string,
  attemptedAt = new Date().toISOString(),
) {
  const eventKey = eventKeySchema.parse(key);
  const game = getGameModule(gameSlug);
  const event = await client.event(eventKey);
  if (
    event.data.key !== eventKey ||
    event.data.year !== Number(eventKey.slice(0, 4)) ||
    game.year !== event.data.year
  )
    throw new Error("Event year must match the selected game module.");
  const [teams, matches, rankings, oprs] = await Promise.all([
    client.teams(eventKey),
    client.matches(eventKey),
    client.rankings(eventKey),
    client.oprs(eventKey),
  ]);
  const teamKeys = new Set(teams.data.map((team) => team.key));
  if (
    teamKeys.size !== teams.data.length ||
    new Set(matches.data.map((match) => match.key)).size !== matches.data.length
  )
    throw new TbaError("invalid_response");
  for (const match of matches.data) {
    if (match.event_key !== eventKey) throw new TbaError("invalid_response");
    const keys = [
      ...match.alliances.red.team_keys,
      ...match.alliances.blue.team_keys,
    ];
    if (
      keys.some((key) => !teamKeys.has(key)) ||
      new Set(keys).size !== keys.length
    )
      throw new TbaError("invalid_response");
  }
  for (const rank of rankings.data?.rankings ?? [])
    if (!teamKeys.has(rank.team_key)) throw new TbaError("invalid_response");
  const alliances = matches.data.some((match) => match.comp_level !== "qm")
    ? await client.alliances(eventKey)
    : null;
  const coprs =
    event.data.year === 2026 &&
    matches.data.some(
      (match) =>
        match.alliances.red.score >= 0 && match.alliances.blue.score >= 0,
    )
      ? await client.coprs(eventKey)
      : null;
  const cache: Record<string, CacheMetadata> = {
    event: event.cache,
    teams: teams.cache,
    matches: matches.cache,
    rankings: rankings.cache,
    oprs: oprs.cache,
  };
  if (alliances) cache.alliances = alliances.cache;
  if (coprs) cache.coprs = coprs.cache;
  return {
    event: event.data,
    gameSlug,
    attemptedAt,
    teams: teams.data,
    matches: matches.data,
    rankings: rankings.data,
    oprs: oprs.data,
    coprs: coprs?.data ?? null,
    alliances: alliances?.data ?? null,
    cache,
  };
}

/** Transport agnostic: actions and future authenticated jobs use this same path. */
export async function syncTbaEvent(
  client: TbaClient,
  repository: SyncRepository,
  key: string,
  gameSlug: string,
) {
  const attemptedAt = new Date().toISOString();
  try {
    const snapshot = await fetchSnapshot(client, key, gameSlug, attemptedAt);
    const eventId = await repository.commit(snapshot);
    return {
      eventId,
      teamCount: snapshot.teams.length,
      matchCount: snapshot.matches.length,
    };
  } catch (error) {
    const safeError =
      error instanceof TbaError
        ? error.message
        : "TBA sync failed validation or database commit. Cached data was retained.";
    // Never replace the primary failure, nor store provider bodies/secrets.
    await repository
      .failed(key, attemptedAt, safeError.slice(0, 500))
      .catch(() => undefined);
    throw error;
  }
}
