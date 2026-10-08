import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SyncStatus,
  PitMapSyncStatus,
} from "../src/features/admin/components/sync-status";
import { PitTeamList } from "../src/features/pit/components/team-list";

test("admin sync status displays provider-specific error, event key and retained last success", () => {
  const html = renderToStaticMarkup(
    <SyncStatus
      states={[
        {
          source: "statbotics",
          status: "failed",
          last_attempt_at: "2026-10-08T22:00:00Z",
          last_success_at: "2026-10-07T22:00:00Z",
          last_error:
            "Statbotics API returned HTTP 500 for 2026cass after 3 attempts. Try again later. Cached metrics were retained.",
        },
      ]}
    />,
  );
  assert.match(html, /API returned HTTP 500 for 2026cass after 3 attempts/);
  assert.match(html, /Cached metrics were retained/);
  assert.match(html, /Last success: 2026-10-07/);
  const db = renderToStaticMarkup(
    <SyncStatus
      states={[
        {
          source: "statbotics",
          status: "failed",
          last_attempt_at: null,
          last_success_at: null,
          last_error:
            "Statbotics Supabase apply_statbotics_snapshot failed (42501): permission denied.",
        },
      ]}
    />,
  );
  assert.match(db, /Supabase apply_statbotics_snapshot failed \(42501\)/);
  assert.doesNotMatch(db, /HTTP 500/);
});

test("admin pit summary displays the requested Nexus key", () => {
  const html = renderToStaticMarkup(
    <PitMapSyncStatus
      cache={{
        eventId: "event",
        source: "nexus",
        sourceEventKey: "2026cass",
        layout: null,
        fetchedAt: null,
        status: "unavailable",
        lastAttemptAt: "2026-10-08T22:00:00Z",
        lastAttemptKey: "2026cass",
        lastError:
          "Nexus API returned no pit map or pit addresses for 2026cass. Check the Nexus event key override.",
      }}
    />,
  );
  assert.match(html, /2026cass/);
  assert.match(html, /Check the Nexus event key override/);
});

test("pit cards show addresses and scouting status without inspection indicators", () => {
  const html = renderToStaticMarkup(
    <PitTeamList
      eventKey="2026cass"
      rows={[
        {
          teamNumber: 101,
          nickname: "Example",
          status: "not_scouted",
          claimedBy: null,
          pitLabel: "A1",
        },
      ]}
    />,
  );
  assert.match(html, /Pit: A1/);
  assert.doesNotMatch(html, /Inspection|inspection|queue #/);
  assert.match(html, /0 \/ 1 teams completed/);
  assert.match(html, /\/events\/2026cass\/pit\/101/);
});
