"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { issueSchema } from "@/games/2026-rebuilt/match-schema";
import { issueCategory } from "@/games/2026-rebuilt/shared";
import { Button } from "@/components/ui/button";
import { Choice, yesNo } from "./controls";
export type CapturedIssue = z.infer<typeof issueSchema>;
const labels: Record<CapturedIssue["observed"]["category"], string> = {
  disabled: "Disabled / no movement",
  communications: "Communications observed",
  drivetrain: "Drivetrain impaired",
  intake: "Intake issue",
  shooter_scorer: "Scorer / shooter issue",
  tipped: "Tipped",
  other: "Other",
};
export const issueOptions = issueCategory.options.map(
  (k) => [k, labels[k]] as const,
);
export function IssueSheet({
  phase,
  at,
  onSave,
  onClose,
}: {
  phase: "auto" | "teleop";
  at: number | null;
  onSave: (issue: CapturedIssue) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [category, setCategory] =
      useState<CapturedIssue["observed"]["category"]>("disabled"),
    [description, setDescription] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="issue-title"
      className="m-auto w-[min(95vw,32rem)] max-h-[90dvh] overflow-auto rounded-card border border-border bg-surface p-5 text-foreground backdrop:bg-black/50"
    >
      <h2 id="issue-title" className="text-xl font-bold">
        Robot issue
      </h2>
      <p className="my-3 text-sm text-muted">
        Record observed symptoms, not a suspected cause.
      </p>
      <Choice
        label="Observed issue"
        value={category}
        options={issueOptions}
        onChange={setCategory}
      />
      <label className="mt-4 block" htmlFor="issue-description">
        Brief observation (optional)
      </label>
      <textarea
        id="issue-description"
        value={description}
        maxLength={500}
        rows={2}
        onChange={(e) => setDescription(e.target.value)}
        className="mt-2 w-full rounded-control border border-border p-3"
      />
      <div className="mt-5 flex gap-3">
        <Button
          onClick={() => {
            onSave({
              id: crypto.randomUUID(),
              phase,
              at_seconds: at,
              observed: {
                category,
                ...(description.trim()
                  ? { description: description.trim() }
                  : {}),
              },
              recovered: "unknown",
            });
            onClose();
          }}
        >
          Save issue
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </dialog>
  );
}
export function IssueReview({
  issues,
  change,
}: {
  issues: CapturedIssue[];
  change: (issues: CapturedIssue[]) => void;
}) {
  return (
    <div className="space-y-3">
      {issues.map((issue, index) => (
        <details
          key={issue.id}
          className="rounded-control border border-border p-3"
        >
          <summary className="min-h-12 cursor-pointer py-3 font-bold">
            {labels[issue.observed.category]} · {issue.phase}
            {issue.at_seconds !== null
              ? ` · ${issue.at_seconds.toFixed(1)}s`
              : ""}
          </summary>
          <div className="space-y-3">
            <Choice
              label={`Issue ${index + 1} category`}
              value={issue.observed.category}
              options={issueOptions}
              onChange={(category) =>
                change(
                  issues.map((i) =>
                    i.id === issue.id
                      ? { ...i, observed: { ...i.observed, category } }
                      : i,
                  ),
                )
              }
            />
            <Choice
              label={`Issue ${index + 1} recovered`}
              value={issue.recovered ?? "unknown"}
              options={yesNo}
              onChange={(recovered) =>
                change(
                  issues.map((i) =>
                    i.id === issue.id ? { ...i, recovered } : i,
                  ),
                )
              }
            />
            <label className="block" htmlFor={`issue-note-${issue.id}`}>
              Observed details
            </label>
            <textarea
              id={`issue-note-${issue.id}`}
              rows={2}
              maxLength={500}
              value={issue.observed.description ?? ""}
              className="w-full rounded-control border border-border p-3"
              onChange={(e) =>
                change(
                  issues.map((i) =>
                    i.id === issue.id
                      ? {
                          ...i,
                          observed: {
                            ...i.observed,
                            description: e.target.value.trim() || undefined,
                          },
                        }
                      : i,
                  ),
                )
              }
            />
            <Button
              variant="secondary"
              onClick={() => change(issues.filter((i) => i.id !== issue.id))}
            >
              Remove mistaken issue
            </Button>
          </div>
        </details>
      ))}
    </div>
  );
}
