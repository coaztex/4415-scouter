import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  LARGE_FIXTURE_EVENT_KEY,
  LARGE_FIXTURE_MARKER,
  LARGE_FIXTURE_SCOUT_COUNT,
  LARGE_FIXTURE_TEAM_COUNT,
  LARGE_FIXTURE_TEAM_START,
  makeLargeEvent,
} from "./fixtures/large-event";

type LocalStatus = {
  API_URL: string;
  DB_URL: string;
  SERVICE_ROLE_KEY: string;
  PUBLISHABLE_KEY: string;
};
function loopback(value: string) {
  const url = new URL(value);
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
}
export function assertLocalStatus(status: LocalStatus) {
  if (
    !status.API_URL ||
    !status.DB_URL ||
    !status.SERVICE_ROLE_KEY ||
    !status.PUBLISHABLE_KEY ||
    !loopback(status.API_URL) ||
    !loopback(status.DB_URL) ||
    new URL(status.DB_URL).username !== "postgres"
  )
    throw new Error(
      "Refusing fixture operation: local Supabase API and postgres database are required.",
    );
  return status;
}
export function localStatus(): LocalStatus {
  const cli = resolve("node_modules/supabase/dist/supabase.js");
  const output = execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return assertLocalStatus(JSON.parse(output) as LocalStatus);
}

const roles = [
  {
    label: "admin",
    role: "admin",
    username: "synthetic_admin",
    display: "Synthetic Admin",
  },
  {
    label: "strategy",
    role: "strategy",
    username: "synthetic_strategy",
    display: "Synthetic Strategy",
  },
  ...Array.from({ length: LARGE_FIXTURE_SCOUT_COUNT }, (_, i) => ({
    label: `scout${String(i + 1).padStart(2, "0")}`,
    role: "scout",
    username: `synthetic_scout${String(i + 1).padStart(2, "0")}`,
    display: `Synthetic Scout ${i + 1}`,
  })),
] as const;
const email = (label: string) =>
  `frc26-${LARGE_FIXTURE_MARKER}-${label}@example.test`;
const password = "SyntheticLocalOnly2026!";
function createLocalClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type AdminApi = ReturnType<typeof createLocalClient>;

async function users(api: AdminApi) {
  const known = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await api.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    for (const user of data.users) {
      const fixtureLabel = roles.find(
        (role) => email(role.label) === user.email,
      );
      if (!fixtureLabel) continue;
      if (user.app_metadata?.fixture !== LARGE_FIXTURE_MARKER)
        throw new Error(`Local Auth email collision: ${user.email}`);
      known.set(fixtureLabel.label, user.id);
    }
    if (data.users.length < 1000) break;
  }
  for (const role of roles) {
    if (known.has(role.label)) continue;
    const created = await api.auth.admin.createUser({
      email: email(role.label),
      password,
      email_confirm: true,
      app_metadata: { fixture: LARGE_FIXTURE_MARKER },
    });
    if (created.error || !created.data.user)
      throw new Error(
        `Could not create local fixture ${role.label}: ${created.error?.message ?? "missing user"}`,
      );
    known.set(role.label, created.data.user.id);
  }
  return known;
}

const columns = {
  teams: [
    "team_number",
    "tba_team_key",
    "nickname",
    "name",
    "city",
    "state",
    "country",
    "rookie_year",
    "source_metadata",
  ],
  events: [
    "id",
    "tba_key",
    "year",
    "name",
    "short_name",
    "city",
    "state",
    "country",
    "start_date",
    "end_date",
    "status",
    "game_slug",
    "timezone",
    "timezone_source",
    "our_team_number",
    "last_tba_sync_at",
    "last_statbotics_sync_at",
    "source_metadata",
    "created_by",
  ],
  event_teams: [
    "event_id",
    "team_number",
    "pit_status",
    "pit_claimed_by",
    "pit_claimed_at",
  ],
  matches: [
    "id",
    "event_id",
    "tba_match_key",
    "comp_level",
    "set_number",
    "match_number",
    "scheduled_time",
    "predicted_time",
    "actual_time",
    "winning_alliance",
    "result_metadata",
    "raw_tba_payload",
  ],
  match_teams: ["match_id", "event_id", "team_number", "alliance", "station"],
  scouting_assignments: [
    "id",
    "event_id",
    "match_id",
    "break_match_id",
    "team_number",
    "scout_user_id",
    "assignment_type",
    "status",
    "sequence",
  ],
  match_scouting_submissions: [
    "id",
    "client_submission_id",
    "event_id",
    "match_id",
    "team_number",
    "assignment_id",
    "scout_user_id",
    "submitted_by_user_id",
    "game_slug",
    "schema_version",
    "game_data",
    "issues",
    "note",
    "status",
    "started_at",
    "completed_at",
  ],
  pit_scouting_submissions: [
    "id",
    "client_submission_id",
    "event_id",
    "team_number",
    "scout_user_id",
    "game_slug",
    "schema_version",
    "game_data",
    "status",
    "started_at",
    "completed_at",
  ],
  external_team_metrics: [
    "event_id",
    "team_number",
    "source",
    "metric_version",
    "opr",
    "dpr",
    "ccwm",
    "epa_total",
    "epa_auto",
    "epa_teleop",
    "epa_endgame",
    "payload",
  ],
  event_rankings: [
    "event_id",
    "team_number",
    "rank",
    "wins",
    "losses",
    "ties",
    "ranking_score",
  ],
  match_prep_notes: ["match_id", "event_id", "note", "updated_by"],
} as const;
type Table = keyof typeof columns;
async function insert(
  db: Client,
  table: Table,
  rows: readonly Record<string, unknown>[],
) {
  if (!rows.length) return;
  const list = columns[table].join(",");
  await db.query(
    `insert into public.${table} (${list}) select ${list} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,
    [JSON.stringify(rows)],
  );
}
async function markedEvent(db: Client) {
  const result = await db.query<{
    id: string;
    source_metadata: { fixture?: string; seed?: number };
  }>("select id,source_metadata from public.events where tba_key=$1", [
    LARGE_FIXTURE_EVENT_KEY,
  ]);
  const row = result.rows[0];
  if (row && row.source_metadata?.fixture !== LARGE_FIXTURE_MARKER)
    throw new Error(
      "Fixture event key is occupied by unmarked data; refusing to change it.",
    );
  return row ?? null;
}

async function avatars(
  api: AdminApi,
  db: Client,
  fixture: ReturnType<typeof makeLargeEvent>,
) {
  for (const teamNumber of fixture.avatarTeams) {
    const color = `#${createHash("sha256").update(String(teamNumber)).digest("hex").slice(0, 6)}`;
    const webp = await sharp({
      create: { width: 64, height: 64, channels: 4, background: color },
    })
      .webp({ quality: 70 })
      .toBuffer();
    const hash = createHash("sha256").update(webp).digest("hex");
    const path = `${fixture.eventId}/${teamNumber}/${hash}.webp`;
    const upload = await api.storage.from("team-avatars").upload(path, webp, {
      contentType: "image/webp",
      upsert: true,
    });
    if (upload.error)
      throw new Error(`Fixture avatar upload failed: ${upload.error.message}`);
    await db.query(
      "insert into public.team_avatars(event_id,team_number,storage_path,source,provider_key) values($1,$2,$3,'tba',$4) on conflict(event_id,team_number) do update set storage_path=excluded.storage_path,updated_at=now()",
      [fixture.eventId, teamNumber, path, `synthetic-${teamNumber}`],
    );
  }
}

async function seed(db: Client, api: AdminApi, seedValue: number) {
  const fixture = makeLargeEvent(seedValue);
  const existing = await markedEvent(db);
  if (
    existing &&
    (existing.id !== fixture.eventId ||
      existing.source_metadata.seed !== seedValue)
  )
    throw new Error(
      "A different synthetic seed exists. Run reset before choosing a new seed.",
    );
  const ids = await users(api);
  if (!existing) {
    const scout = (index: number) => ids.get(roles[index + 2].label)!;
    await db.query("begin");
    try {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        LARGE_FIXTURE_EVENT_KEY,
      ]);
      for (const role of roles) {
        await db.query(
          "update public.profiles set username=$2,display_name=$3,role=$4,active=true where id=$1",
          [ids.get(role.label), role.username, role.display, role.role],
        );
      }
      const existingTeams = await db.query<{
        team_number: number;
        source_metadata: { fixture?: string };
      }>(
        "select team_number,source_metadata from public.teams where team_number between $1 and $2",
        [
          LARGE_FIXTURE_TEAM_START,
          LARGE_FIXTURE_TEAM_START + LARGE_FIXTURE_TEAM_COUNT - 1,
        ],
      );
      if (
        existingTeams.rows.some(
          (row) => row.source_metadata?.fixture !== LARGE_FIXTURE_MARKER,
        )
      )
        throw new Error("Synthetic team-number range overlaps unmarked data.");
      await insert(
        db,
        "teams",
        fixture.teams.filter(
          (team) =>
            !existingTeams.rows.some(
              (row) => row.team_number === team.team_number,
            ),
        ),
      );
      await insert(db, "events", [
        { ...fixture.event, created_by: ids.get("admin") },
      ]);
      await insert(
        db,
        "event_teams",
        fixture.members.map((member) => ({
          ...member,
          pit_claimed_by:
            member.pit_status === "in_progress"
              ? scout(member.scoutIndex)
              : null,
        })),
      );
      await insert(db, "matches", fixture.matches);
      await insert(db, "match_teams", fixture.stations);
      await insert(
        db,
        "scouting_assignments",
        fixture.assignments.map((a) => ({
          ...a,
          scout_user_id: scout(a.scoutIndex),
        })),
      );
      await insert(
        db,
        "match_scouting_submissions",
        fixture.submissions.map((row) => ({
          ...row,
          scout_user_id: scout(row.scoutIndex),
          submitted_by_user_id: scout(row.scoutIndex),
        })),
      );
      await insert(
        db,
        "pit_scouting_submissions",
        fixture.pitReports.map((row) => ({
          ...row,
          scout_user_id: scout(row.scoutIndex),
        })),
      );
      await insert(db, "external_team_metrics", fixture.external);
      await insert(db, "event_rankings", fixture.rankings);
      const prep = fixture.matches.find(
        (match) => match.key === fixture.prepMatchKey,
      )!;
      await insert(db, "match_prep_notes", [
        {
          match_id: prep.id,
          event_id: fixture.eventId,
          note: "SYNTHETIC fixture: compare our local-only scouting evidence against the next alliance.",
          updated_by: ids.get("strategy"),
        },
      ]);
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  await avatars(api, db, fixture);
  await check(db);
  process.stdout.write(
    `Synthetic event ready: /events/${LARGE_FIXTURE_EVENT_KEY} (seed ${seedValue}).\n`,
  );
  process.stdout.write(
    "Local test logins: synthetic_admin, synthetic_strategy, synthetic_scout01–08; password SyntheticLocalOnly2026!\n",
  );
}

async function reset(db: Client, api: AdminApi) {
  const event = await markedEvent(db);
  if (!event) {
    process.stdout.write(
      "Synthetic event is absent; nothing to reset. Local test accounts are retained.\n",
    );
    return;
  }
  const imageRows = await db.query<{ storage_path: string }>(
    "select storage_path from public.team_avatars where event_id=$1",
    [event.id],
  );
  if (imageRows.rows.length) {
    const removed = await api.storage
      .from("team-avatars")
      .remove(imageRows.rows.map((row) => row.storage_path));
    if (removed.error)
      throw new Error(
        `Could not remove synthetic avatars: ${removed.error.message}`,
      );
  }
  await db.query("begin");
  try {
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      LARGE_FIXTURE_EVENT_KEY,
    ]);
    // Fixture-only maintenance: submitted assignments cannot ordinarily be deleted.
    // The trigger toggle and all deletes are transactional and target this marked event.
    await db.query(
      "alter table public.scouting_assignments disable trigger protect_scouting_assignment",
    );
    for (const table of [
      "scouting_submission_revisions",
      "scouting_submission_reviews",
      "scouting_sync_conflicts",
      "team_incidents",
      "match_prep_notes",
      "team_notes",
      "robot_media",
      "team_avatars",
      "picklist_snapshots",
      "match_scouting_submissions",
      "pit_scouting_submissions",
      "scouting_assignments",
      "match_teams",
      "matches",
      "event_rankings",
      "external_team_metrics",
      "event_sync_state",
      "scouting_coverage_signal",
      "tba_refresh_leases",
      "event_picklists",
      "event_teams",
    ])
      await db.query(`delete from public.${table} where event_id=$1`, [
        event.id,
      ]);
    await db.query(
      "alter table public.scouting_assignments enable trigger protect_scouting_assignment",
    );
    await db.query("delete from public.events where id=$1", [event.id]);
    await db.query(
      "delete from public.teams t where t.team_number between $1 and $2 and t.source_metadata->>'fixture'=$3 and not exists(select 1 from public.event_teams et where et.team_number=t.team_number)",
      [
        LARGE_FIXTURE_TEAM_START,
        LARGE_FIXTURE_TEAM_START + LARGE_FIXTURE_TEAM_COUNT - 1,
        LARGE_FIXTURE_MARKER,
      ],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  process.stdout.write(
    "Synthetic event and its rows removed. Local test accounts retained for the next seed.\n",
  );
}

async function check(db: Client) {
  const event = await markedEvent(db);
  if (!event) throw new Error("Synthetic event is not seeded.");
  const counts = await db.query<{
    teams: string;
    matches: string;
    final_submissions: string;
    scouts: string;
    avatars: string;
    completed_pits: string;
    break_rows: string;
    missed: string;
    qual: string;
    playoff: string;
    finals: string;
    video: string;
    breakdown: string;
  }>(
    `select
    (select count(*) from public.event_teams where event_id=$1) teams,
    (select count(*) from public.matches where event_id=$1) matches,
    (select count(*) from public.match_scouting_submissions where event_id=$1 and status='final') final_submissions,
    (select count(distinct scout_user_id) from public.scouting_assignments where event_id=$1) scouts,
    (select count(*) from public.team_avatars where event_id=$1) avatars,
    (select count(*) from public.event_teams where event_id=$1 and pit_status='completed') completed_pits,
    (select count(*) from public.scouting_assignments where event_id=$1 and assignment_type='break') break_rows,
    (select count(*) from public.scouting_assignments where event_id=$1 and status='missed') missed,
    (select count(*) from public.matches where event_id=$1 and comp_level='qm') qual,
    (select count(*) from public.matches where event_id=$1 and comp_level in ('qf','sf','ef')) playoff,
    (select count(*) from public.matches where event_id=$1 and comp_level='f') finals,
    (select count(*) from public.matches where event_id=$1 and raw_tba_payload->'videos' <> 'null'::jsonb) video,
    (select count(*) from public.matches where event_id=$1 and raw_tba_payload->'score_breakdown' <> 'null'::jsonb) breakdown`,
    [event.id],
  );
  const c = Object.fromEntries(
    Object.entries(counts.rows[0]).map(([key, value]) => [key, Number(value)]),
  );
  if (
    c.teams !== 60 ||
    c.qual !== 72 ||
    c.playoff !== 8 ||
    c.finals !== 3 ||
    c.final_submissions < 290 ||
    c.scouts !== 8 ||
    c.avatars !== 12 ||
    c.break_rows < 100 ||
    c.missed < 4 ||
    c.video < 5 ||
    c.breakdown < 30
  )
    throw new Error(`Synthetic event is incomplete: ${JSON.stringify(c)}`);
  process.stdout.write(`Synthetic fixture verified: ${JSON.stringify(c)}\n`);
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (
    !["seed", "reset", "check"].includes(command ?? "") ||
    flags.some((flag) => !/^--seed=\d+$/.test(flag))
  )
    throw new Error(
      "Usage: npm run fixture:event -- seed [--seed=2026] | reset | check",
    );
  const seedFlag = flags.find((flag) => flag.startsWith("--seed="));
  const seedValue = seedFlag ? Number(seedFlag.slice(7)) : 2026;
  const status = localStatus();
  const db = new Client({ connectionString: status.DB_URL, ssl: false });
  const api = createLocalClient(status.API_URL, status.SERVICE_ROLE_KEY);
  await db.connect();
  try {
    if (command === "seed") await seed(db, api, seedValue);
    else if (command === "reset") await reset(db, api);
    else await check(db);
  } finally {
    await db.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
