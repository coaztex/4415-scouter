"use client";
import { startTransition, useState, useRef } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import {
  advancePhase,
  blankBoard,
  duplicatePhase,
  phaseHasEdits,
  type PhaseState,
} from "../model";
import type { StrategyBoardContext } from "../server/queries";
import { FieldBoard, type Tool } from "./field";
import { stationSlots } from "../station-palette";
import { useBoardSession } from "./use-board-session";

const tools: readonly { id: Tool; label: string }[] = [
  { id: "select", label: "Select / move robot" },
  { id: "pen", label: "Pen" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "circle", label: "Zone / circle" },
  { id: "text", label: "Text" },
  { id: "eraser", label: "Eraser" },
  { id: "pan", label: "Pan" },
];
export function StrategyBoard({ context }: { context: StrategyBoardContext }) {
  return context.viewOnly ? (
    <ScoutBoard context={context} />
  ) : (
    <StrategyBoardEditor context={context} />
  );
}
function ScoutBoard({ context }: { context: StrategyBoardContext }) {
  const phaseId = context.config.phases[0].id;
  return (
    <div className="min-w-0 space-y-3">
      <Link
        className="inline-flex min-h-11 items-center text-sm text-accent"
        href={`/events/${encodeURIComponent(context.eventKey)}/matches/${encodeURIComponent(context.matchKey)}`}
      >
        ← Match Details
      </Link>
      <PageHeading
        title={`Strategy Board · ${context.matchLabel}`}
        description={`${context.eventKey} · View only`}
      />
      <FieldBoard
        config={context.config}
        phaseId={phaseId}
        state={context.document.phases[phaseId]}
        tool="pan"
        editable={false}
        owner={null}
        text=""
        onChange={() => {}}
      />
    </div>
  );
}
function StrategyBoardEditor({ context }: { context: StrategyBoardContext }) {
  const session = useBoardSession(context);
  const importInput = useRef<HTMLInputElement>(null);
  const [phaseId, setPhaseId] = useState(context.config.phases[0].id),
    [live, setLive] = useState(false),
    [tool, setTool] = useState<Tool>("select"),
    [text, setText] = useState("");
  const [ownerStation, setOwnerStation] = useState<string>(
    context.lineup[0]?.stationLabel ?? "",
  );
  const phase = session.document.phases[phaseId],
    index = context.config.phases.findIndex((p) => p.id === phaseId),
    owner = phase.markers.find((m) => m.station === ownerStation) ?? null;
  const editable =
    session.ready && !context.readOnly && !live && !session.saving;
  const button =
    "min-h-11 rounded-control border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40";
  function change(next: PhaseState) {
    session.edit({
      ...session.document,
      phases: { ...session.document.phases, [phaseId]: next },
    });
  }
  function duplicate() {
    if (index < 1) return;
    const defaults = blankBoard(
      context.gameSlug,
      context.config,
      context.lineup,
    ).phases[phaseId];
    if (
      phaseHasEdits(phase, defaults) &&
      !window.confirm(
        "Replace this phase’s markers and drawings with the previous phase? Its notes will remain.",
      )
    )
      return;
    session.edit(
      duplicatePhase(
        session.document,
        context.config.phases[index - 1].id,
        phaseId,
      ),
    );
  }
  function clear() {
    if (
      !window.confirm(
        "Clear current phase drawings, reset robot positions and clear its notes? Other phases will remain.",
      )
    )
      return;
    change(
      blankBoard(context.gameSlug, context.config, context.lineup).phases[
        phaseId
      ],
    );
  }
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-4 text-sm font-bold text-accent">
        <Link
          className="inline-flex min-h-11 items-center"
          href={`/events/${encodeURIComponent(context.eventKey)}/match-prep?match=${encodeURIComponent(context.matchKey)}`}
        >
          ← Match Prep
        </Link>
        <Link
          className="inline-flex min-h-11 items-center"
          href={`/events/${encodeURIComponent(context.eventKey)}/matches/${encodeURIComponent(context.matchKey)}`}
        >
          Match Details
        </Link>
      </div>
      <PageHeading
        title={`Strategy Board · ${context.matchLabel}`}
        description={`${context.eventKey} · ${context.matchKey} · ${live ? "Live Mode" : "Planning Mode"}`}
      />
      {context.lineup.length !== 6 && (
        <p role="status" className="text-warning">
          Incomplete station roster. Sync the match schedule.
        </p>
      )}
      {context.readOnly && (
        <p className="text-muted">Archived event · read only</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!live ? (
          <button
            type="button"
            className={button}
            onClick={() => {
              setPhaseId(context.config.phases[0].id);
              setLive(true);
            }}
          >
            Start Match
          </button>
        ) : (
          <>
            <button
              type="button"
              className={button}
              onClick={() => setPhaseId(context.config.phases[0].id)}
            >
              Start Match
            </button>
            <button
              type="button"
              className={button}
              disabled={index === 0}
              onClick={() =>
                setPhaseId(advancePhase(context.config, phaseId, -1))
              }
            >
              Previous Phase
            </button>
            <button
              type="button"
              className={button}
              disabled={index === context.config.phases.length - 1}
              onClick={() =>
                setPhaseId(advancePhase(context.config, phaseId, 1))
              }
            >
              Next Phase
            </button>
            <button
              type="button"
              className={button}
              onClick={() => setLive(false)}
            >
              Exit Live Mode
            </button>
          </>
        )}
        <span role="status" className="text-sm text-muted">
          {!session.online ? "Offline · " : ""}
          {session.dirty
            ? "Unsynced edits"
            : `Saved revision ${session.revision === 0 ? "—" : session.revision}`}
          {session.deviceSaving ? " · saving device draft" : ""}
        </span>
      </div>
      {live ? (
        <div>
          <h2 className="text-2xl font-bold">
            {context.config.phases[index].label}
          </h2>
        </div>
      ) : (
        <nav aria-label="Strategy phases" className="flex flex-wrap gap-2">
          {context.config.phases.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`${button} ${phaseId === p.id ? "bg-accent text-on-accent" : ""}`}
              aria-pressed={phaseId === p.id}
              onClick={() => setPhaseId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
      )}
      <div aria-label="Match team legend" className="flex flex-wrap gap-2">
        {stationSlots(phase.markers).map(
          ({ station, team, alliance, color }) => (
            <button
              type="button"
              key={station}
              className={`${button} ${ownerStation === station ? "ring-2 ring-accent" : ""}`}
              aria-label={`${station} · ${team?.teamNumber ?? "Unknown"}`}
              aria-pressed={ownerStation === station}
              disabled={!team}
              onClick={() => setOwnerStation(station)}
            >
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />{" "}
              {station} · {team?.teamNumber ?? "Unknown"}
              <span className="ml-2 text-xs text-muted">
                {alliance === "red" ? "Red" : "Blue"}
              </span>
            </button>
          ),
        )}
      </div>
      {!live && !context.readOnly && (
        <Card className="!p-3 space-y-3">
          <div
            role="toolbar"
            aria-label="Drawing tools"
            className="flex flex-wrap gap-2"
          >
            {tools.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`${button} ${tool === t.id ? "bg-accent text-on-accent" : ""}`}
                aria-pressed={tool === t.id}
                disabled={
                  (!editable && t.id !== "pan") ||
                  (!owner &&
                    ["pen", "line", "arrow", "circle", "text"].includes(t.id))
                }
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              className={button}
              disabled={!editable || !session.canUndo}
              onClick={session.undo}
            >
              Undo
            </button>
            <button
              type="button"
              className={button}
              disabled={!editable || !session.canRedo}
              onClick={session.redo}
            >
              Redo
            </button>
            <button
              type="button"
              className={button}
              disabled={!editable || index === 0}
              onClick={duplicate}
            >
              Duplicate previous phase
            </button>
            <button
              type="button"
              className={button}
              disabled={!editable}
              onClick={clear}
            >
              Clear current phase
            </button>
          </div>
          {tool === "text" && (
            <label className="grid gap-1 text-sm">
              Text label
              <input
                className="min-h-11 rounded-control border border-border bg-surface px-3"
                value={text}
                maxLength={200}
                onChange={(e) => setText(e.target.value)}
              />
              <span className="text-xs text-muted">
                Enter text, then tap the field to place it.
              </span>
            </label>
          )}
          {tool === "select" && owner && (
            <div
              className="flex flex-wrap items-center gap-2 text-sm"
              aria-label="Selected robot position"
            >
              <span>
                {owner.station} · {owner.teamNumber}
              </span>
              {[
                { label: "Move robot left", x: -0.02, y: 0 },
                { label: "Move robot right", x: 0.02, y: 0 },
                { label: "Move robot up", x: 0, y: -0.02 },
                { label: "Move robot down", x: 0, y: 0.02 },
              ].map((move) => (
                <button
                  type="button"
                  className={button}
                  key={move.label}
                  disabled={!editable}
                  onClick={() =>
                    change({
                      ...phase,
                      markers: phase.markers.map((m) =>
                        m.station === owner.station
                          ? {
                              ...m,
                              position: {
                                x: Math.max(
                                  0,
                                  Math.min(1, m.position.x + move.x),
                                ),
                                y: Math.max(
                                  0,
                                  Math.min(1, m.position.y + move.y),
                                ),
                              },
                            }
                          : m,
                      ),
                    })
                  }
                >
                  {move.label.replace("Move robot ", "")}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
      {phase.objects.length >= 300 && (
        <p role="status" className="text-warning">
          300-drawing limit reached. Delete unused drawings to continue.
        </p>
      )}
      <FieldBoard
        key={`${phaseId}:${live}`}
        config={context.config}
        phaseId={phaseId}
        state={phase}
        tool={live || context.readOnly ? "pan" : tool}
        editable={editable}
        owner={owner}
        text={text}
        onChange={change}
      />
      {live ? (
        <Card className="!p-4">
          <h3 className="font-bold">Phase notes</h3>
          <p className="whitespace-pre-wrap">
            {phase.notes || "No phase notes."}
          </p>
        </Card>
      ) : (
        <label className="grid gap-1 font-bold">
          Phase notes · {context.config.phases[index].label}
          <textarea
            rows={3}
            className="w-full rounded-control border border-border bg-surface p-3 font-normal"
            value={phase.notes}
            maxLength={4000}
            readOnly={!editable}
            onChange={(e) => change({ ...phase, notes: e.target.value })}
          />
        </label>
      )}
      {!live && (
        <div className="flex flex-wrap items-center gap-2">
          {!context.readOnly && (
            <button
              type="button"
              className={`${button} bg-accent text-on-accent`}
              disabled={!session.ready || session.saving || session.conflict}
              onClick={() => startTransition(() => void session.save())}
            >
              {session.saving ? "Saving…" : "Save board"}
            </button>
          )}
          <details className="w-full">
            <summary className="min-h-11 w-fit cursor-pointer py-2 text-sm font-semibold">
              More
            </summary>
            <div className="grid w-fit gap-1">
              {!context.readOnly && (
                <button
                  type="button"
                  className={button}
                  disabled={session.saving}
                  onClick={() => void session.loadSaved()}
                >
                  Load saved board
                </button>
              )}
              <button
                type="button"
                className={button}
                onClick={session.exportDraft}
              >
                Export device draft
              </button>
              {!context.readOnly && (
                <button
                  type="button"
                  className={button}
                  disabled={!session.ready || session.saving}
                  onClick={() => importInput.current?.click()}
                >
                  Import device draft
                </button>
              )}
            </div>
          </details>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            aria-label="Import device draft file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void session.importDraft(file);
            }}
          />
          <span className="text-xs text-muted">
            Device draft · Save board to sync.
          </span>
        </div>
      )}
      {(session.message || session.storageError) && (
        <p role="status" className="text-sm text-warning">
          {session.message} {session.storageError}
        </p>
      )}
    </div>
  );
}
