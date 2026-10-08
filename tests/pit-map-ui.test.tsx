import "./fixtures/dom-setup";
import test from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { PitMap } from "../src/features/pit-map/components/pit-map";
import { PitMapLayout } from "../src/features/pit-map/components/pit-map-layout";
import { PitScouting } from "../src/features/pit-map/components/pit-scouting";
import { PitMapPit } from "../src/features/pit-map/components/pit-map-pit";
import { fitMapBounds, mapViewBounds } from "../src/features/pit-map/viewport";
import {
  emptyPitMapLayout,
  type EventPitMap,
} from "../src/features/pit-map/model";

Object.assign(globalThis, {
  self: window,
  requestAnimationFrame: (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
});
window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
class Pointer extends window.MouseEvent {
  pointerId: number;
  constructor(type: string, options: MouseEventInit & { pointerId?: number }) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
  }
}
Object.assign(window, { PointerEvent: Pointer });
test.afterEach(() => cleanup());

const map: EventPitMap = {
  ...emptyPitMapLayout(),
  eventId: "event",
  source: "manual",
  sourceEventKey: null,
  fetchedAt: "2026-10-05T12:00:00Z",
  width: 800,
  height: 600,
  pits: [
    {
      id: "A1",
      pitLabel: "A1",
      teamNumber: 101,
      x: 10,
      y: 20,
      width: 80,
      height: 80,
    },
    {
      id: "A2",
      pitLabel: "A2",
      teamNumber: 202,
      x: 100,
      y: 20,
      width: 80,
      height: 80,
    },
    {
      id: "A3",
      pitLabel: "A3",
      teamNumber: null,
      x: 190,
      y: 20,
      width: 80,
      height: 80,
    },
  ],
  walls: [{ x: 0, y: 0, width: 800, height: 5 }],
  areas: [{ label: "Pit admin", x: 500, y: 100, width: 100, height: 60 }],
  labels: [{ text: "Exit", x: 10, y: 500 }],
  arrows: [{ x: 50, y: 400, width: 20, height: 40, angle: 90 }],
};
const props = {
  map,
  eventKey: "2026test",
  knownTeams: new Set([101, 202]),
  completedTeams: new Set([202]),
  activeTeams: new Set<number>(),
  highlightedTeams: new Set<number>(),
  liveAvailable: false,
};
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
};

test("100+ pit SVGs link to existing forms, render normalized objects and keep accessible status", () => {
  const pits = Array.from({ length: 120 }, (_, i) => ({
    id: `B${i}`,
    pitLabel: `B${i}`,
    teamNumber: 1000 + i,
    x: (i % 12) * 90,
    y: Math.floor(i / 12) * 90,
    width: 80,
    height: 80,
  }));
  const many = { ...map, pits };
  const markup = renderToStaticMarkup(
    <svg>
      <PitMapLayout
        {...props}
        map={many}
        mode="venue"
        knownTeams={new Set(pits.map((p) => p.teamNumber))}
      />
    </svg>,
  );
  assert.equal((markup.match(/data-pit-rect=/g) ?? []).length, 120);
  assert.match(markup, /href="\/events\/2026test\/pit\/1000"/);
  assert.match(markup, /Team 1000, pit B0, Not scouted/);
  assert.match(markup, /Pit admin/);
  assert.match(markup, /Exit/);
  assert.match(markup, /rotate\(90\)/);
  assert.match(markup, /fill="#fee2e2"/);
  const normal = renderToStaticMarkup(
    <svg>
      <PitMapLayout {...props} />
    </svg>,
  );
  assert.match(normal, /Team 202, pit A2, Complete/);
  assert.match(normal, /fill="#bbf7d0"/);
  assert.match(normal, /Unassigned pit, pit A3, Unassigned/);
  assert.match(normal, /fill="#e5e7eb"/);
  assert.doesNotMatch(normal, /\/pit\/null/);
  const live = renderToStaticMarkup(
    <svg>
      <PitMapLayout {...props} activeTeams={new Set([202])} />
    </svg>,
  );
  assert.match(live, /Team 202, pit A2, In progress/);
  assert.match(live, /stroke-dasharray="5 3"/);
  assert.match(live, /fill="#fef08a"/);
});

test("map collapses, expands into a dismissible dialog, and leaves the existing list usable", async () => {
  const rows = [
    {
      teamNumber: 101,
      nickname: "Example",
      status: "not_scouted" as const,
      claimedBy: null,
      pitLabel: "A1",
    },
    {
      teamNumber: 202,
      nickname: "Finished team",
      status: "completed" as const,
      claimedBy: null,
      pitLabel: "A2",
    },
  ];
  const screen = render(
    <PitScouting
      eventId="event"
      eventKey="2026test"
      rows={rows}
      map={map}
      completed={[202]}
      activeEvent={false}
    />,
  );
  await flush();
  const region = screen.getByRole("region", { name: "Interactive pit map" });
  assert.ok(region.className.includes("h-[300px]"));
  assert.equal(region.getAttribute("tabindex"), "0");
  assert.ok(
    screen.getByRole("link", { name: "Team 101, pit A1, Not scouted" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Collapse Map" }));
  assert.equal(
    screen.queryByRole("region", { name: "Interactive pit map" }),
    null,
  );
  assert.ok(screen.getByLabelText("Find a team"));
  fireEvent.change(screen.getByLabelText("Find a team"), {
    target: { value: "101" },
  });
  assert.equal(screen.queryByText("Finished team"), null);
  fireEvent.click(screen.getByRole("button", { name: "Show Map" }));
  assert.match(
    screen.getByRole("link", {
      name: /Team 101, pit A1, Not scouted, search match/,
    }).outerHTML,
    /#2563eb/,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Expand / Fullscreen Map" }),
  );
  await flush();
  const dialog = screen.getByRole("dialog", { name: "Pit Map" });
  assert.ok(dialog.className.includes("h-dvh"));
  assert.equal(document.body.style.overflow, "hidden");
  fireEvent(dialog, new window.Event("cancel", { cancelable: true }));
  await flush();
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.body.style.overflow, "");
  assert.equal(
    document.activeElement,
    screen.getByRole("button", { name: "Expand / Fullscreen Map" }),
  );
  cleanup();
});

test("assignments-only and missing-map fallbacks show labels with ordinary list navigation", () => {
  const assignmentsOnly = {
    ...map,
    ...emptyPitMapLayout(),
    assignments: [{ teamNumber: 101, pitLabel: "A1" }],
  };
  const screen = render(
    <PitScouting
      eventId="event"
      eventKey="2026test"
      rows={[
        {
          teamNumber: 101,
          nickname: null,
          status: "not_scouted",
          claimedBy: null,
          pitLabel: "A1",
        },
      ]}
      map={assignmentsOnly}
      completed={[]}
      activeEvent={false}
    />,
  );
  assert.match(
    screen.getByText(/No pit map available for this event/).textContent ?? "",
    /addresses are listed/,
  );
  assert.ok(screen.getByText("Pit: A1"));
  assert.equal(screen.container.querySelector("svg"), null);
  assert.equal(
    screen.getByRole("link").getAttribute("href"),
    "/events/2026test/pit/101",
  );
  cleanup();
  const missing = render(<PitMap {...props} map={null} />);
  assert.match(
    missing.getByText(/No pit map available for this event/).textContent ?? "",
    /Use the team list below/,
  );
  cleanup();
});

test("viewport supports wheel, keyboard, drag and two-pointer pinch; a drag does not open a pit", async () => {
  const screen = render(<PitMap {...props} />);
  await flush();
  const region = screen.getByRole("region", { name: "Interactive pit map" });
  const layer = region.querySelector("svg > g")!;
  const initial = layer.getAttribute("transform");
  fireEvent.wheel(region, { deltaY: -60, clientX: 160, clientY: 150 });
  await flush();
  assert.notEqual(layer.getAttribute("transform"), initial);
  fireEvent.click(screen.getByRole("button", { name: "Fit pits" }));
  await flush();
  assert.equal(layer.getAttribute("transform"), initial);
  fireEvent.keyDown(region, { key: "ArrowRight" });
  await flush();
  assert.notEqual(layer.getAttribute("transform"), initial);
  fireEvent.keyDown(region, { key: "0" });
  await flush();
  assert.equal(layer.getAttribute("transform"), initial);
  const link = screen.getByRole("link", {
    name: "Team 101, pit A1, Not scouted",
  });
  fireEvent.pointerDown(link, {
    pointerId: 1,
    button: 0,
    clientX: 50,
    clientY: 50,
  });
  fireEvent.pointerMove(region, { pointerId: 1, clientX: 90, clientY: 70 });
  fireEvent.pointerUp(region, { pointerId: 1, clientX: 90, clientY: 70 });
  await flush();
  assert.notEqual(layer.getAttribute("transform"), initial);
  const dragged = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  link.dispatchEvent(dragged);
  assert.equal(dragged.defaultPrevented, true);
  const beforePinch = layer.getAttribute("transform");
  fireEvent.pointerDown(region, {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerDown(region, {
    pointerId: 2,
    button: 0,
    clientX: 200,
    clientY: 100,
  });
  fireEvent.pointerMove(region, { pointerId: 2, clientX: 250, clientY: 100 });
  fireEvent.pointerUp(region, { pointerId: 2 });
  fireEvent.pointerUp(region, { pointerId: 1 });
  await flush();
  assert.notEqual(layer.getAttribute("transform"), beforePinch);
  fireEvent.click(screen.getByRole("button", { name: "Fit pits" }));
  await flush();
  fireEvent.pointerDown(link, {
    pointerId: 1,
    button: 0,
    clientX: 50,
    clientY: 50,
  });
  fireEvent.pointerUp(link, { pointerId: 1, clientX: 50, clientY: 50 });
  // Prevent jsdom navigation without hiding whether gesture handling cancelled a tap.
  let tapPrevented = true;
  link.addEventListener(
    "click",
    (e) => {
      tapPrevented = e.defaultPrevented;
      e.preventDefault();
    },
    { once: true },
  );
  link.dispatchEvent(
    new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
    }),
  );
  assert.equal(tapPrevented, false);
  cleanup();
});

test("Pits is default, each view remembers its pan/zoom and Fit/0/Home follow that view without fetching", async () => {
  const venueMap = { ...map, width: 8000, height: 6000 };
  const before = JSON.stringify(venueMap),
    originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Map view switching must not fetch");
  };
  try {
    const screen = render(<PitMap {...props} map={venueMap} />);
    await flush();
    const region = screen.getByRole("region", { name: "Interactive pit map" });
    const svg = region.querySelector("svg")!,
      layer = svg.querySelector(":scope > g")!;
    const geometry = svg.querySelector('[data-map-geometry="venue"]')!;
    const transform = (mode: "pits" | "venue") => {
      const view = fitMapBounds(mapViewBounds(venueMap, mode)!, 320, 300);
      return `translate(${view.x} ${view.y}) scale(${view.scale})`;
    };
    assert.equal(
      screen.getByRole("button", { name: "Pits" }).getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(layer.getAttribute("transform"), transform("pits"));
    assert.equal(geometry.getAttribute("display"), "none");
    assert.ok(
      fitMapBounds(mapViewBounds(venueMap, "pits")!, 320, 300).scale *
        venueMap.pits[0].width >
        44,
    );
    const help = screen.getByText("? Help").closest("details")!;
    assert.equal(help.hasAttribute("open"), false);
    assert.ok(
      document
        .getElementById(region.getAttribute("aria-describedby")!)
        ?.textContent?.includes("0 or Home"),
    );
    fireEvent.wheel(region, { deltaY: -60, clientX: 160, clientY: 150 });
    await flush();
    const adjustedPits = layer.getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "Venue" }));
    await flush();
    assert.equal(layer.getAttribute("transform"), transform("venue"));
    assert.equal(geometry.getAttribute("display"), null);
    assert.ok(geometry.textContent?.includes("Pit admin"));
    assert.ok(geometry.textContent?.includes("Exit"));
    assert.ok(geometry.querySelector('g[transform*="rotate(90)"]'));
    assert.ok(geometry.querySelector('rect[opacity="0.22"]'));
    assert.ok(region.querySelector("svg") === svg);
    fireEvent.keyDown(region, { key: "ArrowRight" });
    fireEvent.keyDown(region, { key: "0" });
    await flush();
    assert.equal(layer.getAttribute("transform"), transform("venue"));
    fireEvent.keyDown(region, { key: "+" });
    fireEvent.keyDown(region, { key: "Home" });
    await flush();
    assert.equal(layer.getAttribute("transform"), transform("venue"));
    fireEvent.click(screen.getByRole("button", { name: "Pits" }));
    await flush();
    assert.equal(layer.getAttribute("transform"), adjustedPits);
    fireEvent.click(screen.getByRole("button", { name: "Fit pits" }));
    await flush();
    assert.equal(layer.getAttribute("transform"), transform("pits"));
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    fireEvent.keyDown(region, { key: "0" });
    await flush();
    assert.equal(layer.getAttribute("transform"), transform("pits"));
    fireEvent.click(screen.getByRole("button", { name: "Venue" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in on pit map" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit venue" }));
    await flush();
    assert.equal(layer.getAttribute("transform"), transform("venue"));
    assert.equal(requests, 0);
    assert.equal(JSON.stringify(venueMap), before);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("empty pit geometry falls back to Venue and neutral pits show only their label", async () => {
  const screen = render(<PitMap {...props} map={{ ...map, pits: [] }} />);
  await flush();
  const pitsButton = screen.getByRole("button", {
    name: "Pits",
  }) as HTMLButtonElement;
  assert.equal(pitsButton.disabled, true);
  assert.equal(
    screen.getByRole("button", { name: "Venue" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(screen.getByRole("button", { name: "Fit venue" }));
  assert.doesNotMatch(
    screen.container.querySelector("svg > g")?.getAttribute("transform") ?? "",
    /NaN|Infinity/,
  );
  const unassigned = renderToStaticMarkup(
    <svg>
      <PitMapPit
        pit={map.pits[2]}
        eventKey="2026test"
        status="unassigned"
        highlighted={false}
      />
    </svg>,
  );
  assert.equal((unassigned.match(/<text/g) ?? []).length, 1);
  assert.match(unassigned, />A3<\/text>/);
  assert.doesNotMatch(unassigned, /href=|>—</);
  const assigned = renderToStaticMarkup(
    <svg>
      <PitMapPit
        pit={map.pits[0]}
        eventKey="2026test"
        status="not_scouted"
        highlighted
      />
    </svg>,
  );
  assert.match(assigned, />101<\/text>/);
  assert.match(assigned, />A1<\/text>/);
  assert.match(assigned, /fill="#fee2e2" stroke="#b91c1c"/);
  assert.match(assigned, /pit-map-focus-ring/);
  assert.match(assigned, /stroke="#2563eb"/);
});
