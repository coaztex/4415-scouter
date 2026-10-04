import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { TeamAvatar } from "../src/features/team-avatar/components/team-avatar";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
});

test("team logo renders lazily in a fixed box with no description", () => {
  const { container } = render(
    createElement(TeamAvatar, {
      teamNumber: 4415,
      src: "https://example.com/avatar.webp",
    }),
  );
  const box = container.querySelector(
    '[data-team-avatar="logo"]',
  ) as HTMLElement;
  const image = box.querySelector("img")!;
  assert.equal(box.style.width, "48px");
  assert.equal(box.style.height, "48px");
  assert.equal(image.getAttribute("loading"), "lazy");
  assert.equal(image.getAttribute("alt"), "");
  assert.equal(image.getAttribute("width"), "48");
  assert.equal(image.getAttribute("height"), "48");
  assert.ok(image.className.includes("object-contain"));
  assert.ok(!image.className.includes("p-1"));
  cleanup();
});

test("missing logo uses a team-number mark with reserved size", () => {
  const { container } = render(
    createElement(TeamAvatar, { teamNumber: 4415, src: null, size: 64 }),
  );
  const box = container.querySelector(
    '[data-team-avatar="fallback"]',
  ) as HTMLElement;
  assert.equal(box.textContent?.trim(), "4415");
  assert.equal(box.style.width, "64px");
  assert.equal(box.style.height, "64px");
  assert.equal(box.querySelector("img"), null);
  cleanup();
});

test("failed image switches to fallback without changing layout dimensions", () => {
  const { container } = render(
    createElement(TeamAvatar, {
      teamNumber: 4415,
      src: "https://example.com/broken.webp",
    }),
  );
  fireEvent.error(container.querySelector("img")!);
  const box = container.querySelector(
    '[data-team-avatar="fallback"]',
  ) as HTMLElement;
  assert.ok(box);
  assert.equal(box.textContent?.trim(), "4415");
  assert.equal(box.style.width, "48px");
  assert.equal(box.style.height, "48px");
  cleanup();
});
