import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AutoFields } from "../src/features/scouting/match/components/auto";
import { PostFields } from "../src/features/scouting/match/components/post";
import { FuelCounter } from "../src/features/scouting/match/components/controls";
import { freshDraft } from "../src/features/scouting/match/model";
const id = "00000000-0000-4000-8000-000000000001";
const draft = () =>
  freshDraft(
    {
      actorId: id,
      assignedScoutId: id,
      assignmentId: id,
      matchId: id,
      teamNumber: 1,
    },
    1000,
    id,
  );
test("counter renders four large labeled taps and undo", () => {
  const html = renderToStaticMarkup(
    <FuelCounter phase="AUTO" total={0} canUndo={false} onTap={() => {}} />,
  );
  for (const n of [1, 5, 10, 20])
    assert.ok(html.includes(`Add ${n} estimated AUTO FUEL`));
  assert.ok(html.includes("Undo AUTO FUEL increment"));
});
test("auto achieved level appears only for achieved climb", () => {
  const d = draft();
  assert.ok(
    !renderToStaticMarkup(<AutoFields draft={d} change={() => {}} />).includes(
      "Auto achieved level",
    ),
  );
  d.data.auto.climb = { result: "achieved" };
  assert.ok(
    renderToStaticMarkup(<AutoFields draft={d} change={() => {}} />).includes(
      "Auto achieved level",
    ),
  );
});
test("post fields use revised roles/confidence and show defense/recovery only when relevant", () => {
  const d = draft(),
    render = () =>
      renderToStaticMarkup(
        <PostFields draft={d} change={() => {}} dns={() => {}} />,
      );
  let html = render();
  assert.ok(!html.includes("Cycler"));
  for (const role of [
    "Scorer",
    "Passer-Feeder",
    "Defender",
    "Mixed",
    "Inactive",
  ])
    assert.ok(html.includes(role));
  assert.ok(html.includes("Very uncertain"));
  assert.ok(!html.includes("Defense effectiveness"));
  assert.ok(!html.includes('label for="capture-Recovered"'));
  d.data.post_match.defense_observed = true;
  d.data.post_match.reliability = "minor_issue";
  html = render();
  assert.ok(html.includes("Defense effectiveness"));
  assert.ok(html.includes('label for="capture-Recovered"'));
  assert.ok(html.includes("Climb (secondary)"));
  assert.ok(!html.includes("climb timer"));
});
