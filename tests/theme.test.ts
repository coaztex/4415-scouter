import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
function palette(selector: string) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}
function luminance(hex: string) {
  const channels = [1, 3, 5].map(
    (index) => parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("light and dark text and scouting status pairs have readable contrast", () => {
  for (const theme of [":root", ':root[data-theme="dark"]']) {
    const colors = palette(theme);
    for (const [text, background] of [
      ["foreground", "surface"],
      ["muted", "surface"],
      ["on-accent", "accent"],
      ["on-brand-secondary", "brand-secondary"],
      ["on-brand-primary", "brand-primary"],
      ["on-brand-primary", "brand-primary-hover"],
      ["on-foreground", "foreground"],
      ["coverage-complete-text", "coverage-complete-bg"],
      ["coverage-progress-text", "coverage-progress-bg"],
      ["coverage-missing-text", "coverage-missing-bg"],
      ["coverage-review-text", "coverage-review-bg"],
      ["alliance-red", "alliance-red-bg"],
      ["alliance-blue", "alliance-blue-bg"],
    ]) {
      assert.ok(
        contrast(colors[text], colors[background]) >= 4.5,
        `${theme}: ${text} on ${background}`,
      );
    }
  }
});
