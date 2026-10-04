import type { ProfileRole } from "@/types/database";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { modulesForRole, eventModuleHref } from "../modules";

export function EventModules({
  eventKey,
  role,
}: {
  eventKey: string;
  role: ProfileRole;
}) {
  const allowedModules = modulesForRole(role);
  const allowed = new Map(
    allowedModules.map((module) => [module.slug, module]),
  );
  const actions: (typeof allowedModules)[number]["slug"][] = [
    "scouting",
    "pit",
    "schedule",
    allowed.has("match-prep") ? "match-prep" : "teams",
  ];
  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="mb-3 text-lg font-semibold">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((slug) => {
          const action = allowed.get(slug);
          if (!action) return null;
          return (
            <InteractiveCard
              key={slug}
              href={eventModuleHref(eventKey, slug)}
              className="flex min-h-20 items-center px-4 py-3 text-sm font-semibold sm:text-base"
            >
              {action.title}
            </InteractiveCard>
          );
        })}
      </div>
    </section>
  );
}
