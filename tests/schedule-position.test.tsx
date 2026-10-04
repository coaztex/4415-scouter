import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, Fragment } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SchedulePosition } from "../src/features/event-schedule/components/position";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
const scrolled: string[] = [];
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
  cancelAnimationFrame: () => undefined,
});
dom.window.HTMLElement.prototype.scrollIntoView = function () {
  scrolled.push(this.id);
};

test("schedule auto-positions once and a manual jump works after live target changes", () => {
  scrolled.length = 0;
  const view = (target: string) =>
    createElement(
      Fragment,
      null,
      createElement("div", { id: "q47" }),
      createElement("div", { id: "q48" }),
      createElement(SchedulePosition, { targetId: target, label: "next" }),
    );
  const screen = render(view("q47"));
  assert.deepEqual(scrolled, ["q47"]);
  screen.rerender(view("q48"));
  assert.deepEqual(
    scrolled,
    ["q47"],
    "incoming updates must not move a reader",
  );
  fireEvent.click(screen.getByRole("button", { name: "Jump to next" }));
  assert.deepEqual(scrolled, ["q47", "q48"]);
  cleanup();
});
