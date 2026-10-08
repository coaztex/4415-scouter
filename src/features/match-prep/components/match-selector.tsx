import { matchLabel, prepMatchStatus, type PrepMatch } from "../model";

export function MatchSelector({
  eventKey,
  matches,
  selected,
}: {
  eventKey: string;
  matches: readonly PrepMatch[];
  selected: PrepMatch | null;
}) {
  return matches.length ? (
    <form
      method="get"
      action={`/events/${encodeURIComponent(eventKey)}/match-prep`}
      className="flex w-full min-w-0 flex-wrap items-end gap-2 sm:w-auto"
    >
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-bold">
        Select match
        <select
          name="match"
          key={`${eventKey}:${selected?.id ?? "none"}`}
          defaultValue={selected?.tba_match_key ?? ""}
          className="min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3"
          required
        >
          <option value="" disabled>
            Select a match
          </option>
          {(["Qualifications", "Playoffs"] as const).map((group) => {
            const choices = matches.filter(
              (match) =>
                (match.comp_level === "qm") === (group === "Qualifications"),
            );
            return choices.length ? (
              <optgroup key={group} label={group}>
                {choices.map((match) => (
                  <option key={match.id} value={match.tba_match_key}>
                    {matchLabel(match)} · {prepMatchStatus(match)}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </label>
      <button
        type="submit"
        className="min-h-11 rounded-control bg-accent px-4 font-bold text-on-accent"
      >
        Show
      </button>
    </form>
  ) : (
    <p className="text-sm text-muted">
      No matches available. Ask an admin to sync the schedule.
    </p>
  );
}
