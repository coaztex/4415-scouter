import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PitCapabilities } from "../src/features/pit/components/fields";
import { AutoRoutines } from "../src/features/pit/components/routines";
import { blankPit, newRoutine } from "../src/features/pit/model";
import { TeamMechanismSummary } from "../src/features/teams/components/mechanism-badge";
import { PitWeight } from "../src/features/teams/components/pit-weight";

const noop = () => {};
test("pit capability form keeps numeric estimate optional and climbing secondary", () => {
  const data = blankPit();
  const markup = renderToStaticMarkup(
    <PitCapabilities
      data={data}
      change={noop}
      capacityMode="band"
      setCapacityMode={noop}
      numeric=""
      setNumeric={noop}
      weightNumeric=""
      setWeightNumeric={noop}
    />,
  );
  assert.match(markup, /Approximate maximum FUEL capacity/);
  assert.match(markup, /Unknown or qualitative estimate/);
  assert.match(markup, /Climbing/);
  assert.match(markup, /Primary scoring mechanism/);
  assert.match(markup, /Robot specifications/);
  assert.match(markup, /Robot weight \(lb\)/);
  assert.match(markup, /Excludes battery and bumpers\./);
  assert.equal(
    (markup.match(/name="primary-scoring-mechanism"/g) ?? []).length,
    4,
  );
  assert.match(
    markup,
    /name="primary-scoring-mechanism" checked="" value="unknown"/,
  );
  assert.doesNotMatch(markup, /Highest demonstrated level/);
  for (const forbidden of [
    "Ground intake",
    "Source intake",
    "Cycler",
    "Passing capability",
  ]) {
    assert.doesNotMatch(markup, new RegExp(forbidden, "i"));
  }
  const yes = renderToStaticMarkup(
    <PitCapabilities
      data={{ ...data, climbing: { capability: "yes" } }}
      change={noop}
      capacityMode="approximate_count"
      setCapacityMode={noop}
      numeric="42"
      setNumeric={noop}
      weightNumeric="112.4"
      setWeightNumeric={noop}
    />,
  );
  assert.match(yes, /Highest demonstrated level/);
  assert.match(yes, /Approximate FUEL count/);
  assert.match(yes, /value="112.4"/);
});

test("team profile labels known and unknown pit-reported robot weight", () => {
  const known = renderToStaticMarkup(<PitWeight weightLbs={112.4} />);
  const unknown = renderToStaticMarkup(<PitWeight weightLbs={null} />);
  assert.match(known, /Weight/);
  assert.match(known, /112.4 lb/);
  assert.match(known, /Pit reported · excludes battery and bumpers/);
  assert.match(unknown, /Unknown/);
  assert.doesNotMatch(unknown, /0 lb/);
});

test("Other reveals a required shooter type; team view distinguishes unreported mechanisms", () => {
  const data = { ...blankPit(), primary_scoring_mechanism: "other" as const };
  const form = renderToStaticMarkup(
    <PitCapabilities
      data={data}
      change={noop}
      capacityMode="band"
      setCapacityMode={noop}
      numeric=""
      setNumeric={noop}
      weightNumeric=""
      setWeightNumeric={noop}
    />,
  );
  assert.match(form, /Other shooter type/);
  assert.match(form, /required="" id="pit-other-shooter-type"/);
  const missing = renderToStaticMarkup(
    <TeamMechanismSummary
      mechanism="unknown"
      reported={false}
      otherType={null}
    />,
  );
  assert.match(missing, /UNKNOWN/);
  assert.match(missing, /Not yet pit reported/);
  const known = renderToStaticMarkup(
    <TeamMechanismSummary
      mechanism="other"
      reported={true}
      otherType="Flywheel"
    />,
  );
  assert.match(known, /OTHER/);
  assert.match(known, /Flywheel/);
});

test("separate routine cards render independent start, score, and collection claims", () => {
  const data = {
    ...blankPit(),
    autonomous_routines: [
      newRoutine("00000000-0000-4000-8000-000000000001"),
      newRoutine("00000000-0000-4000-8000-000000000002"),
    ],
  };
  const markup = renderToStaticMarkup(
    <AutoRoutines data={data} change={noop} />,
  );
  assert.match(markup, /Routine 1/);
  assert.match(markup, /Routine 2/);
  assert.equal((markup.match(/Collects additional FUEL/g) ?? []).length, 2);
});
