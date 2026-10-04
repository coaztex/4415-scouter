import { createClient } from "@supabase/supabase-js";
import {
  LARGE_FIXTURE_EVENT_KEY,
  LARGE_FIXTURE_MARKER,
} from "./fixtures/large-event";
import { localStatus } from "./synthetic-event";
import { scheduleSnapshotSchema } from "../src/features/scheduling/model";
import { previewSchedule } from "../src/features/scheduling/publication";

async function main() {
  const status = localStatus();
  const db = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await db.auth.signInWithPassword({
    email: `frc26-${LARGE_FIXTURE_MARKER}-admin@example.test`,
    password: "SyntheticLocalOnly2026!",
  });
  if (login.error) throw login.error;
  const event = await db
    .from("events")
    .select("id")
    .eq("tba_key", LARGE_FIXTURE_EVENT_KEY)
    .single();
  if (event.error) throw event.error;
  const eventId = event.data.id;
  async function timed<T>(label: string, action: () => Promise<T>) {
    const start = performance.now();
    const value = await action();
    const elapsed = Math.round(performance.now() - start);
    process.stdout.write(
      `${label}: ${elapsed} ms, ${JSON.stringify(value).length} JSON chars\n`,
    );
    return value;
  }
  const matches = await timed("Matches batch", async () => {
    const result = await db
      .from("matches")
      .select(
        "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,actual_time,winning_alliance,result_metadata",
      )
      .eq("event_id", eventId)
      .order("id")
      .range(0, 499);
    if (result.error) throw result.error;
    return result.data;
  });
  const detail = await timed("Match detail with six stations", async () => {
    const result = await db
      .from("matches")
      .select(
        "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,actual_time,winning_alliance,result_metadata,raw_tba_payload,match_teams(team_number,alliance,station)",
      )
      .eq("event_id", eventId)
      .eq("tba_match_key", `${LARGE_FIXTURE_EVENT_KEY}_qm7`)
      .single();
    if (result.error) throw result.error;
    return result.data;
  });
  await timed("Targeted six-station coverage RPC", async () => {
    const result = await db.rpc("get_match_coverage", {
      target_event: eventId,
      target_match: detail.id,
    });
    if (result.error) throw result.error;
    return result.data;
  });
  await timed("Stations batch", async () => {
    const result = await db
      .from("match_teams")
      .select("match_id,team_number,alliance,station")
      .eq("event_id", eventId)
      .order("match_id")
      .order("team_number")
      .range(0, 499);
    if (result.error) throw result.error;
    return result.data;
  });
  await timed("Coverage RPC", async () => {
    const result = await db.rpc("get_event_match_coverage", {
      target: eventId,
    });
    if (result.error) throw result.error;
    return result.data;
  });
  await timed("Final scouting records batch", async () => {
    const result = await db
      .from("match_scouting_submissions")
      .select("id,match_id,team_number,game_data,completed_at")
      .eq("event_id", eventId)
      .eq("status", "final")
      .eq("schema_version", 2)
      .limit(1000);
    if (result.error) throw result.error;
    return result.data;
  });
  const snapshot = await timed("Scheduling snapshot RPC", async () => {
    const result = await db.rpc("get_schedule_snapshot", { target: eventId });
    if (result.error) throw result.error;
    return scheduleSnapshotSchema.parse(result.data);
  });
  const quals = snapshot.data.matches.filter(
    (match) => match.comp_level === "qm",
  );
  const scouts = snapshot.data.scouts.filter((scout) => scout.role === "scout");
  const start = performance.now();
  const preview = previewSchedule(snapshot, {
    matchIds: quals.map((match) => match.id),
    scoutIds: scouts.map((scout) => scout.id),
    maxConsecutive: 4,
    replaceMode: "replace_editable",
  });
  process.stdout.write(
    `72-match preview CPU: ${Math.round(performance.now() - start)} ms, ${preview.rows.length} rows\n`,
  );
  process.stdout.write(
    `Match rows: ${matches.length}; timings are local diagnostic samples, not production benchmarks.\n`,
  );
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
