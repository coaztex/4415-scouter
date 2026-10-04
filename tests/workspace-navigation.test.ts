import test from "node:test";
import assert from "node:assert/strict";
import {
  isActiveWorkspaceLink,
  workspaceGroups,
} from "../src/components/layout/workspace-navigation";
import { shortEventLabel } from "../src/features/events/presentation";
import { syncAttentionLabel } from "../src/components/layout/sync-status";
import type { QueueRecord } from "../src/features/offline/model";

const links = (role: "scout" | "strategy" | "admin", key?: string) =>
  workspaceGroups(role, key).flatMap((group) =>
    group.links.map((link) => link.href),
  );

test("workspace navigation preserves role boundaries and hides empty groups", () => {
  const key = "2026cascmp";
  const scout = links("scout", key);
  assert.ok(scout.includes(`/events/${key}/scouting`));
  assert.ok(scout.includes(`/events/${key}/stats`));
  assert.ok(!scout.includes(`/events/${key}/picklist`));
  assert.ok(!scout.includes("/schedule"));
  assert.ok(!scout.includes("/admin"));
  assert.ok(
    !workspaceGroups("scout").some((group) => group.label === "Strategy"),
  );
  const strategy = links("strategy", key);
  assert.ok(strategy.includes(`/events/${key}/picklist`));
  assert.ok(strategy.includes("/schedule"));
  assert.ok(!strategy.includes("/admin"));
  assert.ok(links("admin", key).includes("/admin"));
});

test("event links switch keys and nested routes select their section", () => {
  assert.ok(
    links("scout", "2026first").every((href) => !href.includes("2026second")),
  );
  assert.ok(links("scout", "2026second").includes("/events/2026second/teams"));
  assert.equal(
    isActiveWorkspaceLink(
      "/events/2026second/teams/4415",
      "/events/2026second/teams",
    ),
    true,
  );
  assert.equal(
    isActiveWorkspaceLink(
      "/events/2026second/teams/4415",
      "/events/2026second",
    ),
    false,
  );
  assert.equal(
    isActiveWorkspaceLink(
      "/events/2026second/matches/qm1",
      "/events/2026second/schedule",
    ),
    true,
  );
  assert.equal(
    isActiveWorkspaceLink("/events/2026second/teams", "/events"),
    false,
  );
});

test("event label favors TBA short name and trims sponsored fallback", () => {
  assert.equal(
    shortEventLabel({
      name: "Long official name",
      short_name: "Southern State",
    }),
    "Southern State",
  );
  assert.equal(
    shortEventLabel({
      name: "FIRST California Southern State Championship presented by Qualcomm",
    }),
    "FIRST California Southern State…",
  );
});

test("healthy sync stays out of chrome while offline, pending, and failures remain visible", () => {
  const base = {
    rows: [] as QueueRecord[],
    loaded: true,
    online: true,
    storageError: "",
  };
  const row = (state: QueueRecord["state"]) => ({ state }) as QueueRecord;
  assert.equal(syncAttentionLabel(base), null);
  assert.equal(
    syncAttentionLabel({ ...base, online: false }),
    "Offline · 0 pending",
  );
  assert.equal(
    syncAttentionLabel({ ...base, rows: [row("pending")] }),
    "1 pending",
  );
  assert.equal(
    syncAttentionLabel({ ...base, rows: [row("error")] }),
    "Sync needs attention · 1 pending",
  );
  assert.equal(
    syncAttentionLabel({ ...base, storageError: "unavailable" }),
    "Device storage error · 0 pending",
  );
});
