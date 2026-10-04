"use client";
import { useEffect, useRef, useState } from "react";
import { useSync, QueueNotice } from "@/features/offline/sync-provider";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  activity,
  addObservedIssue,
  advance,
  finalPayload,
  draftKey,
  freshDraft,
  fuel,
  markDns,
  omitTiming,
  type CaptureContext,
} from "../model";
import { useMatchDraft, downloadDraft } from "../use-draft";
import { startCapture } from "../server/actions";
import { AutoFields } from "./auto";
import { ActivityPicker } from "./activity-picker";
import { FuelCounter, PhaseAdvance } from "./controls";
import { IssueSheet } from "./issues";
import { PostFields } from "./post";
import "./workflow.css";
import { DraftPanel } from "./draft-panel";
export function MatchWorkflow({ context }: { context: CaptureContext }) {
  const identity = {
    assignmentId: context.assignmentId,
    actorId: context.actorId,
    assignedScoutId: context.assignedScoutId,
    matchId: context.matchId,
    teamNumber: context.teamNumber,
  };
  const state = useMatchDraft(identity),
    { draft, change } = state,
    router = useRouter();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [override, setOverride] = useState(false),
    [issue, setIssue] = useState<{
      phase: "auto" | "teleop";
      at: number | null;
    } | null>(null);
  const schedule = `/events/${context.eventKey}/scouting`;
  const sync = useSync(),
    localKey = draftKey(identity),
    queued = sync.rows.find((row) => row.draftKey === localKey);
  const [sentHere, setSentHere] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (sentHere && queued?.state === "synced") {
      router.push(`${schedule}?submitted=1#next-assignment`);
      router.refresh();
    }
  }, [sentHere, queued?.state, router, schedule]);
  function attempt(fn: () => void) {
    try {
      setError("");
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the draft.");
    }
  }
  function exit() {
    if (
      !draft ||
      window.confirm(
        "Leave this match? Your local draft will be available when you return on this device.",
      )
    )
      router.push(schedule);
  }
  async function reserve() {
    try {
      const result = await startCapture({ identity, override });
      if (result.error) setError(result.error);
    } catch {
      setError(
        "Working offline. Ownership will be checked when this draft syncs.",
      );
    }
  }
  function begin() {
    state.write(freshDraft(identity, Date.now(), crypto.randomUUID()));
    state.now();
    void reserve();
  }
  function dns() {
    if (
      window.confirm(
        "Mark DNS? This explicitly clears offensive estimates and timing to unknown and sets the role to Inactive. Issue observations remain.",
      )
    )
      attempt(() => change((d) => markDns(d, state.now())));
  }
  function openIssue() {
    if (!draft || draft.phase === "post") return;
    const now = state.now(),
      seconds =
        (now -
          (draft.phase === "auto" ? draft.startedMs : draft.teleopStartedMs!)) /
        1000;
    setIssue({
      phase: draft.phase,
      at: seconds >= 0 && seconds <= 600 ? seconds : null,
    });
  }
  async function submit() {
    if (!draft || submitting.current) return;
    try {
      setError("");
      finalPayload(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review the fields.");
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      await state.flush();
      await sync.queue({
        type: "match",
        actorId: context.actorId,
        eventId: context.eventId,
        eventKey: context.eventKey,
        draftKey: localKey,
        draft,
        override,
      });
      setSentHere(true);
    } catch {
      setError(
        "Could not save this submission to the device queue. Keep this page open and download a draft backup.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  const ready =
    sync.loaded &&
    !queued &&
    state.loaded &&
    !state.blocked &&
    !state.recovery &&
    !!draft;
  return (
    <div
      className="match-capture fixed inset-0 z-40 flex flex-col bg-background"
      aria-label="Match scouting workflow"
      data-phase={draft?.phase}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2">
        <div>
          <h1 className="font-bold">
            {context.matchKey.split("_").at(-1)?.toUpperCase()} · Team{" "}
            {context.teamNumber}
          </h1>
          <p className="text-sm capitalize">
            {context.alliance} · Station {context.station}
            {draft
              ? ` · ${draft.phase === "post" ? "Post-match" : draft.phase.toUpperCase()}`
              : ""}
          </p>
          <p
            className={`text-xs ${state.storageError ? "text-danger" : "text-muted"}`}
            role="status"
          >
            {state.online ? "Online" : "Offline"} ·{" "}
            {draft
              ? state.storageError
                ? "Draft in memory only"
                : state.saving
                  ? "Saving device draft…"
                  : "Draft saved on this device"
              : "Not started"}
          </p>
        </div>
        <Button variant="secondary" onClick={exit} disabled={pending}>
          Schedule
        </Button>
      </header>
      {!state.online && (
        <p
          role="alert"
          className="border-b border-danger bg-surface px-4 py-2 text-center text-sm font-bold text-danger"
        >
          Offline — your draft stays on this device; submission will sync when
          connected.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {queued ? (
          <div className="space-y-2">
            <QueueNotice record={queued} />
            {draft && (
              <button
                className="min-h-12 text-sm underline"
                onClick={() => downloadDraft(JSON.stringify(draft))}
              >
                Export this tab’s draft for review
              </button>
            )}
          </div>
        ) : (
          <DraftPanel
            state={state}
            context={context}
            pending={pending}
            error={error}
            override={override}
            setOverride={setOverride}
            begin={begin}
            reserve={reserve}
            attempt={attempt}
          />
        )}
        {ready && draft && (
          <fieldset
            disabled={pending || (context.override && !override)}
            className="mx-auto max-w-5xl space-y-4"
          >
            {draft.timingFault && (
              <div
                role="alert"
                className="rounded-control border border-danger bg-surface p-3"
              >
                <p>{draft.timingFault}</p>
                <p className="mt-2 text-sm">
                  Correct the clock if needed. Keep a backup before choosing to
                  mark activity timing unknown.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Omit activity timing as unknown? FUEL and issues will remain. No durations will be invented.",
                      )
                    )
                      attempt(() => change((d) => omitTiming(d, state.now())));
                  }}
                >
                  Finish without activity timing
                </Button>
              </div>
            )}
            {draft.phase === "auto" && (
              <>
                <FuelCounter
                  phase="AUTO"
                  total={draft.data.auto.estimated_fuel_scored}
                  canUndo={!!draft.autoUndo.length}
                  onTap={(n) => change((d) => fuel(d, n))}
                />
                <AutoFields draft={draft} change={change} />
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={openIssue}>
                    Robot issue
                  </Button>
                  <PhaseAdvance
                    phase="auto"
                    onAdvance={() =>
                      attempt(() => {
                        const now = state.now();
                        change((d) => advance(d, now));
                      })
                    }
                  />
                  <Button variant="secondary" onClick={dns}>
                    Robot did not start (DNS)
                  </Button>
                </div>
              </>
            )}
            {draft.phase === "teleop" && (
              <>
                <div className="teleop-live">
                  <FuelCounter
                    phase="TELEOP"
                    total={draft.data.teleop.estimated_fuel_scored}
                    canUndo={!!draft.teleopUndo.length}
                    onTap={(n) => {
                      state.now();
                      change((d) => fuel(d, n));
                    }}
                  />
                  <ActivityPicker
                    current={draft.transitions.at(-1)!.state}
                    onSelect={(value) => {
                      const now = state.now();
                      change((d) => activity(d, value, now));
                    }}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={openIssue}
                  >
                    Robot issue
                  </Button>
                  <PhaseAdvance
                    phase="teleop"
                    className="flex-1"
                    onAdvance={() =>
                      attempt(() => {
                        const now = state.now();
                        change((d) => advance(d, now));
                      })
                    }
                  />
                </div>
              </>
            )}
            {draft.phase === "post" && (
              <>
                <h2 className="text-xl font-bold">Post-match</h2>
                <PostFields draft={draft} change={change} dns={dns} />
                <Button
                  className="w-full min-h-16"
                  onClick={() => void submit()}
                  disabled={pending}
                >
                  {pending ? "Confirming submission…" : "Submit match"}
                </Button>
                <details className="text-sm text-muted">
                  <summary className="min-h-12 cursor-pointer py-3">
                    Review estimates / timing
                  </summary>
                  <p>
                    Auto FUEL:{" "}
                    {draft.data.auto.estimated_fuel_scored ?? "unknown"} ·
                    Teleop FUEL:{" "}
                    {draft.data.teleop.estimated_fuel_scored ?? "unknown"}.
                    These are estimates.
                  </p>
                  <p>
                    Activity timing:{" "}
                    {draft.data.teleop.activity
                      ? `${draft.data.teleop.activity.transitions.length} transitions over ${draft.data.teleop.activity.duration_seconds.toFixed(1)} seconds`
                      : "unknown"}
                    .
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Explicitly omit the observed activity timeline? Export a backup first. Estimates and issues are retained.",
                        )
                      )
                        attempt(() =>
                          change((d) => omitTiming(d, state.now())),
                        );
                    }}
                  >
                    Mark activity timing unknown
                  </Button>
                </details>
              </>
            )}
          </fieldset>
        )}
      </div>
      {issue && (
        <IssueSheet
          phase={issue.phase}
          at={issue.at}
          onClose={() => setIssue(null)}
          onSave={(entry) =>
            attempt(() => change((d) => addObservedIssue(d, entry)))
          }
        />
      )}
    </div>
  );
}
