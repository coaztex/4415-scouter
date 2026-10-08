import "./fixtures/dom-setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { defaultState, type PickTeam } from "../src/features/picklist/model";
import { emptyScouting } from "../src/features/teams/model";
import {
  snapshotEvidence,
  snapshotSchema,
} from "../src/features/picklist/snapshot";
import type { getPicklist } from "../src/features/picklist/server/queries";

// Exercise the real workspace without importing database-only server actions.
// Any save caused by a filter interaction is a failure.
const loadWorkspace = createRequire(
  `${process.cwd()}/tests/picklist-ui.test.tsx`,
);
const actionPath = loadWorkspace.resolve(
  "../src/features/picklist/server/actions",
);
const actionStub = new Module(actionPath);
actionStub.exports = {
  async savePicklist() {
    throw new Error("Filters must not save");
  },
  async createSnapshot() {
    throw new Error("Filters must not snapshot");
  },
};
actionStub.loaded = true;
loadWorkspace.cache[actionPath] = actionStub;
Object.assign(globalThis, { self: window });
const { PicklistWorkspace } = loadWorkspace(
  "../src/features/picklist/components/workspace",
) as typeof import("../src/features/picklist/components/workspace");
type Data = Awaited<ReturnType<typeof getPicklist>>;
const router = {
  bfcacheId: "test",
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch: async () => {},
};
afterEach(cleanup);

function candidate(
  teamNumber: number,
  weight: number | null,
  drivetrain: PickTeam["drivetrain"],
  mechanism: PickTeam["mechanism"],
  fuel: number,
): PickTeam {
  const scouting = emptyScouting();
  scouting.fuel.total.median = fuel;
  scouting.fuel.total.sampleSize = 3;
  return {
    teamNumber,
    nickname: `Robot ${teamNumber}`,
    robotWeightLbs: weight,
    drivetrain,
    mechanism,
    pitReported: weight !== null,
    scouting,
    tba: null,
    statbotics: null,
    issueFreeCount: 0,
    recentConcern: false,
    recentUncertain: 0,
    records: [],
  };
}
function fixture(): Data {
  return {
    event: {
      id: "event",
      tba_key: "2026test",
      status: "active",
    } as Data["event"],
    ownTeamNumber: null,
    teams: [
      candidate(101, 110, "swerve", "drum", 10),
      candidate(202, 112.4, "swerve", "turret", 20),
      candidate(303, 120, "tank", "turret", 30),
      candidate(404, null, "unknown", "unknown", 40),
    ],
    state: { ...defaultState(), manualOrder: [303, 202, 404, 101] },
    revision: 1,
    snapshots: [],
    snapshot: null,
  };
}
function mount(data = fixture()) {
  return render(
    <AppRouterContext.Provider value={router}>
      <PicklistWorkspace data={data} />
    </AppRouterContext.Provider>,
  );
}
const listed = (container: HTMLElement) =>
  [...container.querySelectorAll("article")].map((el) =>
    Number(el.querySelector("a")?.getAttribute("href")?.split("/").at(-1)),
  );

test("workspace filters AND categories, OR options, preserve profile scores and remove active chips", () => {
  const data = fixture(),
    before = JSON.stringify(data.state);
  const screen = mount(data);
  const specs = within(
    screen.getByRole("region", { name: "Pit specifications" }),
  );
  assert.deepEqual(listed(screen.container), [404, 303, 202, 101]);
  assert.match(
    screen.container.querySelectorAll("article")[2].textContent ?? "",
    /33.3 \/ 100/,
  );
  fireEvent.click(specs.getByLabelText("Drivetrain: Swerve"));
  fireEvent.click(specs.getByLabelText("Shooter: Drum"));
  fireEvent.click(specs.getByLabelText("Shooter: Turret"));
  fireEvent.change(specs.getByLabelText("Maximum weight (lb)"), {
    target: { value: "115" },
  });
  assert.deepEqual(listed(screen.container), [202, 101]);
  assert.match(
    screen.container.querySelector("article")?.textContent ?? "",
    /33.3 \/ 100/,
  );
  assert.equal(specs.getAllByRole("button", { name: /^Remove/ }).length, 4);
  fireEvent.click(
    specs.getByRole("button", { name: "Remove Shooter: Drum filter" }),
  );
  assert.deepEqual(listed(screen.container), [202]);
  fireEvent.click(
    specs.getByRole("button", { name: "Remove ≤ 115 lb filter" }),
  );
  assert.equal(
    (specs.getByLabelText("Maximum weight (lb)") as HTMLInputElement).value,
    "",
  );
  fireEvent.click(specs.getByRole("button", { name: "Clear filters" }));
  assert.deepEqual(listed(screen.container), [404, 303, 202, 101]);
  assert.equal(specs.queryByLabelText("Active pit filters"), null);
  assert.equal(screen.queryByText("Unsaved picklist"), null);
  assert.equal(JSON.stringify(data.state), before);
});

test("existing order menu handles weight directions with unknown last and preserves manual positions", () => {
  const data = fixture(),
    screen = mount(data);
  const order = screen.getByLabelText("Order");
  fireEvent.change(order, { target: { value: "weight_asc" } });
  assert.deepEqual(listed(screen.container), [101, 202, 303, 404]);
  fireEvent.change(order, { target: { value: "weight_desc" } });
  assert.deepEqual(listed(screen.container), [303, 202, 101, 404]);
  assert.match(
    screen.container.querySelectorAll("article")[3].textContent ?? "",
    /Weight: Unknown/,
  );
  fireEvent.change(order, { target: { value: "manual" } });
  assert.deepEqual(listed(screen.container), [303, 202, 404, 101]);
  fireEvent.click(screen.getByLabelText("Drivetrain: Swerve"));
  assert.deepEqual(listed(screen.container), [202, 101]);
  assert.equal(
    (
      screen.getByLabelText("Move to", {
        selector: "input#position-101",
      }) as HTMLInputElement
    ).value,
    "4",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  assert.deepEqual(listed(screen.container), [303, 202, 404, 101]);
  assert.deepEqual(data.state.manualOrder, [303, 202, 404, 101]);
});

test("weight range validation, clear-all and local filter lifetime preserve saved preferences", () => {
  const data = fixture(),
    screen = mount(data);
  fireEvent.change(screen.getByLabelText("Minimum weight (lb)"), {
    target: { value: "112.4" },
  });
  assert.deepEqual(listed(screen.container), [303, 202]);
  fireEvent.change(screen.getByLabelText("Maximum weight (lb)"), {
    target: { value: "112.4" },
  });
  assert.deepEqual(listed(screen.container), [202]);
  fireEvent.change(screen.getByLabelText("Minimum weight (lb)"), {
    target: { value: "120" },
  });
  assert.match(screen.getByRole("alert").textContent ?? "", /Minimum weight/);
  assert.deepEqual(listed(screen.container), []);
  fireEvent.change(screen.getByLabelText("Find a team"), {
    target: { value: "202" },
  });
  fireEvent.click(screen.getByLabelText("Favorites only"));
  fireEvent.click(screen.getByLabelText("Show excluded teams"));
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  assert.deepEqual(listed(screen.container), [404, 303, 202, 101]);
  assert.equal(
    (screen.getByLabelText("Find a team") as HTMLInputElement).value,
    "",
  );
  assert.equal(
    (screen.getByLabelText("Favorites only") as HTMLInputElement).checked,
    false,
  );
  assert.equal(
    (screen.getByLabelText("Show excluded teams") as HTMLInputElement).checked,
    true,
  );
  fireEvent.click(screen.getByLabelText("Shooter: Turret"));
  screen.unmount();
  const restored = mount(data);
  assert.deepEqual(listed(restored.container), [404, 303, 202, 101]);
  assert.equal(
    (restored.getByLabelText("Shooter: Turret") as HTMLInputElement).checked,
    false,
  );
});

test("snapshots filter captured pit specifications; legacy snapshots show unknown instead of live values", () => {
  const data = fixture();
  const evidence = snapshotEvidence(data.teams, data.state, null, "offense");
  data.snapshot = {
    id: "snapshot",
    name: "Selection",
    created_at: evidence.capturedAt,
    revision: 1,
    state: data.state,
    evidence,
  };
  data.teams[1].robotWeightLbs = 150;
  const screen = mount(data);
  fireEvent.change(screen.getByLabelText("Maximum weight (lb)"), {
    target: { value: "115" },
  });
  fireEvent.click(screen.getByLabelText("Shooter: Turret"));
  assert.deepEqual(listed(screen.container), [202]);
  assert.match(
    screen.container.querySelector("article")?.textContent ?? "",
    /112.4 lb · Swerve · Turret/,
  );
  screen.unmount();
  const legacy = JSON.parse(JSON.stringify(evidence));
  for (const team of legacy.teams) {
    delete team.drivetrain;
    delete team.robotWeightLbs;
  }
  data.snapshot.evidence = snapshotSchema.parse(legacy);
  const old = mount(data);
  assert.match(
    old.container.querySelector("article")?.textContent ?? "",
    /Weight: Unknown · Unknown/,
  );
  fireEvent.change(old.getByLabelText("Maximum weight (lb)"), {
    target: { value: "115" },
  });
  assert.deepEqual(listed(old.container), []);
});
