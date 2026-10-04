"use client";
import { useState, useEffect, useRef } from "react";
import { useSync, QueueNotice } from "@/features/offline/sync-provider";
import { useDeviceDraft } from "@/features/offline/use-device-draft";
import { pitDeviceDraftSchema, pitDraftKey } from "../device-draft";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  rebuiltPitSchema,
  type RebuiltPitData,
} from "@/games/2026-rebuilt/pit-schema";
import { blankPit, preparePit, type PitStatus } from "../model";
import { claimPit } from "../server/actions";
import { PitCapabilities } from "./fields";
import { AutoRoutines } from "./routines";
import { RobotPhotoUpload } from "@/features/robot-media/components/photo-upload";
type Context = {
  eventId: string;
  eventKey: string;
  eventStatus: string;
  teamNumber: number;
  nickname: string | null;
  actorId: string;
  status: PitStatus;
  claimedBy: string | null;
  ownDraft: {
    client_submission_id: string;
    game_data: RebuiltPitData;
    revision: number;
  } | null;
  priorFinal: {
    id: string;
    scout_user_id: string;
    game_data: unknown;
    updated_at: string;
  } | null;
};
export function PitForm({ context }: { context: Context }) {
  const localKey = pitDraftKey(
    context.actorId,
    context.eventId,
    context.teamNumber,
  );
  const storage = useDeviceDraft(localKey, context.actorId),
    sync = useSync();
  const queued = sync.rows.find((row) => row.draftKey === localKey);
  const [localReady, setLocalReady] = useState(false),
    [sentHere, setSentHere] = useState(false);
  const submitting = useRef(false);
  const router = useRouter(),
    [claimed, setClaimed] = useState(
      context.claimedBy === context.actorId && context.status === "in_progress",
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [data, setData] = useState<RebuiltPitData>(
      context.ownDraft?.game_data ?? blankPit(),
    ),
    [clientId, setClientId] = useState(
      context.ownDraft?.client_submission_id ?? "",
    ),
    [revision, setRevision] = useState(context.ownDraft?.revision ?? 0);
  const [capacityMode, setCapacityMode] = useState<
      "approximate_count" | "band"
    >(data.fuel_capacity.kind),
    [numeric, setNumeric] = useState(
      data.fuel_capacity.kind === "approximate_count"
        ? String(data.fuel_capacity.amount)
        : "",
    );
  const other =
      context.claimedBy !== null && context.claimedBy !== context.actorId,
    [takeover, setTakeover] = useState(false);
  const list = `/events/${context.eventKey}/pit`,
    closed = context.status === "completed" || context.eventStatus !== "active";
  useEffect(() => {
    if (!storage.loaded) return;
    const frame = requestAnimationFrame(() => {
      try {
        if (storage.initial) {
          const saved = pitDeviceDraftSchema.parse(JSON.parse(storage.initial));
          setData(saved.data);
          setClientId(saved.clientId);
          setRevision(saved.revision);
          setCapacityMode(saved.capacityMode);
          setNumeric(saved.numeric);
          setClaimed(saved.claimed);
          setMessage("Recovered your pit draft from this device.");
        } else if (!clientId) setClientId(crypto.randomUUID());
        setLocalReady(true);
      } catch {
        setError(
          "The saved device draft needs review. Export it before making changes; it has not been overwritten.",
        );
      }
    });
    return () => cancelAnimationFrame(frame);
    // Restore once per keyed team route, without replacing subsequent edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage.loaded]);
  const serialized = JSON.stringify({
    data,
    clientId,
    revision,
    capacityMode,
    numeric,
    claimed,
  });
  useEffect(() => {
    if (localReady && sync.loaded && claimed && !queued && !closed)
      void storage.save(serialized).catch(() => undefined);
    // Serialize writes in the storage hook; only changed form content triggers one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, localReady, sync.loaded, claimed, queued, closed]);
  useEffect(() => {
    if (queued?.state === "synced" && sentHere) {
      router.push(`${list}?submitted=1`);
      router.refresh();
    }
  }, [queued?.state, sentHere, router, list]);
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (claimed && !queued && localReady) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => window.removeEventListener("beforeunload", leaving);
  }, [claimed, queued, localReady]);
  function exportDraft() {
    const url = URL.createObjectURL(
      new Blob([localReady ? serialized : (storage.initial ?? serialized)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `pit-${context.teamNumber}-draft.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function start() {
    if (other && !takeover) {
      setError(
        "Confirm takeover before starting a report claimed by another scout.",
      );
      return;
    }
    if (
      other &&
      !window.confirm(
        "Take over this team's pit report? The other scout's draft stays separate and cannot be overwritten.",
      )
    )
      return;
    setPending(true);
    setError("");
    if (!navigator.onLine) {
      setClaimed(true);
      setPending(false);
      setMessage(
        "Working offline. Other scouts cannot see this device draft yet; the claim will be checked on sync.",
      );
      return;
    }
    let result;
    try {
      result = await claimPit({
        eventId: context.eventId,
        teamNumber: context.teamNumber,
        takeover: other && takeover,
      });
    } catch {
      setClaimed(true);
      setPending(false);
      setMessage(
        "Connection unavailable. Work is local; the claim will be checked on sync.",
      );
      return;
    }
    setPending(false);
    if (!result.ok) {
      if (result.kind === "transient") {
        setClaimed(true);
        setMessage(
          "Connection unavailable. Work is local; the claim will be checked on sync.",
        );
        return;
      }
      setError(result.message ?? "Could not claim team.");
      return;
    }
    setClaimed(true);
    setMessage(
      other
        ? "You took over this report. Earlier drafts remain separate."
        : "Report started. Save a draft or submit when ready.",
    );
  }
  async function save(finalize: boolean) {
    if (pending || submitting.current) return;
    if (!finalize) {
      try {
        await storage.save(serialized);
        setMessage("Draft saved on this device.");
      } catch {
        setError(
          "Device draft save failed. Keep the page open and export a backup.",
        );
      }
      return;
    }
    let payload: RebuiltPitData;
    try {
      payload = preparePit(data, capacityMode, numeric);
    } catch {
      setError(
        "Check the shooter type, capacity and routine details. Other requires a shooter description; an approximate capacity must be a whole number from 0 to 10,000.",
      );
      return;
    }
    if (
      finalize &&
      !window.confirm(
        "Submit this pit conversation as complete? It will be locked against casual edits.",
      )
    )
      return;
    const id = clientId || crypto.randomUUID();
    if (!clientId) setClientId(id);
    submitting.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await storage.flush();
      await sync.queue({
        type: "pit",
        actorId: context.actorId,
        eventId: context.eventId,
        eventKey: context.eventKey,
        draftKey: localKey,
        teamNumber: context.teamNumber,
        clientSubmissionId: id,
        expectedRevision: revision,
        gameData: payload,
        takeover: false,
      });
      setSentHere(true);
    } catch {
      setError(
        "Could not save to the device queue. Keep this page open and export a draft backup.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  const prior =
    context.priorFinal &&
    rebuiltPitSchema.safeParse(context.priorFinal.game_data);
  return (
    <div className="space-y-5">
      <Link href={list} className={buttonStyles("secondary")}>
        ← Pit team list
      </Link>
      {context.eventStatus === "active" && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">Robot photo</h2>
          <RobotPhotoUpload
            eventKey={context.eventKey}
            teamNumber={context.teamNumber}
          />
        </Card>
      )}
      {(claimed || storage.initial) && !queued && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span role="status">
            {storage.saving
              ? "Saving device draft…"
              : storage.error
                ? "Device save failed"
                : "Draft saved on this device"}
          </span>
          <button onClick={exportDraft} className="min-h-12 underline">
            Export draft backup
          </button>
        </div>
      )}
      {storage.error && <p role="alert">{storage.error}</p>}
      {queued ? (
        <div className="space-y-2">
          <QueueNotice record={queued} />
          {localReady && (
            <button
              className="min-h-12 text-sm underline"
              onClick={exportDraft}
            >
              Export this tab’s draft for review
            </button>
          )}
        </div>
      ) : !localReady || !sync.loaded ? (
        <p role="status">Checking device draft…</p>
      ) : closed ? (
        <Card>
          <h2 className="text-xl font-bold">
            {context.status === "completed"
              ? "Pit report completed"
              : "Event archived"}
          </h2>
          <p className="mt-2">
            This report cannot be casually overwritten. Ask a strategy lead or
            administrator to review corrections.
          </p>
          {prior?.success && (
            <div className="mt-4 rounded-control bg-background p-3">
              <p className="font-bold">Submitted pit claims</p>
              <p>
                Mechanism: {prior.data.primary_scoring_mechanism}
                {prior.data.other_shooter_type
                  ? ` (${prior.data.other_shooter_type})`
                  : ""}
                . Drivetrain: {prior.data.drivetrain}. Capacity:{" "}
                {prior.data.fuel_capacity.kind === "approximate_count"
                  ? `about ${prior.data.fuel_capacity.amount} FUEL`
                  : prior.data.fuel_capacity.band}
                . Auto routines: {prior.data.autonomous_routines?.length ?? 0}.
              </p>
            </div>
          )}
        </Card>
      ) : !claimed ? (
        <Card>
          <h2 className="text-xl font-bold">
            {other
              ? "Another scout has started this team"
              : "Start this pit conversation"}
          </h2>
          <p className="my-3 text-muted">
            {other
              ? "Their draft stays with them. Take over deliberately if you are handling this team now."
              : "Claim this team before entering answers, so another scout sees that work has begun."}
          </p>
          {other && (
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-5"
                checked={takeover}
                onChange={(e) => setTakeover(e.target.checked)}
              />
              I will take over this team; previous work remains for review.
            </label>
          )}
          <Button
            disabled={pending || (other && !takeover)}
            onClick={() => void start()}
          >
            {pending
              ? "Claiming…"
              : other
                ? "Take over report"
                : "Begin pit report"}
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <h2 className="mb-4 text-xl font-bold">Robot capabilities</h2>
            <PitCapabilities
              data={data}
              change={(fn) => setData((old) => fn(old))}
              capacityMode={capacityMode}
              setCapacityMode={setCapacityMode}
              numeric={numeric}
              setNumeric={setNumeric}
            />
          </Card>
          <AutoRoutines
            data={data}
            change={(fn) => setData((old) => fn(old))}
          />
          <Card>
            <label htmlFor="pit-strategy-note" className="block font-bold">
              Strategy note (optional)
            </label>
            <p className="my-2 text-sm text-muted">
              Mention unusual details only when they matter. This is a pit
              claim, not a match observation.
            </p>
            <textarea
              id="pit-strategy-note"
              maxLength={500}
              rows={3}
              value={data.strategy_note ?? ""}
              onChange={(e) =>
                setData((old) => ({
                  ...old,
                  strategy_note: e.target.value || undefined,
                }))
              }
              className="w-full rounded-control border border-border p-3"
            />
          </Card>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void save(false)}
            >
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button disabled={pending} onClick={() => void save(true)}>
              {pending ? "Submitting…" : "Submit completed report"}
            </Button>
          </div>
        </>
      )}
      {message && (
        <p
          role="status"
          className="rounded-control border border-accent bg-accent-soft p-3"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-control border border-danger bg-surface p-3 text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
