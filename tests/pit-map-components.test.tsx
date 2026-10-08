import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PitTeamList } from "../src/features/pit/components/team-list";
import { PitMapSyncStatus } from "../src/features/admin/components/sync-status";
import { emptyPitMapLayout } from "../src/features/pit-map/model";
import type { PitMapCache } from "../src/features/pit-map/server/cache";

test("pit cards show cached locations while missing maps preserve scouting links and status", () => {
  const rows = [
    {
      teamNumber: 101,
      nickname: "Example",
      status: "not_scouted" as const,
      claimedBy: null,
    },
  ];
  const missing = renderToStaticMarkup(
    <PitTeamList eventKey="2026test" rows={rows} />,
  );
  assert.match(missing, /\/events\/2026test\/pit\/101/);
  assert.match(missing, /0 \/ 1 teams completed/);
  assert.doesNotMatch(missing, /Pit:/);
  const known = renderToStaticMarkup(
    <PitTeamList eventKey="2026test" rows={[{ ...rows[0], pitLabel: "A1" }]} />,
  );
  assert.match(known, /Pit: A1/);
  assert.match(known, /\/events\/2026test\/pit\/101/);
});

test("admin pit sync summary reports addresses, geometry, source, times and retained-cache failures", () => {
  const layout = emptyPitMapLayout();
  layout.assignments = [{ teamNumber: 101, pitLabel: "A1" }];
  const cache: PitMapCache = {
    eventId: "event",
    source: "nexus",
    sourceEventKey: "demo_override",
    layout,
    fetchedAt: "2026-10-05T12:00:00Z",
    status: "partial",
    lastAttemptAt: "2026-10-05T13:00:00Z",
    lastAttemptKey: "demo_override",
    lastError: "Nexus has addresses but no graphical map.",
  };
  const markup = renderToStaticMarkup(<PitMapSyncStatus cache={cache} />);
  for (const text of [
    /demo_override/,
    /2026-10-05T12:00:00Z/,
    /Assigned pits: 1/,
    /Graphical geometry: Unavailable/,
    /Nexus has addresses but no graphical map\./,
    /https:\/\/frc.nexus/,
  ])
    assert.match(markup, text);
  const geometry = renderToStaticMarkup(
    <PitMapSyncStatus
      cache={{ ...cache, layout: { ...layout, width: 100, height: 100 } }}
    />,
  );
  assert.match(geometry, /Graphical geometry: Available/);
  const missing = renderToStaticMarkup(<PitMapSyncStatus cache={null} />);
  assert.match(missing, /Not synced/);
  assert.match(missing, /Assigned pits: 0/);
});
