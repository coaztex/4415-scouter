import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { adminEvents, cacheCounts } from "@/features/admin/server/queries";
import {
  SyncControls,
  PitMapSyncControls,
} from "@/features/admin/components/event-controls";
import {
  SyncStatus,
  PitMapSyncStatus,
} from "@/features/admin/components/sync-status";
import {
  getTbaEnvironment,
  getOptionalNexusEnvironment,
} from "@/lib/server/env";
import { createServiceClient } from "@/lib/supabase/service";
export const metadata = { title: "Data & Sync" };
export default async function SyncPage() {
  const events = await adminEvents();
  const webhookVerification = process.env.TBA_WEBHOOK_SECRET?.trim()
    ? await createServiceClient()
        .from("tba_webhook_verification")
        .select("verification_key,received_at")
        .eq("id", true)
        .maybeSingle()
    : null;
  let tbaReady = false;
  try {
    getTbaEnvironment();
    tbaReady = true;
  } catch {}
  const summaries = await Promise.all(
    events.map(async (event) => ({
      ...event,
      counts: await cacheCounts(event.id),
    })),
  );
  return (
    <>
      <PageHeading eyebrow="Administration" title="Data & Sync" />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">The Blue Alliance</h2>
          <p className="mt-3">
            {tbaReady ? "Server key configured" : "Server key missing"}
          </p>
          <p className="mt-2 text-sm text-muted">
            Teams, matches and rankings.
          </p>
          <p className="mt-3 text-sm">
            Webhook:{" "}
            {process.env.TBA_WEBHOOK_SECRET?.trim()
              ? "secret configured"
              : "optional secret missing"}
          </p>
          {webhookVerification?.data && (
            <p className="mt-2 text-sm">
              TBA verification key:{" "}
              <strong className="break-all">
                {webhookVerification.data.verification_key}
              </strong>
              <span className="block text-muted">
                Received{" "}
                {new Date(webhookVerification.data.received_at).toLocaleString(
                  "en-US",
                )}
              </span>
            </p>
          )}
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Statbotics</h2>
          <p className="mt-3">Public API · no key required</p>
          <p className="mt-2 text-sm text-muted">
            EPA metrics · existing data preserved on failure.
          </p>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Nexus · Pit Maps</h2>
          <p className="mt-3">
            {getOptionalNexusEnvironment()
              ? "Server key configured"
              : "Optional server key missing"}
          </p>
        </Card>
      </div>
      {!summaries.length ? (
        <EmptyState
          title="Nothing to sync yet"
          description="Import an event from the Events administration tab."
        />
      ) : (
        <div className="space-y-5">
          {summaries.map((event) => (
            <Card key={event.id}>
              <h2 className="text-xl font-bold">{event.name}</h2>
              <p className="mt-2 text-sm text-muted">{event.tba_key}</p>
              <div className="mt-4 flex flex-wrap gap-5">
                {["Teams", "Matches", "Rankings"].map((label, i) => (
                  <p key={label}>
                    {label}: <strong>{event.counts[i] ?? "Unavailable"}</strong>
                  </p>
                ))}
              </div>
              <SyncStatus states={event.event_sync_state} />
              <SyncControls eventKey={event.tba_key} />
              <PitMapSyncStatus cache={event.pitMapCache} />
              <PitMapSyncControls
                eventKey={event.tba_key}
                nexusEventKey={event.nexus_event_key}
              />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
