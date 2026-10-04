import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteSkeleton } from "../src/components/ui/route-skeleton";

test("high-traffic route loading states reserve themed geometry without spinners", () => {
  for (const route of [
    "events",
    "event",
    "schedule",
    "match",
    "teams",
    "team",
    "stats",
    "picklist",
  ] as const) {
    const html = renderToStaticMarkup(<RouteSkeleton route={route} />);
    assert.match(html, /role="status"/);
    assert.match(html, /bg-surface/);
    assert.match(html, /border-border/);
    assert.match(html, /motion-safe:animate-pulse/);
    assert.doesNotMatch(html, /spinner/i);
  }
});
