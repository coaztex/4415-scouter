"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { roleLabels } from "@/features/teams/directory-model";
import {
  scoringMechanisms,
  scoringMechanismLabels,
  type ScoringMechanism,
} from "@/games/2026-rebuilt/pit-options";
import {
  correlatedWarnings,
  filterByMechanisms,
  manualOrder,
  metrics,
  moveTeam,
  profileIds,
  profileLabels,
  profileMetrics,
  scoreTeams,
  stateSchema,
  type MetricId,
  type ProfileId,
  type PicklistState,
} from "../model";
import {
  chooseWeightPreset,
  editPresetWeight,
  manualPresetEditor,
  undoPresetWeightEdit,
  weightPresets,
  type PresetEditor,
} from "../presets";
import { teamEvidence } from "../snapshot";
import { createSnapshot, savePicklist } from "../server/actions";
import type { getPicklist } from "../server/queries";
import { TeamEntry } from "./team-entry";
type Data = Awaited<ReturnType<typeof getPicklist>>;
const field = "min-h-11 rounded-control border border-border bg-surface px-3";
export function PicklistWorkspace({ data }: { data: Data }) {
  const frozen = data.snapshot;
  const [state, setState] = useState<PicklistState>(
    frozen?.state ?? data.state,
  );
  const [baseline, setBaseline] = useState(JSON.stringify(data.state));
  const [revision, setRevision] = useState(data.revision);
  const [profile, setProfile] = useState<ProfileId>(
    frozen?.evidence.selectedProfile ?? "offense",
  );
  const [presetEditors, setPresetEditors] = useState<
    Record<ProfileId, PresetEditor>
  >({
    offense: manualPresetEditor(),
    support: manualPresetEditor(),
    defense: manualPresetEditor(),
    reliability: manualPresetEditor(),
    auto: manualPresetEditor(),
    complement: manualPresetEditor(),
  });
  const [view, setView] = useState<"computed" | "manual">("computed");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const [mechanismFilter, setMechanismFilter] = useState<ScoringMechanism[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const readOnly = !!frozen || data.event.status !== "active";
  const dirty = !frozen && JSON.stringify(state) !== baseline;
  const presetEditor = presetEditors[profile];
  const activePreset = weightPresets[profile].find(
    (preset) => preset.id === presetEditor.selected,
  );
  const undoPreset = weightPresets[profile].find(
    (preset) => preset.id === presetEditor.undoPreset,
  );
  const candidates = useMemo(
    () => data.teams.filter((t) => t.teamNumber !== data.ownTeamNumber),
    [data.teams, data.ownTeamNumber],
  );
  const evidence = useMemo(
    () => frozen?.evidence.teams ?? candidates.map(teamEvidence),
    [frozen, candidates],
  );
  const scores = useMemo(
    () =>
      frozen?.evidence.scores[profile] ??
      scoreTeams(
        candidates,
        state.profiles[profile],
        profile !== "complement" || !!state.strategy.needs.trim(),
      ),
    [frozen, profile, candidates, state],
  );
  const scoreMap = new Map(scores.map((s) => [s.teamNumber, s]));
  const own = data.teams.find((t) => t.teamNumber === data.ownTeamNumber);
  const order = manualOrder(
    evidence.map((t) => t.teamNumber),
    state.manualOrder,
  );
  const displayed = filterByMechanisms(evidence, mechanismFilter)
    .filter((t) => {
      const c = state.controls[t.teamNumber];
      return (
        (!favoritesOnly || c?.favorite) &&
        (showExcluded || !c?.excluded) &&
        `${t.teamNumber} ${t.nickname ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (view === "manual")
        return order.indexOf(a.teamNumber) - order.indexOf(b.teamNumber);
      const av = scoreMap.get(a.teamNumber)?.score,
        bv = scoreMap.get(b.teamNumber)?.score;
      return av == null && bv == null
        ? a.teamNumber - b.teamNumber
        : av == null
          ? 1
          : bv == null
            ? -1
            : bv - av || a.teamNumber - b.teamNumber;
    });
  async function save() {
    const parsed = stateSchema.safeParse(state);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Check the configuration.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await savePicklist({
        eventKey: data.event.tba_key,
        revision,
        state: parsed.data,
      });
      if (result.ok) {
        setState(parsed.data);
        setBaseline(JSON.stringify(parsed.data));
        setRevision(result.revision);
        setMessage("Picklist saved.");
      } else setMessage(result.message);
    } catch {
      setMessage(
        "Could not reach the server. Your draft is preserved; try saving again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function snapshot() {
    setBusy(true);
    setMessage("");
    try {
      const result = await createSnapshot({
        eventKey: data.event.tba_key,
        revision,
        name: snapshotName,
        profile,
      });
      if (result.ok)
        router.push(
          `/events/${data.event.tba_key}/picklist?snapshot=${result.id}`,
        );
      else setMessage(result.message);
    } catch {
      setMessage(
        "Snapshot confirmation unavailable. Reload to check whether it was created before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  function updateProfile(key: "minSamples" | "minCoverage", value: number) {
    setState({
      ...state,
      profiles: {
        ...state.profiles,
        [profile]: { ...state.profiles[profile], [key]: value },
      },
    });
  }
  function choosePreset(choice: string) {
    const next = chooseWeightPreset(
      profile,
      choice,
      state.profiles[profile].weights,
    );
    setState((current) => ({
      ...current,
      profiles: {
        ...current.profiles,
        [profile]: { ...current.profiles[profile], weights: next.weights },
      },
    }));
    setPresetEditors((current) => ({ ...current, [profile]: next.editor }));
  }
  function changeWeight(metric: MetricId, value: number) {
    const next = editPresetWeight(
      profile,
      metric,
      value,
      state.profiles[profile].weights,
      presetEditor,
    );
    setState((current) => ({
      ...current,
      profiles: {
        ...current.profiles,
        [profile]: { ...current.profiles[profile], weights: next.weights },
      },
    }));
    setPresetEditors((current) => ({ ...current, [profile]: next.editor }));
  }
  function undoWeightChanges() {
    const next = undoPresetWeightEdit(profile, presetEditor);
    setState((current) => ({
      ...current,
      profiles: {
        ...current.profiles,
        [profile]: { ...current.profiles[profile], weights: next.weights },
      },
    }));
    setPresetEditors((current) => ({ ...current, [profile]: next.editor }));
  }
  return (
    <div className="space-y-5 pb-20">
      {dirty && !readOnly && (
        <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-card border border-accent bg-surface p-3 shadow-lg">
          <span className="whitespace-nowrap text-sm font-bold">
            Unsaved picklist
          </span>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
      {frozen && (
        <div className="rounded-card border border-accent bg-accent-soft p-4">
          <h2 className="text-xl font-bold">Snapshot: {frozen.name}</h2>
          <p className="text-sm">
            Captured {frozen.evidence.capturedAt} · revision {frozen.revision} ·
            formula v{frozen.evidence.formulaVersion}. Scores, evidence and
            order are frozen. Match links open the current source record.
          </p>
          <Link
            className="inline-block min-h-11 py-3 font-bold text-accent underline"
            href={`/events/${data.event.tba_key}/picklist`}
          >
            Return to live picklist
          </Link>
        </div>
      )}
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 font-bold">
            Ranking profile
            <select
              className={field}
              value={profile}
              onChange={(e) => setProfile(e.target.value as ProfileId)}
            >
              {profileIds.map((p) => (
                <option key={p} value={p}>
                  {profileLabels[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-bold">
            Order
            <select
              className={field}
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
            >
              <option value="computed">Computed profile score</option>
              <option value="manual">Our manual pick order</option>
            </select>
          </label>
          {!readOnly && (
            <Button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
            >
              {busy ? "Working…" : "Save picklist"}
            </Button>
          )}
          {!frozen && (
            <span className="text-sm font-bold">
              {dirty ? "Unsaved changes" : `Saved revision ${revision}`}
            </span>
          )}
          <a
            href="#picklist-snapshots"
            className="min-h-11 py-3 text-sm font-bold text-accent underline"
          >
            Snapshots ({data.snapshots.length})
          </a>
        </div>
        <p className="mt-3 text-sm">
          Manual order and favorites do not change scores. Missing evidence
          never counts as zero.
          {(frozen ? frozen.evidence.ownTeamNumber : data.ownTeamNumber) ===
            null && " Our team number is not configured."}
        </p>
        <details className="mt-2 text-sm">
          <summary className="min-h-12 cursor-pointer py-3 font-bold text-accent">
            Score policy and enabled inputs
          </summary>
          <p>
            Scores compare this profile’s evidence. Our robot is excluded when
            configured; exclusions do not change the percentile comparison
            group.
          </p>
          <p className="mt-2">
            <b>Policy:</b> at least {state.profiles[profile].minSamples} samples
            per scouting metric; at least{" "}
            {Math.round(state.profiles[profile].minCoverage * 100)}% of enabled
            weight must have usable data. Missing inputs are omitted and
            available weights are rescaled. No usable data means unranked, never
            zero.
          </p>
          <p className="mt-2">
            <b>Enabled inputs:</b>{" "}
            {metrics
              .filter((m) => (state.profiles[profile].weights[m.id] ?? 0) > 0)
              .map(
                (m) =>
                  `${m.label} · ${m.source} · weight ${state.profiles[profile].weights[m.id]}`,
              )
              .join("; ") || "None"}
            .
          </p>
        </details>
        {correlatedWarnings(state.profiles[profile]).map((w) => (
          <p key={w} className="mt-2 text-sm font-bold text-warning">
            {w}
          </p>
        ))}
        {message && (
          <p role="status" className="mt-3 font-bold">
            {message}
          </p>
        )}
        {message.includes("Reload") && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 min-h-11 text-accent underline"
          >
            Discard draft and reload latest
          </button>
        )}
        {data.event.status !== "active" && !frozen && (
          <p className="mt-3 font-bold">Archived event · read only</p>
        )}
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-3 font-bold text-accent">
            Edit weights & sample policy · {profileLabels[profile]}
          </summary>
          <fieldset disabled={readOnly || busy} className="space-y-4">
            <div className="rounded-card border border-border bg-background p-3">
              <label className="grid gap-1 text-sm font-bold sm:max-w-sm">
                Weight scenario
                <select
                  aria-label={`Weight scenario for ${profileLabels[profile]}`}
                  className={field}
                  value={presetEditor.selected}
                  onChange={(e) => choosePreset(e.target.value)}
                >
                  <option value="manual">Manual weights</option>
                  {weightPresets[profile].map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-sm">
                {activePreset?.purpose ??
                  "Edit the weights below to match your strategy."}
              </p>
              <p className="mt-1 text-xs text-muted">
                Presets replace this profile’s weights with visible starting
                ratios. Sample rules stay as set. The saved weights remain when
                the selector starts in Manual on a new visit.
              </p>
              {undoPreset && (
                <button
                  type="button"
                  onClick={undoWeightChanges}
                  className="mt-2 min-h-11 font-bold text-accent underline"
                >
                  Undo manual changes · restore {undoPreset.title}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="grid gap-1 text-sm">
                Minimum scouting samples
                <input
                  aria-label="Minimum scouting samples"
                  type="number"
                  min={1}
                  max={20}
                  value={state.profiles[profile].minSamples}
                  onChange={(e) =>
                    updateProfile("minSamples", Number(e.target.value))
                  }
                  className={`${field} w-28`}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Minimum weight coverage (%)
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={Math.round(state.profiles[profile].minCoverage * 100)}
                  onChange={(e) =>
                    updateProfile("minCoverage", Number(e.target.value) / 100)
                  }
                  className={`${field} w-28`}
                />
              </label>
            </div>
            <p className="text-sm text-muted">
              Weights are relative, 0–100. Set 0 to disable. Percentiles use
              eligible values from this event; ties share a percentile and a
              single/equal cohort is neutral at 50. External sample sizes are
              unavailable and the scouting minimum does not apply to them.
            </p>
            {metrics
              .filter((m) => profileMetrics[profile].includes(m.id))
              .map((m) => (
                <label
                  key={m.id}
                  className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_100px]"
                >
                  <span>
                    <b>{m.label}</b>{" "}
                    <span className="text-sm text-muted">· {m.source}</span>
                    <span className="block text-sm text-muted">
                      {m.description}
                    </span>
                  </span>
                  <input
                    aria-label={`Weight: ${m.label}`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={state.profiles[profile].weights[m.id] ?? 0}
                    onChange={(e) => changeWeight(m.id, Number(e.target.value))}
                    className={`${field} w-24`}
                  />
                </label>
              ))}
          </fieldset>
        </details>
      </div>
      <details
        open={profile === "complement"}
        className="rounded-card border border-border bg-surface p-4"
      >
        <summary className="min-h-11 cursor-pointer font-bold">
          Our robot & event needs
        </summary>
        <p className="text-sm">
          Our team:{" "}
          {frozen
            ? (frozen.evidence.ownTeamNumber ?? "not configured")
            : (data.ownTeamNumber ?? "not configured")}
          . Enter strengths and needs from your strategy discussion. Complement
          uses only the explicit metric weights you set above; it starts with
          all weights disabled.
        </p>
        {!frozen && own && (
          <p className="mt-2 text-sm">
            Observed role sample n={own.scouting.roles.sampleSize}:{" "}
            {Object.entries(own.scouting.roles.counts)
              .filter(([, n]) => n > 0)
              .map(
                ([r, n]) => `${roleLabels[r as keyof typeof roleLabels]} ${n}`,
              )
              .join(" · ") || "No observations"}
            .{" "}
            <Link
              className="text-accent underline"
              href={`/events/${data.event.tba_key}/teams/${own.teamNumber}`}
            >
              Our robot’s evidence
            </Link>
          </p>
        )}
        <fieldset
          disabled={readOnly || busy}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <label className="grid gap-1 text-sm font-bold">
            Configured strengths
            <textarea
              maxLength={500}
              rows={3}
              value={state.strategy.strengths}
              onChange={(e) =>
                setState({
                  ...state,
                  strategy: { ...state.strategy, strengths: e.target.value },
                })
              }
              className="rounded-control border border-border p-3 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Alliance needs (required for Complement)
            <textarea
              maxLength={500}
              rows={3}
              value={state.strategy.needs}
              onChange={(e) =>
                setState({
                  ...state,
                  strategy: { ...state.strategy, needs: e.target.value },
                })
              }
              className="rounded-control border border-border p-3 font-normal"
              placeholder="Describe the role or capability we need, then set its metric weights."
            />
          </label>
        </fieldset>
      </details>
      <div className="flex flex-wrap items-center gap-4">
        <label className="grid gap-1 text-sm">
          Find a team
          <input
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
          />
          Favorites only
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showExcluded}
            onChange={(e) => setShowExcluded(e.target.checked)}
          />
          Show excluded teams
        </label>
        <span className="text-sm">{displayed.length} teams</span>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2 text-sm">
        <legend className="mb-1 font-bold">
          Primary scoring mechanism · pit report
        </legend>
        <button
          type="button"
          aria-pressed={mechanismFilter.length === 0}
          onClick={() => setMechanismFilter([])}
          className={`min-h-11 rounded-control border px-3 font-bold ${mechanismFilter.length === 0 ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
        >
          All
        </button>
        {scoringMechanisms.map((mechanism) => (
          <label
            key={mechanism}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 ${mechanismFilter.includes(mechanism) ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
          >
            <input
              type="checkbox"
              className="size-5 accent-accent"
              checked={mechanismFilter.includes(mechanism)}
              onChange={(e) =>
                setMechanismFilter((current) =>
                  e.target.checked
                    ? [...current, mechanism]
                    : current.filter((item) => item !== mechanism),
                )
              }
            />
            {scoringMechanismLabels[mechanism]}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted">
        This filter only changes displayed teams. Scores still compare the full
        event field; Unknown includes teams without a reported mechanism.
      </p>
      {view === "manual" && (
        <p className="text-sm">
          Manual positions include all candidates, including hidden/excluded
          teams. A new team is appended in team-number order. Changing weights
          never changes this order.
        </p>
      )}
      <div className="space-y-3">
        {displayed.map((team) => (
          <TeamEntry
            key={team.teamNumber}
            team={team}
            eventKey={data.event.tba_key}
            score={scoreMap.get(team.teamNumber)!}
            control={
              state.controls[team.teamNumber] ?? {
                favorite: false,
                excluded: false,
                note: "",
              }
            }
            readOnly={readOnly || busy}
            onControl={(control) =>
              setState({
                ...state,
                controls: { ...state.controls, [team.teamNumber]: control },
              })
            }
            position={
              view === "manual" ? order.indexOf(team.teamNumber) : undefined
            }
            total={order.length}
            onMove={(target) =>
              setState({
                ...state,
                manualOrder: moveTeam(order, team.teamNumber, target),
              })
            }
          />
        ))}
      </div>
      {!displayed.length && (
        <p className="rounded-card border border-border bg-surface p-5">
          No candidate teams match these filters.
        </p>
      )}
      <section
        id="picklist-snapshots"
        className="rounded-card border border-border bg-surface p-4"
      >
        <h2 className="text-xl font-bold">Named snapshots</h2>
        <p className="mt-2 text-sm">
          A snapshot preserves saved preferences, team controls, manual order,
          all six profiles’ contributions and evidence. Save your changes first.
          Existing snapshots cannot be overwritten.
        </p>
        {!readOnly && (
          <form
            className="my-3 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void snapshot();
            }}
          >
            <label className="grid gap-1 text-sm">
              Snapshot name
              <input
                required
                maxLength={80}
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                className={field}
              />
            </label>
            <Button
              type="submit"
              disabled={busy || dirty || !snapshotName.trim()}
            >
              Create snapshot
            </Button>
          </form>
        )}
        <ul className="mt-3 space-y-2">
          {data.snapshots.map((s) => (
            <li key={s.id}>
              <InteractiveCard
                className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2"
                href={`/events/${data.event.tba_key}/picklist?snapshot=${s.id}`}
              >
                <span className="font-semibold">{s.name}</span>
                <span className="text-xs text-muted">
                  {s.created_at} · revision {s.revision}
                </span>
              </InteractiveCard>
            </li>
          ))}
        </ul>
        {!data.snapshots.length && (
          <p className="mt-2 text-sm text-muted">No snapshots yet.</p>
        )}
      </section>
    </div>
  );
}
