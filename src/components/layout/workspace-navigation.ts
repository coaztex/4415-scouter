import { isAtLeastRole } from "@/lib/auth/roles";
import { eventModuleHref, modulesForRole } from "@/features/events/modules";
import type { ProfileRole } from "@/types/database";

export type WorkspaceLink = { href: string; label: string };
export type WorkspaceGroup = { label: string; links: WorkspaceLink[] };

export function workspaceGroups(role?: ProfileRole, eventKey?: string) {
  if (!role)
    return [{ label: "Home", links: [{ href: "/login", label: "Sign in" }] }];

  const modules = new Set<string>(
    modulesForRole(role).map((module) => module.slug),
  );
  const event = (slug: string, label: string): WorkspaceLink[] =>
    eventKey && modules.has(slug)
      ? [{ href: eventModuleHref(eventKey, slug), label }]
      : [];
  const root = eventKey ? `/events/${encodeURIComponent(eventKey)}` : null;
  const groups: WorkspaceGroup[] = [
    {
      label: "Home / Event",
      links: [
        { href: "/events", label: "Events" },
        ...(root ? [{ href: root, label: "Overview" }] : []),
        ...event("schedule", "Schedule"),
      ],
    },
    {
      label: "Scouting",
      links: [
        ...event("scouting", "Match Scouting"),
        ...event("pit", "Pit Scouting"),
      ],
    },
    {
      label: "Teams & Analytics",
      links: [...event("teams", "Teams"), ...event("stats", "Stats")],
    },
    {
      label: "Strategy",
      links: [
        ...event("match-prep", "Match Prep"),
        ...event("picklist", "Picklist"),
      ],
    },
    {
      label: "Review",
      links: [
        ...event("incidents", "Incident Review"),
        ...event("data-review", "Data Review"),
      ],
    },
    {
      label: "Admin",
      links: [
        ...(isAtLeastRole(role, "strategy")
          ? [{ href: "/schedule", label: "Scheduling" }]
          : []),
        ...(isAtLeastRole(role, "admin")
          ? [{ href: "/admin", label: "Admin" }]
          : []),
      ],
    },
  ];
  return groups.filter((group) => group.links.length > 0);
}

export function isActiveWorkspaceLink(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/events") return false;
  if (/^\/events\/[^/]+$/.test(href)) return false;
  if (href === "/admin") return pathname.startsWith("/admin/");
  if (href === "/schedule") return false;
  if (href.endsWith("/schedule") && pathname.includes("/matches/"))
    return pathname.startsWith(href.slice(0, -"schedule".length) + "matches/");
  if (href.endsWith("/scouting") && pathname.includes("/scout/match/"))
    return pathname.startsWith(
      href.slice(0, -"scouting".length) + "scout/match/",
    );
  return pathname.startsWith(`${href}/`);
}
