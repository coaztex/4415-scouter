"use client";
import { Button } from "@/components/ui/button";
import { downloadDraft, type useMatchDraft } from "../use-draft";
import type { CaptureContext } from "../model";
export function DraftPanel({
  state,
  context,
  pending,
  error,
  override,
  setOverride,
  begin,
  reserve,
  attempt,
}: {
  state: ReturnType<typeof useMatchDraft>;
  context: CaptureContext;
  pending: boolean;
  error: string;
  override: boolean;
  setOverride: (value: boolean) => void;
  begin: () => void;
  reserve: () => Promise<void>;
  attempt: (fn: () => void) => void;
}) {
  const { draft } = state;
  return (
    <>
      {" "}
      {!state.loaded && <p role="status">Checking for a saved draft…</p>}
      {context.override && (
        <label className="mb-3 flex min-h-12 items-center gap-3 rounded-control border border-border bg-surface p-3">
          <input
            type="checkbox"
            className="size-5"
            checked={override}
            disabled={pending}
            onChange={(e) => setOverride(e.target.checked)}
          />
          Lead override: I am recording for this assigned scout. My identity
          will be recorded with the submission.
        </label>
      )}
      {(state.storageError || state.blocked) && (
        <p role="alert" className="mb-3 text-danger">
          {state.blocked ?? state.storageError}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-control border border-danger bg-surface p-3 text-danger"
        >
          {error}
        </p>
      )}
      {(draft || state.raw) && (
        <div className="mb-2 text-right">
          <button
            type="button"
            onClick={() =>
              downloadDraft(draft ? JSON.stringify(draft) : state.raw!)
            }
            className="min-h-12 text-sm underline"
          >
            Download draft backup
          </button>
        </div>
      )}
      {state.blocked && (
        <Button
          variant="secondary"
          onClick={() => {
            if (
              window.confirm(
                "Discard the saved draft on this device? Download it first if it contains observations you need.",
              )
            )
              attempt(() => state.clear());
          }}
        >
          Discard unusable draft
        </Button>
      )}
      {state.loaded && !state.blocked && !draft && (
        <section className="mx-auto max-w-xl space-y-5 py-6">
          <h2 className="text-2xl font-bold">
            {context.submitted
              ? "Already submitted"
              : "Ready to watch this robot"}
          </h2>
          <p>
            {context.submitted
              ? "This assignment is closed. Corrections require a separate review flow."
              : "One phase at a time: Auto → Teleop → Post-match. Estimates and activity changes save on this device after each tap."}
          </p>
          {!context.submitted && (
            <Button
              className="w-full min-h-16"
              disabled={context.override && !override}
              onClick={begin}
            >
              Start Auto
            </Button>
          )}
        </section>
      )}
      {state.recovery && !state.blocked && draft && (
        <section className="mx-auto max-w-xl space-y-4">
          <h2 className="text-2xl font-bold">Saved draft found</h2>
          <p>
            Resume {draft.phase}. Estimated FUEL: Auto{" "}
            {draft.data.auto.estimated_fuel_scored ?? "unknown"}, Teleop{" "}
            {draft.data.teleop.estimated_fuel_scored ?? "unknown"}.{" "}
            {draft.phase === "teleop"
              ? "The saved activity remains active across the interruption. If you could not observe the robot during the gap, explicitly omit the timeline before submitting."
              : ""}
          </p>
          <Button
            disabled={context.override && !override}
            onClick={() => {
              state.setRecovery(false);
              state.now();
              if (!context.submitted) void reserve();
            }}
          >
            Resume draft
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (
                window.confirm(
                  "Discard this local draft and its observations? Download a backup first if needed.",
                )
              )
                attempt(() => state.clear());
            }}
          >
            Discard and restart
          </Button>
        </section>
      )}
    </>
  );
}
