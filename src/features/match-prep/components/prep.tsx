import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { InteractiveCard } from "@/components/ui/interactive-card";
import type { MatchPrepData } from "@/features/match-prep/server/queries";
import {
  autoEvidence,
  matchLabel,
  prepSummary,
  sharedStartSides,
  prepMatchStatus,
  upcomingMatches,
} from "@/features/match-prep/model";
import { roleLabels } from "@/features/teams/model";
import { PlanForm } from "@/features/match-prep/components/plan-form";
import { eventTime } from "@/features/events/timezone";
import { MatchSelector } from "./match-selector";
import Link from "next/link";
import { boardHref } from "@/features/strategy-board/model";
import {
  drivetrainLabels,
  scoringMechanismLabels,
} from "@/games/2026-rebuilt/pit-options";

export function MatchPrep({
  prep,
  eventKey,
}: {
  prep: MatchPrepData;
  eventKey: string;
}) {
  const ownAlliance = prep.lineup.find(
    (s) => s.team_number === prep.ownTeamNumber,
  )?.alliance;
  const allies = prep.teams.filter((t) => t.station.alliance === ownAlliance);
  const starts = sharedStartSides(
    allies.map((t) => ({
      teamNumber: t.station.team_number,
      sides: autoEvidence(t.pit, t.row?.observations ?? []).sides,
    })),
  );
  return (
    <>
      <PageHeading title="Match Prep" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <MatchSelector
          eventKey={eventKey}
          matches={prep.matches}
          selected={prep.selected}
        />
        {!prep.selected && prep.matches.length > 0 && (
          <p className="text-sm text-muted">
            {upcomingMatches(prep.matches).length
              ? "No upcoming match for our team."
              : "No upcoming matches."}{" "}
            Select a match above.
          </p>
        )}
        {prep.ownTeamNumber === null && (
          <span className="text-sm text-muted">
            Our team is not configured for this event. An admin can set it under
            Events.
          </span>
        )}
      </div>
      {prep.selected && (
        <>
          <Card className="mb-4 !p-4 sm:!p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">
                {matchLabel(prep.selected)}{" "}
                <span className="text-sm font-normal text-muted">
                  {prep.selected.tba_match_key}
                </span>
              </h2>
              <span className="rounded-control border border-border px-3 py-1 text-sm font-bold">
                {prepMatchStatus(prep.selected)}
              </span>
              {ownAlliance && (
                <span className="font-bold">We are {ownAlliance}</span>
              )}
              <Link
                className="inline-flex min-h-11 items-center rounded-control bg-accent px-3 font-bold text-on-accent"
                href={boardHref(eventKey, prep.selected.tba_match_key)}
              >
                Strategy Board
              </Link>
            </div>
            {prep.selected.actual_time ||
            prep.selected.predicted_time ||
            prep.selected.scheduled_time ? (
              <p className="text-sm text-muted">
                {prep.selected.actual_time ? "Played " : "Expected "}
                {eventTime(
                  prep.selected.actual_time ??
                    prep.selected.predicted_time ??
                    prep.selected.scheduled_time,
                  prep.event.timezone,
                )}
              </p>
            ) : null}
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {(["red", "blue"] as const).map((alliance) => (
              <section
                key={alliance}
                aria-label={`${alliance} alliance`}
                className={`rounded-card border border-border border-t-4 bg-surface p-3 sm:p-4 ${alliance === "red" ? "border-t-alliance-red" : "border-t-alliance-blue"}`}
              >
                <h2 className="mb-3 text-xl font-semibold capitalize">
                  {alliance} alliance{" "}
                  {ownAlliance === alliance
                    ? "· with us"
                    : ownAlliance
                      ? "· against us"
                      : ""}
                </h2>
                <div className="space-y-3">
                  {prep.teams
                    .filter((t) => t.station.alliance === alliance)
                    .map(({ station, row, pit }) => {
                      const summary = row ? prepSummary(row) : null;
                      const auto = autoEvidence(pit, row?.observations ?? []);
                      const m = row?.scouting;
                      return (
                        <InteractiveCard
                          key={station.team_number}
                          href={`/events/${encodeURIComponent(eventKey)}/teams/${station.team_number}`}
                          className={`block rounded-control p-3 ${station.team_number === prep.ownTeamNumber ? "match-prep-own-card" : ""}`}
                        >
                          <div className="flex min-h-12 items-center justify-between gap-2 font-semibold text-accent">
                            <span>
                              <span className="mr-2 text-xs text-muted">
                                {station.stationLabel}
                              </span>
                              #{station.team_number} {row?.nickname ?? ""}{" "}
                              {station.team_number === prep.ownTeamNumber
                                ? "· OUR ROBOT"
                                : ""}
                            </span>
                            <span className="shrink-0 text-xs text-muted">
                              Detail ↗
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            <span>
                              Rank <b>{row?.rank ?? "—"}</b>
                            </span>
                            <span>
                              EPA{" "}
                              <b>{row?.statbotics?.total?.toFixed(1) ?? "—"}</b>
                            </span>
                            {row?.tba?.components.total_fuel != null && (
                              <span>
                                TBA FUEL COPR{" "}
                                <b>
                                  {row.tba.components.total_fuel.toFixed(1)}
                                </b>
                              </span>
                            )}
                          </div>
                          <div className="mt-2 space-y-1.5 text-sm">
                            <p
                              className="text-xs text-muted"
                              title="Pit-scouted robot weight excludes battery and bumpers."
                            >
                              <b>Pit:</b>{" "}
                              {pit?.robot_weight_lbs == null
                                ? "Weight unknown"
                                : `${pit.robot_weight_lbs} lb`}{" "}
                              · {drivetrainLabels[pit?.drivetrain ?? "unknown"]}{" "}
                              ·{" "}
                              {
                                scoringMechanismLabels[
                                  pit?.primary_scoring_mechanism ?? "unknown"
                                ]
                              }
                            </p>
                            {pit?.strategy_note && (
                              <p>
                                <b>Pit strategy note:</b> {pit.strategy_note}
                              </p>
                            )}
                            <p>
                              <b>Role:</b>{" "}
                              {summary?.leadRole
                                ? roleLabels[summary.leadRole]
                                : "No observations"}
                              {m?.roles.sampleSize
                                ? ` (n=${m.roles.sampleSize})`
                                : ""}
                              {summary && summary.roles.length > 1 && (
                                <span className="text-muted">
                                  {" "}
                                  · {summary.roles.join(" · ")}
                                </span>
                              )}
                            </p>
                            <p>
                              <b>FUEL:</b>{" "}
                              {m?.fuel.total.median != null
                                ? `${m.fuel.total.median.toFixed(0)} median · n=${m.fuel.total.sampleSize} usable`
                                : "No usable estimate · n=0"}
                              {summary?.recentUncertain ? (
                                <span className="text-warning">
                                  {" "}
                                  · {summary.recentUncertain} recent very
                                  uncertain
                                </span>
                              ) : null}
                            </p>
                            <p>
                              <b>Auto:</b>{" "}
                              {auto.observed
                                ? `${Math.round((100 * auto.successes) / auto.observed)}% observed success (${auto.successes}/${auto.observed})`
                                : "No observed result"}
                              {auto.routines?.length
                                ? ` · ${auto.routines.length} pit-claimed routine${auto.routines.length === 1 ? "" : "s"}`
                                : " · no pit routine info"}
                            </p>
                            <p>
                              <b>Passing:</b>{" "}
                              {m?.activity.shuttling_passing.share.sampleSize
                                ? `${Math.round((m.activity.shuttling_passing.share.mean ?? 0) * 100)}% mean teleop share · n=${m.activity.shuttling_passing.share.sampleSize}`
                                : "No timed sample"}
                            </p>
                            <p>
                              <b>Defense:</b>{" "}
                              {m?.defense.sampleSize
                                ? `${m.defense.defendedMatches}/${m.defense.sampleSize} observed matches`
                                : "No known sample"}
                            </p>
                            <p>
                              <b>Reliability:</b>{" "}
                              {m?.reliability.sampleSize
                                ? `${m.reliability.counts.normal + m.reliability.counts.minor_issue + m.reliability.counts.major_issue}/${m.reliability.sampleSize} full matches`
                                : "No observations"}
                              {summary?.recentIssue && (
                                <strong className="text-danger">
                                  {" "}
                                  · Recent major issue / DNF / DNS
                                </strong>
                              )}
                            </p>
                            {summary?.claims.length ? (
                              <p className="border-t border-border pt-1">
                                <b>Expected:</b> {summary.claims.join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        </InteractiveCard>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
          <Card className="mt-4 !p-4 sm:!p-5">
            <h2 className="text-lg font-bold">
              Auto compatibility{" "}
              {ownAlliance ? `· ${ownAlliance} alliance` : ""}
            </h2>
            <p className="text-sm text-muted">
              Pit-reported routines; success counts are observed. Route paths
              unavailable.
            </p>
            {ownAlliance ? (
              <>
                {starts.length ? (
                  <p className="mt-2 font-bold text-warning">
                    Possible shared start side: {starts.join("; ")}. Confirm
                    routines together.
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1 text-sm">
                  {allies.map(({ station, row, pit }) => {
                    const a = autoEvidence(pit, row?.observations ?? []);
                    return (
                      <li key={station.team_number}>
                        <b>#{station.team_number}:</b> Pit starts{" "}
                        {a.sides.length ? a.sides.join(" / ") : "unknown"};
                        observed success{" "}
                        {a.observed
                          ? `${a.successes}/${a.observed}`
                          : "unknown"}
                        . Pit capability:{" "}
                        {a.routines?.length
                          ? a.routines
                              .map(
                                (routine) =>
                                  `${routine.name || "Routine"} (${routine.start_side} start, FUEL ${routine.scores_fuel}, ${routine.reliability_claim} claimed reliability)`,
                              )
                              .join("; ")
                          : "not reported"}
                        .
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm">
                Set our team number to see ally compatibility.
              </p>
            )}
          </Card>
          <Card className="mt-4 !p-4 sm:!p-5">
            <PlanForm
              key={prep.selected.id}
              eventKey={eventKey}
              matchId={prep.selected.id}
              initial={prep.note?.note ?? ""}
              readOnly={prep.event.status !== "active"}
            />
          </Card>
        </>
      )}
    </>
  );
}
