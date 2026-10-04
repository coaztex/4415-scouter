import { rebuilt2026 } from "./2026-rebuilt";
import { rebuilt2026V1 } from "./2026-rebuilt/legacy/v1";
import type { GameModule, GameObject } from "./core/module";

type RegisteredModule = GameModule<GameObject, GameObject, unknown>;
// The only composition point that imports seasons. Preserve old versions here
// when introducing incompatible schemas; never reinterpret historical payloads.
const modules: readonly RegisteredModule[] = [rebuilt2026V1, rebuilt2026];
const registry = new Map<string, Map<number, RegisteredModule>>();
for (const game of modules) {
  const versions =
    registry.get(game.slug) ?? new Map<number, RegisteredModule>();
  if (versions.has(game.schemaVersion))
    throw new Error("Duplicate game module version.");
  versions.set(game.schemaVersion, game);
  registry.set(game.slug, versions);
}

/** Omit version for new captures; always supply the stored version when reading. */
export function getGameModule(
  slug: string,
  schemaVersion?: number,
): RegisteredModule {
  const versions = registry.get(slug);
  const version =
    schemaVersion ?? (versions ? Math.max(...versions.keys()) : -1);
  const game = versions?.get(version);
  if (!game)
    throw new Error(
      `Unsupported game module/version: ${slug} / ${schemaVersion ?? "current"}`,
    );
  return game;
}
export function listGameModules() {
  return [...registry.keys()]
    .map((slug) => getGameModule(slug))
    .map(({ slug, year, displayName, schemaVersion }) => ({
      slug,
      year,
      displayName,
      schemaVersion,
    }));
}
