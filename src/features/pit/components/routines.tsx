"use client";
import { Button } from "@/components/ui/button";
import type { RebuiltPitData } from "@/games/2026-rebuilt/pit-schema";
import { newRoutine } from "../model";
import { Choice, yesNo } from "./fields";
type Routine = NonNullable<RebuiltPitData["autonomous_routines"]>[number];
export function AutoRoutines({
  data,
  change,
}: {
  data: RebuiltPitData;
  change: (fn: (d: RebuiltPitData) => RebuiltPitData) => void;
}) {
  const rows = data.autonomous_routines ?? [];
  function setRows(next: Routine[]) {
    change((d) => ({ ...d, autonomous_routines: next.length ? next : null }));
  }
  function patch(id: string, fields: Partial<Routine>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...fields } : r)));
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Autonomous routines</h2>
          <p className="text-sm text-muted">Team-reported routines.</p>
        </div>
        <Button
          variant="secondary"
          disabled={rows.length >= 20}
          onClick={() => setRows([...rows, newRoutine(crypto.randomUUID())])}
        >
          Add routine
        </Button>
      </div>
      {rows.map((r, index) => (
        <div
          key={r.id}
          className="space-y-4 rounded-card border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Routine {index + 1}</h3>
            <Button
              variant="secondary"
              onClick={() => setRows(rows.filter((other) => other.id !== r.id))}
            >
              Remove
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              id={`routine-side-${r.id}`}
              label="Start side"
              value={r.start_side}
              options={[
                ["left", "Left"],
                ["center", "Center"],
                ["right", "Right"],
                ["unknown", "Unknown"],
              ]}
              onChange={(start_side) => patch(r.id, { start_side })}
            />
            <Choice
              id={`routine-score-${r.id}`}
              label="Scores FUEL"
              value={r.scores_fuel}
              options={yesNo}
              onChange={(scores_fuel) => patch(r.id, { scores_fuel })}
            />
            <Choice
              id={`routine-collect-${r.id}`}
              label="Collects additional FUEL"
              value={r.collects_additional_fuel}
              options={yesNo}
              onChange={(collects_additional_fuel) =>
                patch(r.id, { collects_additional_fuel })
              }
            />
            <Choice
              id={`routine-reliability-${r.id}`}
              label="Claimed reliability"
              value={r.reliability_claim}
              options={[
                ["unknown", "Unknown"],
                ["untested", "Untested"],
                ["inconsistent", "Inconsistent"],
                ["usually", "Usually"],
                ["consistent", "Consistent"],
              ]}
              onChange={(reliability_claim) =>
                patch(r.id, { reliability_claim })
              }
            />
            <Choice
              id={`routine-climb-${r.id}`}
              label="Auto climb (optional)"
              value={r.climb?.result ?? ""}
              options={[
                ["", "Not mentioned"],
                ["none", "None"],
                ["attempted", "Attempted"],
                ["achieved", "Achieved"],
              ]}
              onChange={(result) =>
                patch(r.id, { climb: result ? { result } : undefined })
              }
            />
            {r.climb?.result === "achieved" && (
              <Choice
                id={`routine-climb-level-${r.id}`}
                label="Achieved level (optional)"
                value={r.climb.achieved_level ?? ""}
                options={[
                  ["", "Not provided"],
                  ["level_1", "Level 1"],
                ]}
                onChange={(level) =>
                  patch(r.id, {
                    climb: {
                      result: "achieved",
                      ...(level ? { achieved_level: level } : {}),
                    },
                  })
                }
              />
            )}
          </div>
          <label
            className="block text-sm font-bold"
            htmlFor={`routine-note-${r.id}`}
          >
            Short routine note (optional)
          </label>
          <textarea
            id={`routine-note-${r.id}`}
            maxLength={500}
            rows={2}
            value={r.note ?? ""}
            onChange={(e) => patch(r.id, { note: e.target.value || undefined })}
            className="w-full rounded-control border border-border p-3"
          />
        </div>
      ))}
    </section>
  );
}
