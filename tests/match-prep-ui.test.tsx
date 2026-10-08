import "./fixtures/dom-setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { getMatchStations } from "../src/features/events/match-stations";
import type { MatchPrepData } from "../src/features/match-prep/server/queries";
import type { OfficialMatchData } from "../src/features/event-schedule/server/queries";

const load = createRequire(`${process.cwd()}/tests/match-prep-ui.test.tsx`);
function stub(path: string, exports: unknown) {
  const resolved = load.resolve(path);
  const stubModule = new Module(resolved);
  stubModule.exports = exports;
  stubModule.loaded = true;
  load.cache[resolved] = stubModule;
}
stub("../src/features/match-prep/server/actions", {
  saveMatchPlan() {
    throw new Error("Browsing must not save a plan");
  },
});
let routeInput: [string, string | undefined] | null = null;
let routeData: MatchPrepData;
stub("../src/features/match-prep/server/queries", {
  async getMatchPrep(event: string, match?: string) {
    routeInput = [event, match];
    return routeData;
  },
});
Object.assign(globalThis, { self: window });
const { MatchPrep } = load(
  "../src/features/match-prep/components/prep",
) as typeof import("../src/features/match-prep/components/prep");
const { MatchDetails } = load(
  "../src/features/event-schedule/components/details",
) as typeof import("../src/features/event-schedule/components/details");
const { default: Page } = load(
  "../src/app/events/[eventKey]/match-prep/page",
) as typeof import("../src/app/events/[eventKey]/match-prep/page");
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
function fixture(selected = true): MatchPrepData {
  const matches = [
    {
      id: "old",
      tba_match_key: "2026test_qm42",
      comp_level: "qm",
      set_number: 1,
      match_number: 42,
      result_metadata: { red_score: 0, blue_score: 10 },
    },
    {
      id: "next",
      tba_match_key: "2026test_f1m1",
      comp_level: "f",
      set_number: 1,
      match_number: 1,
      result_metadata: null,
    },
  ].map((m) => ({
    ...m,
    scheduled_time: null,
    predicted_time: null,
    actual_time: null,
  }));
  const stations = getMatchStations(
    [700, 50, 1000, 900, 20, 300].map((team_number, i) => ({
      match_id: "old",
      team_number,
      alliance: i < 3 ? ("red" as const) : ("blue" as const),
      station: (i % 3) + 1,
    })),
  );
  const lineup = selected ? [...stations.red, ...stations.blue] : [];
  return {
    event: {
      tba_key: "2026test",
      status: "active",
      timezone: "UTC",
    } as MatchPrepData["event"],
    ownTeamNumber: 700,
    matches,
    selected: selected ? matches[0] : null,
    selectedIsPlayed: selected,
    lineup,
    note: { note: "Existing review notes", updated_at: "2026-10-06" },
    teams: lineup.map((station) => ({ station, row: null, pit: null })),
  };
}
function mount(data: MatchPrepData) {
  return render(
    <AppRouterContext.Provider value={router}>
      <MatchPrep prep={data} eventKey="2026test" />
    </AppRouterContext.Provider>,
  );
}
test("manual selector is immediately available and submits canonical URL state with grouped statuses", () => {
  const data = fixture(false);
  data.matches = [data.matches[0]];
  const view = mount(data);
  const select = view.getByRole("combobox", {
    name: "Select match",
  }) as HTMLSelectElement;
  assert.equal(select.value, "");
  assert.equal(select.name, "match");
  assert.equal(select.form?.getAttribute("method"), "get");
  assert.equal(
    select.form?.getAttribute("action"),
    "/events/2026test/match-prep",
  );
  assert.ok(view.getByText(/No upcoming matches/));
  assert.ok(view.getByRole("option", { name: "Q42 · Completed" }));
  assert.equal(select.querySelector("optgroup")?.label, "Qualifications");
  fireEvent.change(select, { target: { value: "2026test_qm42" } });
  assert.equal(new window.FormData(select.form!).get("match"), "2026test_qm42");
});
test("historical review uses the same six cards in station order and honestly shows missing evidence", () => {
  const data = fixture();
  data.event.status = "archived";
  const view = mount(data);
  assert.equal(
    (view.getByRole("combobox") as HTMLSelectElement).value,
    "2026test_qm42",
  );
  assert.ok(view.getByText("Completed"));
  assert.equal(
    view.getByRole("link", { name: "Strategy Board" }).getAttribute("href"),
    "/events/2026test/matches/2026test_qm42/strategy-board",
  );
  assert.ok(view.getByRole("option", { name: "F1 · Upcoming" }));
  assert.equal(
    view.container.querySelectorAll("optgroup")[1].label,
    "Playoffs",
  );
  const cards = ["red alliance", "blue alliance"].flatMap((name) =>
    within(view.getByRole("region", { name })).getAllByRole("link"),
  );
  assert.deepEqual(
    cards.map((card) => card.textContent?.match(/\b[RB][123]\b/)?.[0]),
    ["R1", "R2", "R3", "B1", "B2", "B3"],
  );
  assert.deepEqual(
    cards.map((card) => card.getAttribute("href")?.split("/").at(-1)),
    ["700", "50", "1000", "900", "20", "300"],
  );
  for (const card of cards) {
    assert.match(card.textContent ?? "", /No usable estimate · n=0/);
    assert.match(card.textContent ?? "", /Weight unknown/);
    assert.match(card.textContent ?? "", /No observed result/);
  }
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).value,
    "Existing review notes",
  );
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).readOnly,
    true,
  );
});
test("Match Details navigation and explicit reload feed the existing Match Prep route", async () => {
  routeData = fixture();
  const details = render(
    <MatchDetails
      data={
        {
          event: {
            ...routeData.event,
            last_tba_sync_at: null,
            game_slug: "2026-rebuilt",
          },
          match: routeData.matches[0],
          matches: [],
          teams: [],
          raw: {},
          profile: { role: "strategy" },
          generatedAt: 1791288000000,
          syncExpiresAt: null,
          coverageAvailable: false,
        } as unknown as OfficialMatchData
      }
      liveWindow={false}
      staleAfterMs={300000}
    />,
  );
  const href = details
    .getByRole("link", { name: "Match Prep" })
    .getAttribute("href")!;
  assert.equal(
    details.getByRole("link", { name: "Strategy Board" }).getAttribute("href"),
    "/events/2026test/matches/2026test_qm42/strategy-board",
  );
  assert.equal(href, "/events/2026test/match-prep?match=2026test_qm42");
  cleanup();
  const query = new URL(href, "https://example.test").searchParams.get(
    "match",
  )!;
  for (let reload = 0; reload < 2; reload++) {
    const element = await Page({
      params: Promise.resolve({ eventKey: "2026test" }),
      searchParams: Promise.resolve({ match: query }),
    });
    assert.deepEqual(routeInput, ["2026test", "2026test_qm42"]);
    const view = render(
      <AppRouterContext.Provider value={router}>
        {element}
      </AppRouterContext.Provider>,
    );
    assert.equal(
      (view.getByRole("combobox") as HTMLSelectElement).value,
      query,
    );
    cleanup();
  }
});
test("no cached schedule gives actionable guidance", () => {
  const data = fixture(false);
  data.matches = [];
  const view = mount(data);
  assert.ok(view.getByText(/Ask an admin to sync the schedule/));
  assert.equal(view.queryByRole("combobox"), null);
});
