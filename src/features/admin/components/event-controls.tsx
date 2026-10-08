"use client";
import { useActionState } from "react";
import {
  eventStatusAction,
  ourTeamAction,
  eventTimezoneAction,
} from "../server/actions";
import { eventImportAction } from "@/features/events/server/actions";
import type { ImportState } from "@/features/events/import-state";
import { Button } from "@/components/ui/button";
import { timezoneNotice } from "@/features/events/timezone";

export function EventTimezoneControl({
  id,
  timezone,
  timezone_source,
}: {
  id: string;
  timezone: string;
  timezone_source: string;
}) {
  const [state, action, pending] = useActionState(eventTimezoneAction, {});
  return (
    <form action={action} className="my-5 space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-bold">
          Event timezone (IANA)
          <input
            name="timezone"
            defaultValue={timezone}
            required
            maxLength={100}
            placeholder="America/Los_Angeles"
            className="min-h-12 rounded-control border border-border bg-surface px-3"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save timezone"}
        </Button>
      </div>
      <p className="text-sm text-muted">
        {timezoneNotice({ timezone, timezone_source })}
      </p>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function SyncControls({ eventKey }: { eventKey: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    eventImportAction,
    {},
  );
  return (
    <div>
      <form action={action} className="flex flex-wrap gap-3">
        <input type="hidden" name="eventKey" value={eventKey} />
        <Button type="submit" name="operation" value="sync" disabled={pending}>
          Sync now
        </Button>
        <Button
          type="submit"
          name="operation"
          value="statbotics"
          disabled={pending}
          variant="secondary"
        >
          Retry Statbotics only
        </Button>
      </form>
      {pending && (
        <p role="status" className="mt-3">
          Refreshing external caches…
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="mt-3">
          {state.message}
        </p>
      )}
    </div>
  );
}
export function PitMapSyncControls({
  eventKey,
  nexusEventKey,
}: {
  eventKey: string;
  nexusEventKey: string | null;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    eventImportAction,
    {},
  );
  return (
    <form action={action} className="mt-4 space-y-2">
      <input type="hidden" name="eventKey" value={eventKey} />
      <input type="hidden" name="operation" value="pit-map" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-bold">
          Nexus event key override (optional)
          <input
            name="nexusEventKey"
            defaultValue={nexusEventKey ?? ""}
            placeholder={eventKey}
            maxLength={80}
            className="min-h-12 rounded-control border border-border bg-surface px-3"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Syncing pit map…" : "Sync Pit Map"}
        </Button>
      </div>
      <p className="text-sm text-muted">Blank uses the event key.</p>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function EventStatusControl({
  id,
  status,
}: {
  id: string;
  status: "active" | "archived";
}) {
  const [state, action, pending] = useActionState(eventStatusAction, {});
  return (
    <details className="mt-5">
      <summary className="min-h-12 cursor-pointer py-3 font-bold text-accent">
        {status === "active" ? "Archive event" : "Reactivate event"}
      </summary>
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="expected" value={status} />
        <label className="flex min-h-12 items-start gap-3">
          <input
            type="checkbox"
            name="confirmed"
            value="yes"
            required
            disabled={pending}
            className="mt-1 size-5 shrink-0"
          />
          {status === "active"
            ? "Confirm archive: scouts will lose access, and existing scouting records will be preserved."
            : "Confirm reactivation: team members can access and scout this event again."}
        </label>
        <Button type="submit" disabled={pending} variant="secondary">
          {pending ? "Saving…" : "Confirm status change"}
        </Button>
        {state.error && (
          <p role="alert" className="text-danger">
            {state.error}
          </p>
        )}
        {state.message && <p role="status">{state.message}</p>}
      </form>
    </details>
  );
}

export function OurTeamControl({
  id,
  teamNumber,
}: {
  id: string;
  teamNumber: number | null;
}) {
  const [state, action, pending] = useActionState(ourTeamAction, {});
  return (
    <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="grid gap-1 text-sm font-bold">
        Our team number
        <input
          name="teamNumber"
          type="number"
          min="1"
          step="1"
          defaultValue={teamNumber ?? ""}
          className="min-h-11 w-36 rounded-control border border-border bg-surface px-3"
        />
      </label>
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Saving…" : "Save team"}
      </Button>
      {state.error && (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="w-full text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
