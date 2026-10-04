import test from "node:test";
import assert from "node:assert/strict";
import {
  modulesForRole,
  eventModuleHref,
} from "../src/features/events/modules";
import { eventDates } from "../src/features/events/presentation";

test("the shared route/navigation policy excludes strategy destinations for scouts", () => {
  for (const slug of ["match-prep", "picklist"]) {
    assert.equal(
      modulesForRole("scout").some((module) => module.slug === slug),
      false,
    );
    for (const role of ["strategy", "admin"] as const)
      assert.ok(modulesForRole(role).some((module) => module.slug === slug));
  }
  assert.equal(
    eventModuleHref("2026fixture", "teams"),
    "/events/2026fixture/teams",
  );
});
test("event dates retain calendar day regardless of local timezone, and support missing dates", () => {
  assert.equal(eventDates("2026-03-01", "2026-03-01"), "Mar 1, 2026");
  assert.equal(eventDates(null, null), "Dates to be announced");
  assert.equal(eventDates(null, "2026-03-01"), "Ends Mar 1, 2026");
});
