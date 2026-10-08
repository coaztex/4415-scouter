"use client";
import {
  observedRoles,
  reliabilityStatuses,
} from "@/games/2026-rebuilt/match-schema";
import { Button } from "@/components/ui/button";
import { needsDefense, type MatchDraft } from "../model";
import { Choice, yesNo } from "./controls";
import { IssueReview } from "./issues";
const roleLabels = {
  scorer: "Scorer",
  passer_feeder: "Passer-Feeder",
  defender: "Defender",
  mixed: "Mixed",
  inactive: "Inactive",
};
const statusLabels = {
  normal: "Normal",
  minor_issue: "Minor issue",
  major_issue: "Major issue",
  DNF: "DNF",
  DNS: "DNS",
};
export function PostFields({
  draft,
  change,
  dns,
}: {
  draft: MatchDraft;
  change: (fn: (d: MatchDraft) => MatchDraft) => void;
  dns: () => void;
}) {
  const p = draft.data.post_match,
    defense = needsDefense(draft.data);
  const patch = (fields: Partial<typeof p>) =>
    change((d) => ({
      ...d,
      data: { ...d.data, post_match: { ...d.data.post_match, ...fields } },
    }));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Choice
          label="Primary observed role"
          value={p.observed_role}
          options={observedRoles.map((k) => [k, roleLabels[k]] as const)}
          onChange={(observed_role) => patch({ observed_role })}
        />
        <Choice
          label="Robot reliability / status"
          value={p.reliability}
          options={reliabilityStatuses.map(
            (k) => [k, statusLabels[k]] as const,
          )}
          onChange={(reliability) => {
            if (reliability === "DNS") dns();
            else patch({ reliability });
          }}
        />
        <Choice
          label="FUEL estimate confidence"
          value={p.fuel_estimate_confidence}
          options={[
            ["good", "Good"],
            ["rough", "Rough"],
            ["very_uncertain", "Very uncertain"],
          ]}
          onChange={(fuel_estimate_confidence) =>
            patch({ fuel_estimate_confidence })
          }
        />
      </div>
      {p.reliability === "DNS" && (
        <p role="status">
          DNS: FUEL and activity are unknown. To undo DNS, discard this draft
          and restart.
        </p>
      )}
      {p.reliability !== "DNS" && (
        <>
          {!defense && (
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-5"
                checked={p.defense_observed}
                onChange={(e) =>
                  patch({
                    defense_observed: e.target.checked,
                    defense_effectiveness: undefined,
                  })
                }
              />
              Defense was observed despite no meaningful timed defense
            </label>
          )}
          {defense && (
            <div className="flex flex-wrap items-end gap-3">
              <Choice
                label="Defense effectiveness"
                value={p.defense_effectiveness ?? ""}
                options={[
                  ["", "Choose effectiveness"],
                  ["poor", "Poor"],
                  ["average", "Average"],
                  ["strong", "Strong"],
                ]}
                onChange={(v) =>
                  patch({ defense_effectiveness: v || undefined })
                }
              />
              {p.defense_observed && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    patch({
                      defense_observed: false,
                      defense_effectiveness: undefined,
                    })
                  }
                >
                  Clear manual defense observation
                </Button>
              )}
            </div>
          )}
        </>
      )}
      <IssueReview
        issues={draft.data.issues ?? []}
        change={(issues) =>
          change((d) => ({ ...d, data: { ...d.data, issues } }))
        }
      />
      <details className="rounded-control border border-border p-3">
        <summary className="min-h-12 cursor-pointer py-3 font-bold">
          Supporting observations · optional
        </summary>
        <div className="grid gap-4 sm:grid-cols-2">
          {(p.reliability !== "normal" || !!draft.data.issues?.length) && (
            <Choice
              label="Recovered"
              value={p.recovered ?? "unknown"}
              options={yesNo}
              onChange={(recovered) => patch({ recovered })}
            />
          )}
          <Choice
            label="Driver control"
            value={p.driver_control ?? "unknown"}
            options={[
              ["rough", "Rough"],
              ["average", "Average"],
              ["strong", "Strong"],
              ["unknown", "Unknown"],
            ]}
            onChange={(driver_control) => patch({ driver_control })}
          />
          {p.reliability !== "DNS" && (
            <Choice
              label="Climb (secondary)"
              value={p.climb ?? "none"}
              options={[
                ["none", "None"],
                ["attempted", "Attempted"],
                ["level_1", "Level 1"],
                ["level_2", "Level 2"],
                ["level_3", "Level 3"],
              ]}
              onChange={(climb) => patch({ climb })}
            />
          )}
        </div>
      </details>
      <label htmlFor="important-note" className="block text-sm font-bold">
        Important note (optional)
      </label>
      <textarea
        id="important-note"
        rows={2}
        maxLength={500}
        value={p.important_note ?? ""}
        onChange={(e) =>
          patch({
            important_note: e.target.value.trim() ? e.target.value : undefined,
          })
        }
        className="w-full rounded-control border border-border bg-surface p-3"
      />
    </div>
  );
}
