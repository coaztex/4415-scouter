import { isAtLeastRole } from "@/lib/auth/roles";
import type { ProfileRole } from "@/types/database";

export const eventModules = [
  {
    slug: "schedule",
    title: "Schedule",
    role: "scout",
  },
  {
    slug: "scouting",
    title: "Match Scouting",
    role: "scout",
  },
  {
    slug: "pit",
    title: "Pit Scouting",
    role: "scout",
  },
  {
    slug: "teams",
    title: "Teams",
    role: "scout",
  },
  {
    slug: "stats",
    title: "Stats",
    role: "scout",
  },
  {
    slug: "incidents",
    title: "Incident Review",
    role: "strategy",
  },
  {
    slug: "data-review",
    title: "Data Review",
    role: "strategy",
  },
  {
    slug: "match-prep",
    title: "Match Prep",
    role: "strategy",
  },
  {
    slug: "picklist",
    title: "Picklist",
    role: "strategy",
  },
] as const;
export function modulesForRole(role: ProfileRole) {
  return eventModules.filter((module) => isAtLeastRole(role, module.role));
}
export function eventModuleHref(key: string, slug: string) {
  return `/events/${encodeURIComponent(key)}/${slug}`;
}
