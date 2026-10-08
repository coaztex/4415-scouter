import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { isAtLeastRole } from "@/lib/auth/roles";
import { IncidentCard } from "@/features/incidents/components/incident-card";
import { recentReliabilityFlag } from "@/features/incidents/model";
import { deriveActivity } from "@/games/2026-rebuilt/activity";
import {
  formatNumber,
  formatPercent,
  fuelTotal,
  recentScouting,
  roleLabels,
  worthReviewing,
} from "../model";
import { NoteForm } from "./notes";
import { TeamMechanismSummary } from "./mechanism-badge";
import { PitWeight } from "./pit-weight";
import Image from "next/image";
import { removeRobotMedia } from "@/features/robot-media/server/actions";
import type { AwaitedReturn } from "../types";
type Detail = AwaitedReturn<typeof import("../server/queries").getTeamDetail>;
const pretty = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-lg font-bold">{value}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
function Overview({ detail }: { detail: Detail }) {
  const { row } = detail,
    m = row.scouting,
    recent = recentScouting(row),
    pit = detail.latestPit?.parsed;
  return (
    <div className="space-y-5">
      <Card>
        {detail.primaryMedia?.url ? (
          <figure>
            <Image
              unoptimized
              src={detail.primaryMedia.url}
              alt={`Robot for team ${row.teamNumber}`}
              width={900}
              height={650}
              sizes="(max-width: 640px) 100vw, 900px"
              loading="lazy"
              className="max-h-[420px] w-full rounded-control object-contain"
            />
            <figcaption className="mt-2 text-sm text-muted">
              {detail.primaryMedia.source === "pit_upload"
                ? "Pit photo · our scouting"
                : "Team media · The Blue Alliance"}
            </figcaption>
          </figure>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-control bg-background text-muted">
            No robot photo available
          </div>
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Robot profile</h2>
            <p className="text-muted">
              Observed evidence from {m.sampleSize} scouted{" "}
              {m.sampleSize === 1 ? "match" : "matches"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TeamMechanismSummary
              mechanism={row.pitMechanism}
              reported={row.pitReported}
              otherType={row.pitOtherType}
            />
            {worthReviewing(row) && (
              <Badge className="border-warning">Worth reviewing</Badge>
            )}
            {recentReliabilityFlag(
              detail.incidents,
              row.observations
                .slice(-3)
                .map((observation) => observation.matchId),
            ) && (
              <Badge className="border-warning">
                Recent reliability concern
              </Badge>
            )}
          </div>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Most common role"
            value={m.roles.mostCommon ? roleLabels[m.roles.mostCommon] : "—"}
            hint={`Role observations: ${m.roles.sampleSize}`}
          />
          <Metric
            label="Estimated FUEL"
            value={formatNumber(m.fuel.total.median)}
            hint={`Median · mean ${formatNumber(m.fuel.total.mean)} · confident n=${m.fuel.confidentSampleSize} · ${m.fuel.excludedDnfSampleSize} DNF excluded`}
          />
          <Metric
            label="Scoring activity"
            value={formatPercent(m.activity.scoring.share.mean)}
            hint={`${formatNumber(m.activity.scoring.seconds.mean)} sec average when timed`}
          />
          <Metric
            label="Shuttling / passing"
            value={formatPercent(m.activity.shuttling_passing.share.mean)}
            hint={`${formatNumber(m.activity.shuttling_passing.seconds.mean)} sec average when timed`}
          />
          <Metric
            label="Defense tendency"
            value={formatPercent(m.defense.frequency)}
            hint={`${m.defense.defendedMatches} of ${m.defense.sampleSize} known · effectiveness ${m.defense.effectiveness.mostCommon ? pretty(m.defense.effectiveness.mostCommon) : "—"}`}
          />
          <Metric
            label="Auto success"
            value={
              m.auto.execution.sampleSize >= 2
                ? formatPercent(m.auto.successfulRate)
                : "—"
            }
            hint={`${m.auto.execution.sampleSize} observed autos`}
          />
          <Metric
            label="Full-match rate"
            value={formatPercent(m.reliability.fullMatchRate)}
            hint={`n=${m.reliability.sampleSize} · ${m.reliability.counts.DNF} DNF · ${m.reliability.counts.DNS} DNS`}
          />
          <Metric
            label="Driver control (subjective)"
            value={
              m.driverControl.mostCommon
                ? pretty(m.driverControl.mostCommon)
                : "—"
            }
            hint={`${m.driverControl.sampleSize} supporting observations`}
          />
        </dl>
        <div className="mt-5">
          <h3 className="font-bold">Observed role distribution</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Overall · n={m.roles.sampleSize}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(m.roles.counts).map(([role, count]) => (
                  <Badge key={role}>
                    {roleLabels[role as keyof typeof roleLabels]}: {count}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Recent {Math.min(3, recent.roles.sampleSize)} · n=
                {recent.roles.sampleSize}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(recent.roles.counts).map(([role, count]) => (
                  <Badge key={role}>
                    {roleLabels[role as keyof typeof roleLabels]}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
      {pit && (
        <Card>
          <h2 className="text-xl font-bold">Pit-reported capabilities</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Primary scoring mechanism"
              value={pretty(pit.primary_scoring_mechanism)}
              hint={pit.other_shooter_type}
            />
            <Metric label="Drivetrain" value={pretty(pit.drivetrain)} />
            <PitWeight weightLbs={pit.robot_weight_lbs} />
            <Metric
              label="Shoot while moving"
              value={pretty(pit.shoot_while_moving)}
            />
            <Metric
              label="Traversal"
              value={pit.traversal?.map(pretty).join(" + ") ?? "Unknown"}
            />
          </dl>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">External</h2>
          <p className="mb-4 text-sm text-muted">
            Provider estimates and official event metrics.
          </p>
          <dl className="grid grid-cols-2 gap-4">
            <Metric
              label="Event rank"
              value={row.rank?.toString() ?? "—"}
              hint={
                row.rank
                  ? `${row.wins ?? 0}-${row.losses ?? 0}-${row.ties ?? 0}`
                  : undefined
              }
            />
            <Metric
              label="Statbotics EPA"
              value={formatNumber(row.statbotics?.total)}
            />
            <Metric
              label="Auto EPA"
              value={formatNumber(row.statbotics?.auto)}
            />
            <Metric
              label="Teleop EPA"
              value={formatNumber(row.statbotics?.teleop)}
            />
            <Metric label="TBA OPR" value={formatNumber(row.tba?.opr)} />
            <Metric
              label="TBA AUTO FUEL COPR"
              value={formatNumber(row.tba?.components.auto_fuel)}
            />
            <Metric
              label="TBA TELEOP FUEL COPR"
              value={formatNumber(row.tba?.components.teleop_fuel)}
            />
            <Metric
              label="TBA total FUEL COPR"
              value={formatNumber(row.tba?.components.total_fuel)}
            />
          </dl>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Our scouting</h2>
          <p className="mb-4 text-sm text-muted">
            Scouted observations · very-uncertain FUEL excluded.
          </p>
          <dl className="grid grid-cols-2 gap-4">
            <Metric
              label="Median total FUEL"
              value={formatNumber(m.fuel.total.median)}
            />
            <Metric
              label="Mean total FUEL"
              value={formatNumber(m.fuel.total.mean)}
            />
            <Metric
              label="Mean AUTO FUEL"
              value={formatNumber(m.fuel.auto.mean)}
            />
            <Metric
              label="Mean TELEOP FUEL"
              value={formatNumber(m.fuel.teleop.mean)}
            />
            <Metric label="Total scouted" value={String(m.sampleSize)} />
            <Metric
              label="Confident FUEL sample"
              value={String(m.fuel.confidentSampleSize)}
              hint={
                m.fuel.veryUncertainSampleSize
                  ? `${m.fuel.veryUncertainSampleSize} very uncertain excluded`
                  : undefined
              }
            />
          </dl>
        </Card>
      </div>
      <Card>
        <h2 className="text-xl font-bold">Human / external comparison</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Metric
            label="Our mean total FUEL"
            value={formatNumber(m.fuel.total.mean)}
            hint={`confident n=${m.fuel.confidentSampleSize}`}
          />
          <Metric
            label="Our mean TELEOP FUEL"
            value={formatNumber(m.fuel.teleop.mean)}
          />
          <Metric
            label="TBA AUTO FUEL COPR"
            value={formatNumber(row.tba?.components.auto_fuel)}
          />
          <Metric
            label="TBA TELEOP FUEL COPR"
            value={formatNumber(row.tba?.components.teleop_fuel)}
          />
          <Metric
            label="Statbotics EPA"
            value={formatNumber(row.statbotics?.total)}
            hint="Model points estimate"
          />
          <Metric
            label="Statbotics TELEOP EPA"
            value={formatNumber(row.statbotics?.teleop)}
            hint="Model points estimate"
          />
        </div>
        {worthReviewing(row) && (
          <p className="mt-4 rounded-control border border-warning p-3 text-sm">
            <strong>Worth reviewing:</strong> scouted and TBA FUEL estimates
            differ substantially. Check match context and sample sizes.
          </p>
        )}
      </Card>
    </div>
  );
}
function Matches({ detail, eventKey }: { detail: Detail; eventKey: string }) {
  return detail.row.observations.length ? (
    <div className="space-y-3">
      {detail.row.observations.map((match) => {
        const d = match.data,
          a = d.teleop.activity ? deriveActivity(d.teleop.activity) : null;
        const abnormal =
          d.post_match.reliability !== "normal" ||
          d.post_match.fuel_estimate_confidence === "very_uncertain" ||
          (d.issues?.length ?? 0) > 0;
        return (
          <Link
            key={match.id}
            href={`/events/${eventKey}/teams/${detail.row.teamNumber}/matches/${match.id}`}
          >
            <Card
              className={`mb-3 p-5 sm:p-5 ${abnormal ? "border-warning" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">
                    {match.matchKey.split("_").at(-1)?.toUpperCase()}
                  </h3>
                  <p>
                    {roleLabels[d.post_match.observed_role]} ·{" "}
                    {pretty(d.post_match.reliability)}
                  </p>
                </div>
                {abnormal && <Badge>Review context</Badge>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <p>
                  AUTO{" "}
                  <strong>
                    {formatNumber(d.auto.estimated_fuel_scored, 0)}
                  </strong>
                </p>
                <p>
                  TELEOP{" "}
                  <strong>
                    {formatNumber(d.teleop.estimated_fuel_scored, 0)}
                  </strong>
                </p>
                <p>
                  TOTAL <strong>{formatNumber(fuelTotal(d), 0)}</strong>
                </p>
                <p>
                  Confidence{" "}
                  <strong>
                    {pretty(d.post_match.fuel_estimate_confidence)}
                  </strong>
                </p>
                <p>
                  Scoring{" "}
                  <strong>
                    {a ? `${formatNumber(a.seconds.scoring)}s` : "—"}
                  </strong>
                </p>
                <p>
                  Passing{" "}
                  <strong>
                    {a ? `${formatNumber(a.seconds.shuttling_passing)}s` : "—"}
                  </strong>
                </p>
                <p>
                  Defense{" "}
                  <strong>
                    {a
                      ? `${formatNumber(a.seconds.defending)}s`
                      : d.post_match.defense_observed
                        ? "Observed"
                        : "—"}
                  </strong>
                </p>
                <p>
                  Defense effect{" "}
                  <strong>
                    {d.post_match.defense_effectiveness
                      ? pretty(d.post_match.defense_effectiveness)
                      : "—"}
                  </strong>
                </p>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  ) : (
    <p>No readable final scouting records for this team.</p>
  );
}
function Pit({ detail }: { detail: Detail }) {
  const pit = detail.latestPit?.parsed;
  return !pit ? (
    <p>No completed pit report is readable for this team.</p>
  ) : (
    <Card>
      <p className="mb-4 text-sm text-muted">
        Pit-reported / claimed capabilities. Updated{" "}
        {new Date(detail.latestPit!.updated_at).toLocaleString()}.
      </p>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Primary scoring mechanism"
          value={pretty(pit.primary_scoring_mechanism)}
          hint={pit.other_shooter_type}
        />
        <Metric label="Drivetrain" value={pretty(pit.drivetrain)} />
        <PitWeight weightLbs={pit.robot_weight_lbs} />
        <Metric
          label="FUEL capacity"
          value={
            pit.fuel_capacity.kind === "approximate_count"
              ? `About ${pit.fuel_capacity.amount}`
              : pretty(pit.fuel_capacity.band)
          }
        />
        <Metric
          label="Scoring areas"
          value={
            pit.preferred_scoring_areas?.map(pretty).join(", ") ?? "Unknown"
          }
        />
        <Metric
          label="Shoot while moving"
          value={pretty(pit.shoot_while_moving)}
        />
        <Metric
          label="Traversal"
          value={pit.traversal?.map(pretty).join(" + ") ?? "Unknown"}
        />
        <Metric
          label="Climb (lower priority)"
          value={pretty(pit.climbing.capability)}
        />
      </dl>
      <h3 className="mt-5 font-bold">Claimed autonomous routines</h3>
      {pit.autonomous_routines?.length ? (
        <div className="mt-2 space-y-2">
          {pit.autonomous_routines.map((r, i) => (
            <div key={r.id} className="rounded-control bg-background p-3">
              <strong>{r.name ?? `Routine ${i + 1}`}</strong>
              <p>
                {pretty(r.start_side)} start · Scores FUEL:{" "}
                {pretty(r.scores_fuel)} · Collects:{" "}
                {pretty(r.collects_additional_fuel)} · Reliability:{" "}
                {pretty(r.reliability_claim)}
              </p>
              {r.note && <p className="text-sm text-muted">{r.note}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted">No routines recorded.</p>
      )}
      {pit.strategy_note && (
        <>
          <h3 className="mt-5 font-bold">Pit strategy note</h3>
          <p>{pit.strategy_note}</p>
        </>
      )}
    </Card>
  );
}
function Notes({ detail, eventKey }: { detail: Detail; eventKey: string }) {
  return (
    <div className="space-y-5">
      {isAtLeastRole(detail.profile.role, "strategy") && (
        <Card>
          <NoteForm
            eventId={detail.event.id}
            eventKey={eventKey}
            teamNumber={detail.row.teamNumber}
          />
        </Card>
      )}
      <div className="space-y-3">
        {detail.notes.length ? (
          detail.notes.map((note) => (
            <Card key={note.id} className="p-5 sm:p-5">
              <p>{note.note}</p>
              <p className="mt-3 text-sm text-muted">
                {note.author} · {new Date(note.created_at).toLocaleString()}
              </p>
            </Card>
          ))
        ) : (
          <p>No event notes yet.</p>
        )}
      </div>
    </div>
  );
}
function Incidents({ detail, eventKey }: { detail: Detail; eventKey: string }) {
  return detail.incidents.length ? (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Scout observations and separately confirmed causes.
      </p>
      {detail.incidents.map((incident) => (
        <IncidentCard
          key={incident.id}
          incident={incident}
          eventKey={eventKey}
        />
      ))}
    </div>
  ) : (
    <p>No readable notable incidents for this team.</p>
  );
}
function Media({ detail }: { detail: Detail }) {
  return (
    <Card>
      <h2 className="text-xl font-bold">Robot media</h2>
      {detail.media.length ? (
        <div className="mt-3 space-y-3">
          {detail.media.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3"
            >
              <span className="flex items-center gap-3">
                {item.url && (
                  <Image
                    unoptimized
                    src={item.url}
                    alt={`Robot photo for team ${detail.row.teamNumber}`}
                    width={96}
                    height={72}
                    sizes="80px"
                    loading="lazy"
                    className="size-20 rounded-control object-cover"
                  />
                )}
                {item.source === "pit_upload" ? "Pit upload" : "TBA image"} ·{" "}
                {new Date(item.created_at).toLocaleDateString()}
              </span>
              {detail.profile.role === "admin" &&
                item.source === "pit_upload" && (
                  <form action={removeRobotMedia}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      className="min-h-12 rounded-control border border-danger px-3 text-danger"
                      type="submit"
                    >
                      Remove photo
                    </button>
                  </form>
                )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-muted">
          No pit or cached TBA robot image is available.
        </p>
      )}
    </Card>
  );
}
export function TeamDetail({
  detail,
  eventKey,
  initialTab,
}: {
  detail: Detail;
  eventKey: string;
  initialTab?: string;
}) {
  return (
    <Tabs
      label="Team detail"
      initialTab={initialTab}
      items={[
        {
          id: "overview",
          label: "Overview",
          content: <Overview detail={detail} />,
        },
        {
          id: "matches",
          label: `Matches (${detail.row.observations.length})`,
          content: <Matches detail={detail} eventKey={eventKey} />,
        },
        {
          id: "incidents",
          label: `Incidents (${detail.incidents.length})`,
          content: <Incidents detail={detail} eventKey={eventKey} />,
        },
        { id: "pit", label: "Pit", content: <Pit detail={detail} /> },
        {
          id: "notes",
          label: `Notes (${detail.notes.length})`,
          content: <Notes detail={detail} eventKey={eventKey} />,
        },
        { id: "media", label: "Media", content: <Media detail={detail} /> },
      ]}
    />
  );
}
