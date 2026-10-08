import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Overview } from "../src/features/stats/components/overview";
import { Tabs } from "../src/components/ui/tabs";
import { Ranking } from "../src/features/stats/components/ranking";
import { metricsByTab, querySchema } from "../src/features/stats/model";
import { build2026Stats } from "../src/games/2026-rebuilt/stats";
import { emptyScouting } from "../src/features/teams/model";
import type { StatsRow } from "../src/features/stats/model";

test("activity sort options use the same current terminology as their tables", () => {
  const labels = metricsByTab.activity
    .map((metric) => metric.label)
    .join(" · ");
  assert.doesNotMatch(labels, /Shuffl|Shuttler|Inactive \/ other/);
  assert.match(labels, /Shuttling \/ Passing time share/);
  assert.match(labels, /Other \/ Idle time share/);
});

test("Stats overview distinguishes missing sources and small samples", () => {
  const overall = build2026Stats([]).overall;
  const row = {
    teamNumber: 4415,
    metrics: emptyScouting(),
    tba: null,
    statbotics: null,
  } as StatsRow;
  const html = renderToStaticMarkup(
    <Overview rows={[row]} overall={overall} uncertain={false} />,
  );
  assert.match(html, /Event Baselines/);
  assert.match(html, /Distribution needs at least 5 eligible teams/);
  assert.match(html, /TBA cache/);
  assert.match(html, /Statbotics cache/);
  assert.match(html, /Missing EPA is unknown, never zero/);
  assert.match(html, /Shuttling \/ Passing/);
  assert.doesNotMatch(html, /Passer-Feeder|Shuttler|Shuffling/);
});

test("team incident links can open the incidents tab directly", () => {
  const html = renderToStaticMarkup(
    <Tabs
      label="Team detail"
      initialTab="incidents"
      items={[
        { id: "overview", label: "Overview", content: <p>Profile</p> },
        {
          id: "incidents",
          label: "Incidents",
          content: <p>Recent incidents</p>,
        },
      ]}
    />,
  );
  assert.match(html, /aria-selected="true"[^>]*>Incidents/);
  assert.match(html, /Recent incidents/);
});

test("one-match team values remain visible with a limited-sample warning", () => {
  const metrics = emptyScouting();
  metrics.sampleSize = 1;
  metrics.fuel.teleop.sampleSize = 1;
  metrics.fuel.teleop.median = 12;
  const row = {
    teamNumber: 4415,
    nickname: "Epic Robotz",
    metrics,
  } as StatsRow;
  const html = renderToStaticMarkup(
    <Ranking
      eventKey="2026cascmp"
      rows={[row]}
      metric={metricsByTab.fuel[0]}
      query={querySchema.parse({ tab: "fuel" })}
    />,
  );
  assert.match(html, /Limited sample/);
  assert.match(html, /teams\/4415/);
});
