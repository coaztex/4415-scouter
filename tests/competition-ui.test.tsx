import "./fixtures/dom-setup";
import test from "node:test";
import assert from "node:assert/strict";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  FuelCounter,
  PhaseAdvance,
} from "../src/features/scouting/match/components/controls";
import { ActivityPicker } from "../src/features/scouting/match/components/activity-picker";
import { PostFields } from "../src/features/scouting/match/components/post";
import { IssueSheet } from "../src/features/scouting/match/components/issues";
import { PitCapabilities } from "../src/features/pit/components/fields";
import { blankPit, preparePit } from "../src/features/pit/model";
import {
  QueueNotice,
  SyncProvider,
} from "../src/features/offline/sync-provider";
import type { QueueRecord } from "../src/features/offline/model";
import {
  activity,
  addObservedIssue,
  advance,
  freshDraft,
  fuel,
  type MatchDraft,
} from "../src/features/scouting/match/model";
import type { RebuiltPitData } from "../src/games/2026-rebuilt/pit-schema";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function newDraft() {
  return freshDraft(
    {
      actorId: id(1),
      assignedScoutId: id(1),
      assignmentId: id(2),
      matchId: id(3),
      teamNumber: 101,
    },
    1000,
    id(4),
  );
}

test("FUEL controls apply +1/+5/+10/+20 and Undo to the displayed phase", () => {
  function Harness() {
    const [draft, setDraft] = useState(newDraft);
    return (
      <FuelCounter
        phase="AUTO"
        total={draft.data.auto.estimated_fuel_scored}
        canUndo={draft.autoUndo.length > 0}
        onTap={(amount) => setDraft((current) => fuel(current, amount))}
      />
    );
  }
  const screen = render(<Harness />);
  const total = screen.getByLabelText("AUTO FUEL total");
  for (const amount of [1, 5, 10, 20]) {
    fireEvent.click(
      screen.getByRole("button", { name: `Add ${amount} estimated AUTO FUEL` }),
    );
  }
  assert.equal(total.textContent, "36");
  fireEvent.click(
    screen.getByRole("button", { name: "Undo AUTO FUEL increment" }),
  );
  assert.equal(total.textContent, "16");
  cleanup();
});

test("phase control advances the capture from Auto through Teleop to Post-match", () => {
  function Harness() {
    const [draft, setDraft] = useState(() => {
      const d = newDraft();
      d.data.auto.execution_result = "successful";
      return d;
    });
    return (
      <div data-phase={draft.phase}>
        {draft.phase !== "post" ? (
          <PhaseAdvance
            phase={draft.phase}
            onAdvance={() =>
              setDraft((d) => advance(d, d.phase === "auto" ? 2000 : 142000))
            }
          />
        ) : (
          <PostFields draft={draft} change={setDraft} dns={() => {}} />
        )}
      </div>
    );
  }
  const screen = render(<Harness />);
  assert.equal(
    screen.container.firstElementChild?.getAttribute("data-phase"),
    "auto",
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue to Teleop" }));
  assert.equal(
    screen.container.firstElementChild?.getAttribute("data-phase"),
    "teleop",
  );
  fireEvent.click(screen.getByRole("button", { name: "Finish Teleop" }));
  assert.equal(
    screen.container.firstElementChild?.getAttribute("data-phase"),
    "post",
  );
  assert.ok(screen.getByLabelText("Primary observed role"));
  cleanup();
});

test("activity buttons stay mutually exclusive and an issue does not change the active state", () => {
  function Harness() {
    const [draft, setDraft] = useState(() => {
      const d = newDraft();
      d.data.auto.execution_result = "successful";
      return advance(d, 2000);
    });
    const [issueOpen, setIssueOpen] = useState(false);
    return (
      <>
        <ActivityPicker
          current={draft.transitions.at(-1)!.state}
          onSelect={(state) =>
            setDraft((d) =>
              activity(d, state, state === "defending" ? 4000 : 3000),
            )
          }
        />
        <button onClick={() => setIssueOpen(true)}>Record issue</button>
        {issueOpen && (
          <IssueSheet
            phase="teleop"
            at={3}
            onClose={() => setIssueOpen(false)}
            onSave={(issue) => setDraft((d) => addObservedIssue(d, issue))}
          />
        )}
        <output aria-label="Issue count">
          {draft.data.issues?.length ?? 0}
        </output>
      </>
    );
  }
  const screen = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /SHUTTLING \/ PASSING/ }));
  fireEvent.click(screen.getByRole("button", { name: /DEFENDING/ }));
  assert.equal(screen.getAllByRole("button", { pressed: true }).length, 1);
  assert.match(
    screen.getByRole("button", { name: /DEFENDING/ }).textContent ?? "",
    /ACTIVE/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Record issue" }));
  fireEvent.click(screen.getByRole("button", { name: "Save issue" }));
  assert.equal(screen.getByLabelText("Issue count").textContent, "1");
  assert.equal(
    screen
      .getByRole("button", { name: /DEFENDING/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  cleanup();
});

test("post-match role, confidence, and defense rating respond to scout choices", () => {
  function Harness() {
    const [draft, setDraft] = useState<MatchDraft>(() => ({
      ...newDraft(),
      phase: "post",
      completedMs: 2000,
    }));
    return <PostFields draft={draft} change={setDraft} dns={() => {}} />;
  }
  const screen = render(<Harness />);
  fireEvent.change(screen.getByLabelText("Primary observed role"), {
    target: { value: "passer_feeder" },
  });
  fireEvent.change(screen.getByLabelText("FUEL estimate confidence"), {
    target: { value: "very_uncertain" },
  });
  assert.equal(
    (screen.getByLabelText("Primary observed role") as HTMLSelectElement).value,
    "passer_feeder",
  );
  assert.equal(
    (screen.getByLabelText("FUEL estimate confidence") as HTMLSelectElement)
      .value,
    "very_uncertain",
  );
  assert.equal(screen.queryByLabelText("Defense effectiveness"), null);
  fireEvent.click(screen.getByLabelText(/Defense was observed despite/));
  assert.ok(screen.getByLabelText("Defense effectiveness"));
  cleanup();
});

test("pit numeric capacity validates and qualitative fallback remains selectable", () => {
  function Harness() {
    const [data, setData] = useState<RebuiltPitData>(blankPit);
    const [capacityMode, setCapacityMode] = useState<
      "approximate_count" | "band"
    >("band");
    const [numeric, setNumeric] = useState("");
    return (
      <>
        <PitCapabilities
          data={data}
          change={setData}
          capacityMode={capacityMode}
          setCapacityMode={setCapacityMode}
          numeric={numeric}
          setNumeric={setNumeric}
        />
        <button
          onClick={() => {
            try {
              const result = preparePit(data, capacityMode, numeric);
              document.querySelector("#pit-result")!.textContent =
                JSON.stringify(result.fuel_capacity);
            } catch {
              document.querySelector("#pit-result")!.textContent = "invalid";
            }
          }}
        >
          Validate pit
        </button>
        <output aria-label="Numeric state">{numeric}</output>
        <output id="pit-result" />
      </>
    );
  }
  const screen = render(<Harness />);
  fireEvent.change(screen.getByLabelText("Approximate maximum FUEL capacity"), {
    target: { value: "approximate_count" },
  });
  fireEvent.input(screen.getByLabelText("Approximate number (not exact)"), {
    target: { value: "42" },
  });
  assert.equal(
    (
      screen.getByLabelText(
        "Approximate number (not exact)",
      ) as HTMLInputElement
    ).value,
    "42",
  );
  assert.equal(screen.getByLabelText("Numeric state").textContent, "42");
  fireEvent.click(screen.getByRole("button", { name: "Validate pit" }));
  assert.match(
    screen.getByText(/"amount":42/).textContent ?? "",
    /approximate_count/,
  );
  fireEvent.input(screen.getByLabelText("Approximate number (not exact)"), {
    target: { value: "10001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate pit" }));
  assert.equal(screen.getByText("invalid").textContent, "invalid");
  fireEvent.change(screen.getByLabelText("Approximate maximum FUEL capacity"), {
    target: { value: "band" },
  });
  fireEvent.change(screen.getByLabelText("Fallback capacity"), {
    target: { value: "medium" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate pit" }));
  assert.match(screen.getByText(/"band":"medium"/).textContent ?? "", /band/);
  cleanup();
});

test("offline queue visibly distinguishes pending, conflict and confirmed states", () => {
  const record: QueueRecord = {
    client_submission_id: id(10),
    actorId: id(1),
    type: "match",
    eventId: id(11),
    eventKey: "2026synthetic",
    teamNumber: 101,
    assignmentId: id(12),
    matchId: id(13),
    draftKey: "synthetic-draft",
    payload: null,
    created_at: 0,
    updated_at: 0,
    state: "pending",
    retryCount: 0,
    lastError: null,
    failureKind: null,
    nextAttemptAt: 0,
    lease: null,
  };
  const view = (row: QueueRecord) =>
    renderToStaticMarkup(
      <SyncProvider actorId={null}>
        <QueueNotice record={row} />
      </SyncProvider>,
    );
  assert.match(view(record), /Saved on this device — waiting to sync/);
  assert.match(view(record), /Retry sync/);
  const conflict = view({ ...record, state: "error", failureKind: "conflict" });
  assert.match(conflict, /Sync error — device copy preserved/);
  assert.doesNotMatch(conflict, /Retry sync/);
  assert.match(conflict, /Export for review/);
  const synced = view({ ...record, state: "synced" });
  assert.match(synced, /Synced — server confirmed/);
  assert.doesNotMatch(synced, /Export for review/);
});
