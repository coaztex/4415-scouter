import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ThemeToggle,
  ThemeSelector,
} from "../src/components/layout/theme-toggle";
import { ScoutingStatusChip } from "../src/components/ui/scouting-status-chip";
import {
  CoverageBadge,
  TeamPill,
} from "../src/features/event-schedule/components/coverage";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
  cancelAnimationFrame: () => undefined,
});

test("theme follows stored preference and cycles through system, light, and dark", () => {
  localStorage.setItem("frc-scout-theme", "dark");
  const screen = render(<ThemeToggle />);
  assert.equal(document.documentElement.dataset.theme, "dark");
  fireEvent.click(screen.getByRole("button", { name: /Theme: dark/i }));
  assert.equal(document.documentElement.dataset.theme, undefined);
  assert.equal(localStorage.getItem("frc-scout-theme"), "system");
  fireEvent.click(screen.getByRole("button", { name: /Theme: system/i }));
  assert.equal(document.documentElement.dataset.theme, "light");
  cleanup();
});

test("settings offers direct system, light, and dark choices", () => {
  localStorage.setItem("frc-scout-theme", "system");
  const screen = render(<ThemeSelector />);
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(localStorage.getItem("frc-scout-theme"), "dark");
  assert.equal(
    screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed"),
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "System" }));
  assert.equal(document.documentElement.dataset.theme, undefined);
  cleanup();
});

test("pit status keeps labels while schedule team pills use color and accessible words", () => {
  for (const [status, label] of [
    ["completed", "Completed"],
    ["in_progress", "In progress"],
    ["not_scouted", "Not scouted"],
    ["needs_review", "Needs review"],
  ] as const) {
    const html = renderToStaticMarkup(<ScoutingStatusChip status={status} />);
    assert.ok(html.includes(`scouting-status-${status}`));
    assert.ok(html.includes(label));
    assert.ok(!html.includes('aria-hidden="true"'));
    assert.ok(!/[✓◐!]/.test(html));
  }
  const pill = renderToStaticMarkup(
    <TeamPill eventKey="2026cascmp" teamNumber={4415} state="complete" />,
  );
  assert.ok(pill.includes("coverage-complete"));
  assert.ok(pill.includes("Team 4415 — scouting complete"));
  assert.ok(pill.includes(">4415</span>"));
  assert.ok(pill.includes(">Complete</span>"));
  assert.ok(!pill.includes('aria-hidden="true"'));
  const badge = renderToStaticMarkup(<CoverageBadge state="in_progress" />);
  assert.ok(badge.includes("In progress"));
  assert.ok(!badge.includes("◐"));
});
