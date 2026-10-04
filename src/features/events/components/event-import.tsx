"use client";

import { useActionState } from "react";
import { eventImportAction } from "../server/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/fields";
import { Card } from "@/components/ui/card";
import type { ImportState } from "../import-state";

export function EventImport({
  games,
  events,
  showCachedEvents = true,
}: {
  games: { slug: string; displayName: string; year: number }[];
  showCachedEvents?: boolean;
  events: {
    tba_key: string;
    name: string;
    last_tba_sync_at: string | null;
    last_statbotics_sync_at: string | null;
  }[];
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    eventImportAction,
    {},
  );
  return (
    <div className="space-y-6">
      <Card id="event-import">
        <h2 className="mb-4 text-xl font-bold">
          Import from The Blue Alliance
        </h2>
        <form action={action} className="space-y-4">
          <input type="hidden" name="operation" value="preview" />
          <Input
            id="event-key"
            name="eventKey"
            label="TBA event key"
            placeholder="2026xxxx"
            required
            maxLength={40}
            disabled={pending}
          />
          <Select
            id="game"
            name="gameSlug"
            label="Game module"
            disabled={pending}
          >
            {games.map((game) => (
              <option key={game.slug} value={game.slug}>
                {game.year} {game.displayName}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending}>
            Preview event
          </Button>
        </form>
      </Card>
      {pending && (
        <p role="status">Updating external data caches. Please wait…</p>
      )}
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      {state.preview && (
        <Card>
          <h2 className="text-xl font-bold">{state.preview.name}</h2>
          <p className="mt-2">
            {state.preview.key} · {state.preview.dates || "Dates unavailable"}
          </p>
          <p>
            {state.preview.location || "Location unavailable"} ·{" "}
            {state.preview.teamCount} teams currently listed
          </p>
          <form action={action} className="mt-5 space-y-4">
            <input type="hidden" name="operation" value="import" />
            <input type="hidden" name="eventKey" value={state.preview.key} />
            <input
              type="hidden"
              name="gameSlug"
              value={state.preview.gameSlug}
            />
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                name="confirmed"
                value="yes"
                required
                disabled={pending}
                className="size-5"
              />
              I confirm this is the event to import.
            </label>
            <Button type="submit" disabled={pending}>
              Confirm import
            </Button>
          </form>
        </Card>
      )}
      {showCachedEvents && (
        <section aria-labelledby="cached-events">
          <h2 id="cached-events" className="mb-4 text-xl font-bold">
            Cached events
          </h2>
          {!events.length && <p>No imported events yet.</p>}
          <div className="space-y-3">
            {events.map((event) => (
              <Card key={event.tba_key}>
                <h3 className="font-bold">{event.name}</h3>
                <p className="my-3 break-words text-sm text-muted">
                  {event.tba_key} · TBA snapshot:{" "}
                  {event.last_tba_sync_at ?? "Never"}
                </p>
                <p className="mb-3 text-sm text-muted">
                  Statbotics snapshot:{" "}
                  {event.last_statbotics_sync_at ?? "Never"}
                </p>
                <form action={action} className="mb-3">
                  <input type="hidden" name="operation" value="sync" />
                  <input type="hidden" name="eventKey" value={event.tba_key} />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    Sync now (TBA + Statbotics)
                  </Button>
                </form>
                <form action={action}>
                  <input type="hidden" name="operation" value="statbotics" />
                  <input type="hidden" name="eventKey" value={event.tba_key} />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    Retry Statbotics
                  </Button>
                </form>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
