import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EventModules } from "../src/features/events/components/event-modules";

test("overview quick actions are balanced and respect scout role", () => {
  const scout = renderToStaticMarkup(
    <EventModules eventKey="2026test" role="scout" />,
  );
  const strategy = renderToStaticMarkup(
    <EventModules eventKey="2026test" role="strategy" />,
  );
  assert.equal((scout.match(/class="interactive-card/g) ?? []).length, 4);
  assert.equal((strategy.match(/class="interactive-card/g) ?? []).length, 4);
  assert.match(scout, /Match Scouting/);
  assert.match(scout, /Pit Scouting/);
  assert.match(scout, /Schedule/);
  assert.match(scout, /Teams/);
  assert.doesNotMatch(scout, /Match Prep/);
  assert.match(strategy, /Match Prep/);
  assert.doesNotMatch(strategy, />Teams<\/a>/);
});
