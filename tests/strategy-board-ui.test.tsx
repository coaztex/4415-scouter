import "./fixtures/dom-setup";
import * as deviceDatabase from "fake-indexeddb";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import {
  STATION_PALETTE,
  STATION_ORDER,
  STRATEGY_INK,
} from "../src/features/strategy-board/station-palette";
import { boardFixture, boardId } from "./fixtures/strategy-board";
import {
  boardDraftKey,
  boardDraftSchema,
} from "../src/features/strategy-board/model";
import { readDraft, writeDraft } from "../src/features/offline/store";
import type { BoardSaveResult } from "../src/features/strategy-board/server/actions";
const load = createRequire(`${process.cwd()}/tests/strategy-board-ui.test.tsx`);
const actionPath = load.resolve(
    "../src/features/strategy-board/server/actions",
  ),
  stubModule = new Module(actionPath);
let saveCalls = 0,
  reply: BoardSaveResult = { ok: true, revision: 1 };
stubModule.exports = {
  async saveStrategyBoard() {
    saveCalls++;
    return reply;
  },
};
stubModule.loaded = true;
load.cache[actionPath] = stubModule;
Object.assign(globalThis, {
  ...deviceDatabase,
  self: window,
  requestAnimationFrame: (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
});
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  configurable: true,
});
let online = true,
  confirm = true,
  confirmCalls = 0;
Object.defineProperty(window.navigator, "onLine", {
  get: () => online,
  configurable: true,
});
window.confirm = () => {
  confirmCalls++;
  return confirm;
};
class Pointer extends window.MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(
    type: string,
    options: MouseEventInit & { pointerId?: number; pointerType?: string },
  ) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
    this.pointerType = options.pointerType ?? "touch";
  }
}
Object.assign(window, { PointerEvent: Pointer });
const { StrategyBoard } = load(
  "../src/features/strategy-board/components/board",
) as typeof import("../src/features/strategy-board/components/board");
const { FieldBoard } = load(
  "../src/features/strategy-board/components/field",
) as typeof import("../src/features/strategy-board/components/field");
const { useBoardSession } = load(
  "../src/features/strategy-board/components/use-board-session",
) as typeof import("../src/features/strategy-board/components/use-board-session");

test("loading the saved board cannot resurrect a discarded draft on pagehide or unmount", async () => {
  const context = boardFixture(604);
  let session!: ReturnType<typeof useBoardSession>;
  function Session() {
    session = useBoardSession(context);
    return null;
  }
  const view = render(<Session />);
  await waitFor(() => assert.equal(session.ready, true));
  const next = structuredClone(context.document);
  next.phases.auto.notes = "Discard this unsynced edit";
  act(() => session.edit(next));
  // Confirmed discard occurs before the 250 ms checkpoint debounce fires.
  await act(async () => session.loadSaved());
  act(() => window.dispatchEvent(new Event("pagehide")));
  view.unmount();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    await readDraft(
      boardDraftKey(context.actorId, context.eventId, context.matchId),
      context.actorId,
    ),
    undefined,
  );
});

test("expanded field contains focus, locks background scrolling and restores focus on Escape", async () => {
  const { view } = await mount(605);
  const trigger = view.getByRole("button", { name: "Expand field" });
  trigger.focus();
  fireEvent.click(trigger);
  const modal = view.getByRole("dialog", { name: "Expanded strategy field" });
  assert.equal(modal.getAttribute("aria-modal"), "true");
  assert.equal(document.body.style.overflow, "hidden");
  const controls = within(modal).getAllByRole("button");
  assert.equal(document.activeElement, controls[0]);
  controls.at(-1)!.focus();
  fireEvent.keyDown(controls.at(-1)!, { key: "Tab" });
  assert.equal(document.activeElement, controls[0]);
  fireEvent.keyDown(controls[0], { key: "Tab", shiftKey: true });
  assert.equal(document.activeElement, controls.at(-1));
  fireEvent.keyDown(modal, { key: "Escape" });
  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(document.body.style.overflow, "");
  assert.equal(document.activeElement, trigger);
});

test("saved normalized overlays align with the exact image at desktop, tablet and phone widths", () => {
  const f = boardFixture(400),
    state = f.document.phases.auto;
  state.markers[0].position = { x: 0.23, y: 0.77 };
  const base = { phaseId: "auto", ownerStation: null, ownerTeamNumber: null };
  state.objects = [
    {
      ...base,
      id: boardId(1),
      type: "freehand",
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.2, y: 0.3 },
      ],
    },
    {
      ...base,
      id: boardId(2),
      type: "line",
      start: { x: 0.25, y: 0.75 },
      end: { x: 0.6, y: 0.4 },
    },
    {
      ...base,
      id: boardId(3),
      type: "arrow",
      start: { x: 0.3, y: 0.2 },
      end: { x: 0.8, y: 0.6 },
    },
    {
      ...base,
      id: boardId(4),
      type: "circle",
      center: { x: 0.5, y: 0.5 },
      radius: 0.1,
    },
    {
      ...base,
      id: boardId(5),
      type: "text",
      position: { x: 0.4, y: 0.6 },
      text: "Saved label",
    },
  ];
  const before = JSON.stringify(f.document),
    view = render(
      <FieldBoard
        config={f.config}
        phaseId="auto"
        state={state}
        tool="select"
        editable={true}
        owner={null}
        text=""
        onChange={() => {
          throw new Error("Rendering must not rewrite data");
        }}
      />,
    );
  const svg = field(view),
    image = svg.querySelector("image")!,
    h = f.config.field.height;
  assert.equal(image.getAttribute("href"), "/fields/2026-field-gray.png");
  assert.equal(image.getAttribute("pointer-events"), "none");
  assert.equal(image.getAttribute("preserveAspectRatio"), "xMidYMid meet");
  assert.equal(svg.getAttribute("viewBox"), `0 0 1000 ${h}`);
  assert.equal(svg.querySelector("g[transform]")?.firstElementChild, image);
  assert.equal(view.queryByText("LOCAL PLANNING PLACEHOLDER"), null);
  const line = svg.querySelector(`[data-object="${boardId(2)}"] line`)!;
  assert.equal(Number(line.getAttribute("x1")), 250);
  assert.equal(Number(line.getAttribute("y1")), 0.75 * h);
  const zone = svg.querySelector(`[data-object="${boardId(4)}"] circle`)!;
  assert.equal(Number(zone.getAttribute("r")), 100);
  assert.equal(Number(zone.getAttribute("cy")), 0.5 * h);
  assert.equal(
    Number(
      svg
        .querySelector(`[data-object="${boardId(5)}"] text`)
        ?.getAttribute("y"),
    ),
    0.6 * h,
  );
  for (const width of [1200, 768, 390]) {
    Object.assign(svg, {
      getBoundingClientRect: () => ({
        width,
        height: (width * h) / 1000,
        left: 0,
        top: 0,
      }),
    });
    assert.equal(
      svg.querySelector('[data-marker="R1"]')?.getAttribute("transform"),
      `translate(230 ${0.77 * h})`,
    );
    assert.equal(JSON.stringify(f.document), before);
  }
  fireEvent.click(view.getByRole("button", { name: "Zoom in" }));
  assert.equal(image.parentElement, svg.querySelector("g[transform]"));
  assert.match(
    image.parentElement?.getAttribute("transform") ?? "",
    /scale\(1.25\)/,
  );
  assert.equal(JSON.stringify(f.document), before);
});
test("image-relative drawing gestures invert pan/zoom across responsive sizes", () => {
  for (const width of [1200, 768, 390]) {
    const f = boardFixture(),
      state = f.document.phases.auto;
    let changed = state;
    const view = render(
      <FieldBoard
        config={f.config}
        phaseId="auto"
        state={state}
        tool="line"
        editable={true}
        owner={state.markers[0]}
        text=""
        onChange={(next) => {
          changed = next;
        }}
      />,
    );
    const svg = field(view),
      scale = width / 1000,
      h = f.config.field.height;
    Object.assign(svg, {
      getBoundingClientRect: () => ({
        width,
        height: h * scale,
        left: 16,
        top: 80,
      }),
    });
    fireEvent.click(view.getByRole("button", { name: "Zoom in" }));
    // Zoom is centered on the image; transform saved-space points to screen.
    const screen = (x: number, y: number) => [
      16 + (500 - (500 - x * 1000) * 1.25) * scale,
      80 + (h / 2 - (h / 2 - y * h) * 1.25) * scale,
    ];
    const [x, y] = screen(0.3, 0.4),
      [endX, endY] = screen(0.7, 0.6);
    gesture(svg, svg, x, y, endX, endY);
    const line = changed.objects[0];
    assert.equal(line.type, "line");
    if (line.type !== "line") throw new Error("Wrong tool");
    assert.ok(Math.abs(line.start.x - 0.3) < 1e-12);
    assert.ok(Math.abs(line.start.y - 0.4) < 1e-12);
    assert.ok(Math.abs(line.end.x - 0.7) < 1e-12);
    assert.ok(Math.abs(line.end.y - 0.6) < 1e-12);
    cleanup();
  }
});
afterEach(() => {
  cleanup();
  online = true;
  confirm = true;
  reply = { ok: true, revision: 1 };
});
async function mount(n: number) {
  const context = boardFixture(n),
    view = render(<StrategyBoard context={context} />);
  await waitFor(() =>
    assert.equal(
      (view.getByRole("button", { name: "Pen" }) as HTMLButtonElement).disabled,
      false,
    ),
  );
  return { context, view };
}
function field(view: ReturnType<typeof render>) {
  const svg = view.getByRole("img", {
    name: "Match strategy field",
  }) as unknown as SVGSVGElement;
  Object.assign(svg, {
    getBoundingClientRect: () => ({
      width: 1000,
      height: boardFixture().config.field.height,
      left: 0,
      top: 0,
      right: 1000,
      bottom: boardFixture().config.field.height,
    }),
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
  });
  return svg;
}
function gesture(
  target: Element,
  svg: SVGSVGElement,
  x: number,
  y: number,
  endX: number,
  endY: number,
) {
  fireEvent.pointerDown(target, {
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "touch",
  });
  fireEvent.pointerMove(svg, {
    clientX: endX,
    clientY: endY,
    pointerId: 1,
    pointerType: "touch",
  });
  fireEvent.pointerUp(svg, {
    clientX: endX,
    clientY: endY,
    pointerId: 1,
    pointerType: "touch",
  });
}
test("phone touch drawing, robot dragging, phase isolation, duplicate confirmation and undo/redo", async () => {
  const { view } = await mount(301);
  assert.deepEqual(
    [...view.container.querySelectorAll("[data-marker]")].map((e) =>
      e.getAttribute("data-marker"),
    ),
    ["R1", "R2", "R3", "B1", "B2", "B3"],
  );
  let svg = field(view);
  gesture(svg.querySelector('[data-marker="R1"]')!, svg, 120, 100, 400, 200);
  assert.equal(
    svg.querySelector('[data-marker="R1"]')?.getAttribute("transform"),
    "translate(400 200)",
  );
  fireEvent.click(view.getByRole("button", { name: "B2 · 20" }));
  fireEvent.click(view.getByRole("button", { name: "Pen" }));
  gesture(svg, svg, 200, 100, 600, 300);
  assert.equal(svg.querySelectorAll("[data-object]").length, 1);
  fireEvent.change(view.getByRole("textbox", { name: /Phase notes/ }), {
    target: { value: "Auto plan" },
  });
  fireEvent.click(view.getByRole("button", { name: "Transition" }));
  svg = field(view);
  assert.equal(svg.querySelectorAll("[data-object]").length, 0);
  fireEvent.change(view.getByRole("textbox", { name: /Phase notes/ }), {
    target: { value: "Transition note" },
  });
  const before = confirmCalls;
  confirm = false;
  fireEvent.click(
    view.getByRole("button", { name: "Duplicate previous phase" }),
  );
  assert.equal(confirmCalls, before + 1);
  assert.equal(svg.querySelectorAll("[data-object]").length, 0);
  confirm = true;
  fireEvent.click(
    view.getByRole("button", { name: "Duplicate previous phase" }),
  );
  assert.equal(svg.querySelectorAll("[data-object]").length, 1);
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).value,
    "Transition note",
  );
  assert.equal(
    svg.querySelector('[data-marker="R1"]')?.getAttribute("transform"),
    "translate(400 200)",
  );
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(svg.querySelectorAll("[data-object]").length, 0);
  fireEvent.click(view.getByRole("button", { name: "Redo" }));
  assert.equal(svg.querySelectorAll("[data-object]").length, 1);
  const clearBefore = confirmCalls;
  confirm = false;
  fireEvent.click(view.getByRole("button", { name: "Clear current phase" }));
  assert.equal(confirmCalls, clearBefore + 1);
  assert.equal(svg.querySelectorAll("[data-object]").length, 1);
  confirm = true;
  fireEvent.click(view.getByRole("button", { name: "Clear current phase" }));
  assert.equal(svg.querySelectorAll("[data-object]").length, 0);
  fireEvent.click(view.getByRole("button", { name: "Auto" }));
  assert.equal(field(view).querySelectorAll("[data-object]").length, 1);
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).value,
    "Auto plan",
  );
});
test("all geometry tools, select, eraser and pan/zoom are distinct touch operations", async () => {
  const { view } = await mount(302);
  const svg = field(view);
  for (const tool of ["Line", "Arrow", "Zone / circle", "Text"]) {
    fireEvent.click(view.getByRole("button", { name: tool }));
    if (tool === "Text")
      fireEvent.change(view.getByRole("textbox", { name: /Text label/ }), {
        target: { value: "Pass here" },
      });
    gesture(svg, svg, 200, 100, 400, 200);
  }
  assert.equal(svg.querySelectorAll("[data-object]").length, 4);
  fireEvent.click(view.getByRole("button", { name: "Select / move robot" }));
  const line = svg.querySelector("[data-object] line")!;
  gesture(line, svg, 200, 100, 250, 150);
  assert.equal(
    svg.querySelector("[data-object] line")?.getAttribute("x1"),
    "250",
  );
  fireEvent.click(
    view.getByRole("button", { name: "Delete selected drawing" }),
  );
  assert.equal(svg.querySelectorAll("[data-object]").length, 3);
  fireEvent.click(view.getByRole("button", { name: "Eraser" }));
  fireEvent.pointerDown(svg.querySelector("[data-object]")!, {
    button: 0,
    clientX: 300,
    clientY: 200,
    pointerId: 1,
  });
  assert.equal(svg.querySelectorAll("[data-object]").length, 2);
  fireEvent.click(view.getByRole("button", { name: "Pan" }));
  gesture(svg, svg, 100, 100, 150, 150);
  assert.equal(svg.querySelectorAll("[data-object]").length, 2);
  assert.equal(
    svg.querySelector("g[transform]")?.getAttribute("transform"),
    "translate(50 50) scale(1)",
  );
  fireEvent.click(view.getByRole("button", { name: "Zoom in" }));
  assert.ok(view.getByText(/125%/));
  fireEvent.click(view.getByRole("button", { name: "Fit field" }));
  assert.ok(view.getByText(/100%/));
});
test("Live Mode resets to Auto, advances manually and hides editing clutter", async () => {
  const { view } = await mount(303);
  fireEvent.click(view.getByRole("button", { name: "Endgame" }));
  fireEvent.click(view.getByRole("button", { name: "Start Match" }));
  assert.ok(view.getByRole("heading", { name: "Auto" }));
  assert.equal(view.queryByRole("toolbar"), null);
  assert.equal(view.queryByRole("textbox"), null);
  fireEvent.click(view.getByRole("button", { name: "Next Phase" }));
  assert.ok(view.getByRole("heading", { name: "Transition" }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(view.getByRole("heading", { name: "Transition" }));
  fireEvent.click(view.getByRole("button", { name: "Previous Phase" }));
  assert.ok(view.getByRole("heading", { name: "Auto" }));
  fireEvent.click(view.getByRole("button", { name: "Exit Live Mode" }));
  assert.ok(view.getByRole("toolbar"));
});
test("offline drafts restore across reload, stay isolated from other matches, and sync with explicit save", async () => {
  const { view, context } = await mount(304),
    key = boardDraftKey(context.actorId, context.eventId, context.matchId);
  online = false;
  fireEvent(window, new Event("offline"));
  fireEvent.change(view.getByRole("textbox", { name: /Phase notes/ }), {
    target: { value: "Offline auto plan" },
  });
  const before = saveCalls;
  fireEvent.click(view.getByRole("button", { name: "Save board" }));
  await waitFor(() => assert.ok(view.getByText(/Offline: edits are saved/)));
  assert.equal(saveCalls, before);
  const stored = boardDraftSchema.parse(
    JSON.parse((await readDraft(key, context.actorId))!.value),
  );
  assert.equal(stored.document.phases.auto.notes, "Offline auto plan");
  cleanup();
  const reload = render(<StrategyBoard context={context} />);
  await waitFor(() =>
    assert.equal(
      (reload.getByRole("textbox") as HTMLTextAreaElement).value,
      "Offline auto plan",
    ),
  );
  online = true;
  fireEvent(window, new Event("online"));
  fireEvent.click(reload.getByRole("button", { name: "Save board" }));
  await waitFor(() => assert.ok(reload.getByText("Board saved.")));
  assert.equal(saveCalls, before + 1);
  assert.ok(reload.getByText("Saved revision 1"));
  cleanup();
  const other = await mount(305);
  assert.equal(
    (other.view.getByRole("textbox") as HTMLTextAreaElement).value,
    "",
  );
});
test("stale device revisions block saves and keep local work for export", async () => {
  const context = boardFixture(306),
    key = boardDraftKey(context.actorId, context.eventId, context.matchId);
  const local = structuredClone(context.document);
  local.phases.auto.notes = "Local conflicting plan";
  await writeDraft(
    key,
    context.actorId,
    JSON.stringify({
      eventId: context.eventId,
      matchId: context.matchId,
      matchKey: context.matchKey,
      baseRevision: 0,
      document: local,
    }),
    0,
  );
  context.revision = 2;
  const view = render(<StrategyBoard context={context} />);
  await waitFor(() =>
    assert.ok(view.getByText(/Saved board changed since this device draft/)),
  );
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).value,
    "Local conflicting plan",
  );
  assert.equal(
    (view.getByRole("button", { name: "Save board" }) as HTMLButtonElement)
      .disabled,
    true,
  );
});
test("archived boards expose Live Mode with read-only saved phases", async () => {
  const context = boardFixture(307);
  context.readOnly = true;
  context.document.phases.auto.notes = "Saved archive";
  const view = render(<StrategyBoard context={context} />);
  assert.equal(view.queryByRole("button", { name: "Save board" }), null);
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).readOnly,
    true,
  );
  fireEvent.click(view.getByRole("button", { name: "Start Match" }));
  assert.ok(view.getByText("Saved archive"));
  assert.equal(
    within(view.getByLabelText("Match team legend")).getAllByRole("button")
      .length,
    6,
  );
});
test("a clean device checkpoint cannot replace a newer saved board", async () => {
  const context = boardFixture(308),
    key = boardDraftKey(context.actorId, context.eventId, context.matchId);
  const old = structuredClone(context.document);
  old.phases.auto.notes = "Older accepted plan";
  await writeDraft(
    key,
    context.actorId,
    JSON.stringify({
      eventId: context.eventId,
      matchId: context.matchId,
      matchKey: context.matchKey,
      baseRevision: 1,
      unsynced: false,
      document: old,
    }),
    0,
  );
  context.revision = 2;
  context.document.phases.auto.notes = "Latest saved plan";
  const view = render(<StrategyBoard context={context} />);
  await waitFor(() =>
    assert.equal(
      (view.getByRole("button", { name: "Save board" }) as HTMLButtonElement)
        .disabled,
      false,
    ),
  );
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).value,
    "Latest saved plan",
  );
  assert.equal(view.queryByText(/Saved board changed since/), null);
});

test("team selection colors all new tools, preserves old owners through selection, history, duplication and save/reload", async () => {
  const { view, context } = await mount(411);
  const legend = view.getByLabelText("Match team legend");
  assert.deepEqual(
    within(legend)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label")?.split(" · ")[0]),
    STATION_ORDER,
  );
  let svg = field(view);
  const tools = ["Pen", "Line", "Arrow", "Zone / circle", "Text"];
  for (let i = 0; i < tools.length; i++) {
    const station = STATION_ORDER[i],
      team = context.document.phases.auto.markers[i].teamNumber;
    fireEvent.click(
      within(legend).getByRole("button", { name: `${station} · ${team}` }),
    );
    fireEvent.click(view.getByRole("button", { name: tools[i] }));
    if (tools[i] === "Text")
      fireEvent.change(view.getByRole("textbox", { name: /Text label/ }), {
        target: { value: "Owned label" },
      });
    gesture(svg, svg, 250, 100, 450, 150);
    const objects = [...svg.querySelectorAll("[data-object]")];
    assert.equal(objects[i].getAttribute("color"), STATION_PALETTE[station]);
    assert.equal(objects[i].getAttribute("data-owner-station"), station);
    assert.equal(objects[i].getAttribute("data-owner-team"), String(team));
    assert.equal(objects[0].getAttribute("color"), STATION_PALETTE.R1);
    const circle = svg.querySelector(
      `[data-marker="${station}"] circle[r="30"]`,
    )!;
    assert.equal(circle.getAttribute("fill"), STATION_PALETTE[station]);
    assert.equal(
      circle.parentElement?.querySelector("text")?.getAttribute("fill"),
      STRATEGY_INK,
    );
  }
  assert.equal(
    svg
      .querySelector('[data-owner-station="R3"] line')
      ?.getAttribute("marker-end"),
    "url(#arrow-auto-R3)",
  );
  assert.equal(
    svg.querySelector("#arrow-auto-R3 path")?.getAttribute("fill"),
    STATION_PALETTE.R3,
  );
  fireEvent.click(within(legend).getByRole("button", { name: "B3 · 300" }));
  fireEvent.click(view.getByRole("button", { name: "Select / move robot" }));
  gesture(
    svg.querySelector('[data-owner-station="R2"] line')!,
    svg,
    250,
    100,
    300,
    120,
  );
  assert.equal(
    svg.querySelector('[data-owner-station="R2"]')?.getAttribute("color"),
    STATION_PALETTE.R2,
  );
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  fireEvent.click(view.getByRole("button", { name: "Redo" }));
  assert.equal(
    svg
      .querySelector('[data-owner-station="R2"]')
      ?.getAttribute("data-owner-team"),
    "50",
  );
  const ids = [...svg.querySelectorAll("[data-object]")].map((n) =>
    n.getAttribute("data-object"),
  );
  fireEvent.click(view.getByRole("button", { name: "Transition" }));
  fireEvent.click(
    view.getByRole("button", { name: "Duplicate previous phase" }),
  );
  svg = field(view);
  assert.equal(svg.querySelectorAll("[data-object]").length, 5);
  assert.ok(
    [...svg.querySelectorAll("[data-object]")].every(
      (n) => !ids.includes(n.getAttribute("data-object")),
    ),
  );
  fireEvent.click(view.getByRole("button", { name: "Save board" }));
  await waitFor(() => assert.ok(view.getByText("Board saved.")));
  const key = boardDraftKey(context.actorId, context.eventId, context.matchId);
  const saved = boardDraftSchema.parse(
    JSON.parse((await readDraft(key, context.actorId))!.value),
  );
  assert.deepEqual(
    saved.document.phases.transition.objects.map((o) => [
      o.ownerStation,
      o.ownerTeamNumber,
      o.phaseId,
    ]),
    STATION_ORDER.slice(0, 5).map((station, i) => [
      station,
      context.document.phases.auto.markers[i].teamNumber,
      "transition",
    ]),
  );
  cleanup();
  // A server reload supplies the same accepted document through the existing pipeline.
  const reload = render(
    <StrategyBoard
      context={{ ...context, document: saved.document, revision: 1 }}
    />,
  );
  await waitFor(() =>
    assert.equal(
      (reload.getByRole("button", { name: "Pen" }) as HTMLButtonElement)
        .disabled,
      false,
    ),
  );
  assert.equal(
    field(reload)
      .querySelector('[data-owner-station="R2"]')
      ?.getAttribute("color"),
    STATION_PALETTE.R2,
  );
  fireEvent.click(reload.getByRole("button", { name: "Start Match" }));
  const liveLegend = within(
    reload.getByLabelText("Match team legend"),
  ).getAllByRole("button");
  assert.equal(liveLegend.length, 6);
  assert.ok(liveLegend.every((b) => b.querySelector("span[style]")));
  assert.ok(liveLegend[4].textContent?.includes("Blue"));
});

test("missing stations retain Unknown slots and image labels without shifting teams", async () => {
  const context = boardFixture(412);
  context.lineup = context.lineup.filter((s) => s.stationLabel !== "R2");
  for (const phase of Object.values(context.document.phases))
    phase.markers = phase.markers.filter((m) => m.station !== "R2");
  const view = render(<StrategyBoard context={context} />);
  const buttons = within(view.getByLabelText("Match team legend")).getAllByRole(
    "button",
  );
  assert.deepEqual(
    buttons.map((b) => b.getAttribute("aria-label")?.split(" · ")[0]),
    STATION_ORDER,
  );
  assert.equal((buttons[1] as HTMLButtonElement).disabled, true);
  assert.match(buttons[1].textContent ?? "", /Unknown/);
  assert.match(buttons[2].textContent ?? "", /1000/);
  const svg = field(view);
  assert.equal(svg.querySelector('[data-marker="R2"]'), null);
  assert.equal(
    svg.querySelector('[data-station-label="R2"] text')?.textContent,
    "Unknown",
  );
  assert.equal(
    svg.querySelector('[data-station-label="R3"] text')?.textContent,
    "1000",
  );
  assert.equal(
    svg
      .querySelector('[data-station-label="R3"]')
      ?.getAttribute("pointer-events"),
    "none",
  );
  const b1 = context.config.field.stationLabels!.B1!,
    b3 = context.config.field.stationLabels!.B3!;
  assert.ok(b1.y > b3.y);
});

test("a touch gesture retains the owner selected when it started", () => {
  const f = boardFixture(413),
    state = f.document.phases.auto;
  let changed = state;
  const props = {
    config: f.config,
    phaseId: "auto",
    state,
    tool: "pen" as const,
    editable: true,
    text: "",
    onChange: (next: typeof state) => {
      changed = next;
    },
  };
  const view = render(<FieldBoard {...props} owner={state.markers[0]} />);
  const svg = field(view);
  fireEvent.pointerDown(svg, {
    button: 0,
    clientX: 200,
    clientY: 100,
    pointerId: 1,
    pointerType: "touch",
  });
  view.rerender(<FieldBoard {...props} owner={state.markers[4]} />);
  fireEvent.pointerMove(svg, {
    clientX: 400,
    clientY: 200,
    pointerId: 1,
    pointerType: "touch",
  });
  fireEvent.pointerUp(svg, {
    clientX: 400,
    clientY: 200,
    pointerId: 1,
    pointerType: "touch",
  });
  assert.equal(changed.objects[0].ownerStation, "R1");
  assert.equal(changed.objects[0].ownerTeamNumber, 700);
});

test("Text tool drags the original label; hold actions edit, explicitly duplicate and delete with undo", async () => {
  const { view } = await mount(501);
  fireEvent.click(view.getByRole("button", { name: "Text" }));
  fireEvent.change(view.getByRole("textbox", { name: /Text label/ }), {
    target: { value: "Original" },
  });
  const svg = field(view);
  gesture(svg, svg, 200, 100, 200, 100);
  const original = svg.querySelector("[data-object]")!,
    id = original.getAttribute("data-object");
  gesture(original.querySelector("text")!, svg, 200, 100, 350, 150);
  assert.equal(svg.querySelectorAll("[data-object]").length, 1);
  assert.equal(
    svg.querySelector("[data-object]")?.getAttribute("data-object"),
    id,
  );
  assert.equal(
    svg.querySelector("[data-object] text")?.getAttribute("x"),
    "350",
  );
  const hold = async (target: Element, pointerType: string) => {
    fireEvent.pointerDown(target, {
      button: 0,
      clientX: 350,
      clientY: 150,
      pointerId: 1,
      pointerType,
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 580));
    });
    fireEvent.pointerUp(svg, {
      clientX: 350,
      clientY: 150,
      pointerId: 1,
      pointerType,
    });
    assert.ok(view.getByRole("dialog", { name: "Text item options" }));
  };
  await hold(svg.querySelector("[data-object] text")!, "touch");
  assert.equal(
    (view.getByRole("button", { name: "Delete text" }) as HTMLButtonElement)
      .style.color,
    "rgb(153, 27, 27)",
  );
  fireEvent.click(view.getByRole("button", { name: "Edit text" }));
  fireEvent.change(view.getByRole("textbox", { name: "Edit text" }), {
    target: { value: "Edited original" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Apply text" }).closest("form")!,
  );
  assert.equal(
    svg.querySelector("[data-object] text")?.textContent,
    "Edited original",
  );
  assert.equal(
    svg.querySelector("[data-object]")?.getAttribute("data-object"),
    id,
  );
  await hold(svg.querySelector("[data-object] text")!, "mouse");
  fireEvent.click(view.getByRole("button", { name: "Duplicate text" }));
  const objects = [...svg.querySelectorAll("[data-object]")];
  assert.equal(objects.length, 2);
  assert.notEqual(objects[1].getAttribute("data-object"), id);
  assert.equal(
    objects[1].getAttribute("data-owner-team"),
    objects[0].getAttribute("data-owner-team"),
  );
  assert.equal(
    objects[1].getAttribute("color"),
    objects[0].getAttribute("color"),
  );
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(svg.querySelectorAll("[data-object]").length, 1);
  fireEvent.click(view.getByRole("button", { name: "Redo" }));
  assert.equal(svg.querySelectorAll("[data-object]").length, 2);
  await hold(svg.querySelector("[data-object] text")!, "touch");
  fireEvent.click(view.getByRole("button", { name: "Delete text" }));
  assert.equal(svg.querySelectorAll("[data-object]").length, 1);
  assert.notEqual(
    svg.querySelector("[data-object]")?.getAttribute("data-object"),
    id,
  );
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(svg.querySelectorAll("[data-object]").length, 2);
});

test("Pan accumulates every movement at phone scale without moving drawings or markers", async () => {
  const { view } = await mount(502),
    svg = field(view);
  const markers = [...svg.querySelectorAll("[data-marker]")].map((m) =>
    m.getAttribute("transform"),
  );
  const width = 390,
    h = boardFixture().config.field.height;
  Object.assign(svg, {
    getBoundingClientRect: () => ({
      width,
      height: (width * h) / 1000,
      left: 0,
      top: 0,
    }),
  });
  fireEvent.click(view.getByRole("button", { name: "Pan" }));
  const target = svg.querySelector('[data-marker="R1"]')!;
  fireEvent.pointerDown(target, {
    button: 0,
    clientX: 50,
    clientY: 30,
    pointerId: 1,
  });
  for (let x = 60; x <= 150; x += 10)
    fireEvent.pointerMove(svg, { clientX: x, clientY: 80, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 150, clientY: 80, pointerId: 1 });
  const match = svg
    .querySelector("g[transform]")!
    .getAttribute("transform")!
    .match(/translate\(([^ ]+) ([^)]+)\)/)!;
  assert.ok(Math.abs(Number(match[1]) - 100 / 0.39) < 1e-8);
  assert.ok(Math.abs(Number(match[2]) - 50 / 0.39) < 1e-8);
  assert.deepEqual(
    [...svg.querySelectorAll("[data-marker]")].map((m) =>
      m.getAttribute("transform"),
    ),
    markers,
  );
  assert.equal(svg.querySelectorAll("[data-object]").length, 0);
  assert.equal(
    (view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled,
    true,
  );
});

test("wheel zoom anchors at the mouse and stops at 100%, with isolated expanded field", async () => {
  const { view } = await mount(503),
    svg = field(view);
  const event = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 400,
    clientY: 160,
    deltaY: -100,
  });
  fireEvent(svg, event);
  assert.equal(event.defaultPrevented, true);
  await waitFor(() =>
    assert.notEqual(
      svg.querySelector("g[transform]")?.getAttribute("transform"),
      "translate(0 0) scale(1)",
    ),
  );
  const transform = svg
      .querySelector("g[transform]")!
      .getAttribute("transform")!,
    values = transform.match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/)!;
  const x = Number(values[1]),
    y = Number(values[2]),
    zoom = Number(values[3]);
  assert.ok(Math.abs((400 - x) / zoom - 400) < 1e-8);
  assert.ok(Math.abs((160 - y) / zoom - 160) < 1e-8);
  for (let i = 0; i < 5; i++)
    fireEvent.wheel(svg, { clientX: 400, clientY: 160, deltaY: 100 });
  await waitFor(() => assert.ok(view.getByText(/100%/)));
  fireEvent.click(view.getByRole("button", { name: "Zoom out" }));
  assert.ok(view.getByText(/100%/));
  fireEvent.click(view.getByRole("button", { name: "Expand field" }));
  assert.ok(view.getByRole("button", { name: "Close expanded field" }));
  assert.equal(svg.style.overscrollBehavior, "contain");
  fireEvent.click(view.getByRole("button", { name: "Navigate field" }));
  assert.equal(
    view
      .getByRole("button", { name: "Navigate field" })
      .getAttribute("aria-pressed"),
    "true",
  );
  gesture(svg.querySelector('[data-marker="R1"]')!, svg, 100, 100, 160, 130);
  assert.equal(svg.querySelectorAll("[data-object]").length, 0);
  fireEvent.click(view.getByRole("button", { name: "Close expanded field" }));
  assert.ok(view.getByRole("button", { name: "Expand field" }));
});

test("two-finger pinch cancels a pending object drag and continues as pan after a finger lifts", async () => {
  const { view } = await mount(504),
    svg = field(view),
    marker = svg.querySelector('[data-marker="R1"]')!,
    before = marker.getAttribute("transform");
  fireEvent.pointerDown(marker, {
    button: 0,
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    pointerType: "touch",
  });
  fireEvent.pointerMove(svg, {
    clientX: 120,
    clientY: 100,
    pointerId: 1,
    pointerType: "touch",
  });
  fireEvent.pointerDown(svg, {
    button: 0,
    clientX: 300,
    clientY: 100,
    pointerId: 2,
    pointerType: "touch",
  });
  fireEvent.pointerMove(svg, {
    clientX: 480,
    clientY: 100,
    pointerId: 2,
    pointerType: "touch",
  });
  fireEvent.pointerUp(svg, {
    clientX: 480,
    clientY: 100,
    pointerId: 2,
    pointerType: "touch",
  });
  fireEvent.lostPointerCapture(svg, { pointerId: 2 });
  assert.ok(view.getByText(/200%/));
  const pinch = svg.querySelector("g[transform]")!.getAttribute("transform");
  fireEvent.pointerMove(svg, {
    clientX: 170,
    clientY: 100,
    pointerId: 1,
    pointerType: "touch",
  });
  fireEvent.pointerUp(svg, {
    clientX: 170,
    clientY: 100,
    pointerId: 1,
    pointerType: "touch",
  });
  assert.notEqual(
    svg.querySelector("g[transform]")!.getAttribute("transform"),
    pinch,
  );
  assert.equal(marker.getAttribute("transform"), before);
  assert.equal(svg.querySelectorAll("[data-object]").length, 0);
  assert.equal(
    (view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled,
    true,
  );
});

function importFile(view: ReturnType<typeof render>, value: string) {
  const file = new window.File([value], "board-strategy.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", { value: async () => value });
  fireEvent.change(view.getByLabelText("Import device draft file"), {
    target: { files: [file] },
  });
}

test("More stacks Load, Export and Import below Save; import restores all phases, survives reload and saves", async () => {
  const { view, context } = await mount(601);
  const more = view.getByText("More").closest("details")!;
  fireEvent.click(view.getByText("More"));
  assert.deepEqual(
    [...more.querySelectorAll("button")].map((b) => b.textContent),
    ["Load saved board", "Export device draft", "Import device draft"],
  );
  const imported = structuredClone(context.document);
  for (const [i, [id, phase]] of Object.entries(imported.phases).entries()) {
    phase.notes = `Imported phase ${i}`;
    phase.markers[0].position = { x: 0.3, y: 0.4 };
    phase.objects = [
      {
        id: boardId(9000 + i),
        phaseId: id,
        type: "text",
        ownerStation: "B2",
        ownerTeamNumber: 20,
        position: { x: 0.5, y: 0.4 },
        text: `Plan ${i}`,
      },
    ];
  }
  importFile(
    view,
    JSON.stringify({
      eventId: context.eventId,
      matchId: context.matchId,
      matchKey: context.matchKey,
      baseRevision: 99,
      document: imported,
    }),
  );
  await waitFor(() => assert.ok(view.getByText(/Device draft imported/)));
  assert.equal(
    (view.getByRole("textbox", { name: /Phase notes/ }) as HTMLTextAreaElement)
      .value,
    "Imported phase 0",
  );
  fireEvent.click(view.getByRole("button", { name: "Endgame" }));
  assert.equal(
    (view.getByRole("textbox", { name: /Phase notes/ }) as HTMLTextAreaElement)
      .value,
    "Imported phase 6",
  );
  const key = boardDraftKey(context.actorId, context.eventId, context.matchId);
  const stored = boardDraftSchema.parse(
    JSON.parse((await readDraft(key, context.actorId))!.value),
  );
  assert.deepEqual(stored.document, imported);
  assert.equal(stored.baseRevision, 0);
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(
    (view.getByRole("textbox", { name: /Phase notes/ }) as HTMLTextAreaElement)
      .value,
    "",
  );
  fireEvent.click(view.getByRole("button", { name: "Redo" }));
  fireEvent.click(view.getByRole("button", { name: "Save board" }));
  await waitFor(() => assert.ok(view.getByText("Board saved.")));
  cleanup();
  const reload = render(
    <StrategyBoard context={{ ...context, document: imported, revision: 1 }} />,
  );
  await waitFor(() =>
    assert.equal(
      (reload.getByRole("button", { name: "Pen" }) as HTMLButtonElement)
        .disabled,
      false,
    ),
  );
  assert.equal(
    (
      reload.getByRole("textbox", {
        name: /Phase notes/,
      }) as HTMLTextAreaElement
    ).value,
    "Imported phase 0",
  );
});

test("failed and canceled imports preserve the current board", async () => {
  const { view, context } = await mount(602);
  fireEvent.change(view.getByRole("textbox", { name: /Phase notes/ }), {
    target: { value: "Keep this work" },
  });
  importFile(view, "invalid JSON");
  await waitFor(() => assert.ok(view.getByText(/Could not import this draft/)));
  assert.equal(
    (view.getByRole("textbox", { name: /Phase notes/ }) as HTMLTextAreaElement)
      .value,
    "Keep this work",
  );
  const envelope = {
    eventId: context.eventId,
    matchId: context.matchId,
    matchKey: context.matchKey,
    baseRevision: 0,
    document: context.document,
  };
  importFile(
    view,
    JSON.stringify({ ...envelope, matchKey: "different_match" }),
  );
  await waitFor(() => assert.ok(view.getByText(/different event or match/)));
  confirm = false;
  importFile(view, JSON.stringify(envelope));
  await waitFor(() =>
    assert.equal(
      (view.getByRole("button", { name: "Save board" }) as HTMLButtonElement)
        .disabled,
      false,
    ),
  );
  assert.equal(
    (view.getByRole("textbox", { name: /Phase notes/ }) as HTMLTextAreaElement)
      .value,
    "Keep this work",
  );
});

test("scouts see only the map and navigation, never notes, editing, Live Mode or draft controls", async () => {
  const context = boardFixture(603);
  context.viewOnly = true;
  context.readOnly = true;
  context.document.phases.auto.notes = "Private notes must never appear";
  const view = render(<StrategyBoard context={context} />);
  assert.ok(view.getByText(/View only/));
  assert.equal(view.queryByRole("toolbar"), null);
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByText(/Private notes/), null);
  for (const name of [
    "Start Match",
    "Save board",
    "Export device draft",
    "Load saved board",
    "Import device draft",
    "Pen",
    "Auto",
  ])
    assert.equal(view.queryByRole("button", { name }), null);
  assert.equal(view.queryByText("More"), null);
  assert.ok(view.getByRole("button", { name: "Zoom in" }));
  assert.ok(view.getByRole("button", { name: "Navigate field" }));
  const svg = field(view),
    marker = svg.querySelector('[data-marker="R1"]')!,
    before = marker.getAttribute("transform");
  gesture(marker, svg, 100, 100, 160, 160);
  assert.equal(marker.getAttribute("transform"), before);
  assert.match(
    svg.querySelector("g[transform]")!.getAttribute("transform")!,
    /translate\(60 60\)/,
  );
});
