// This test only targets the named disposable container. Never run fixtures remotely.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const args = [
  "exec",
  "-i",
  "frc26-scheduling-test",
  "psql",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-At",
];
const sql = (query) =>
  execFileSync("docker", args, { input: query, encoding: "utf8" });
const fixture = readFileSync(
  new URL("./sql/scheduling.sql", import.meta.url),
  "utf8",
).split("-- Local helper")[0];
sql(fixture + "commit;");
const event = "10000000-0000-4000-8000-000000000001";
const scout = "00000000-0000-4000-8000-000000000003";
const lead = "00000000-0000-4000-8000-000000000002";
const match = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const assignment = (n) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identity = (user) =>
  `set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true);`;
sql(
  [1, 2]
    .map(
      (n) =>
        `insert into public.scouting_assignments(id,event_id,match_id,team_number,scout_user_id,sequence) values ('${assignment(n)}','${event}','${match(n)}',1,'${scout}',${n});`,
    )
    .join("\n"),
);
function start(query) {
  const child = spawn("docker", args);
  let output = "",
    markReady;
  const ready = new Promise((resolve) => {
    markReady = resolve;
  });
  const done = new Promise((resolve) => {
    const collect = (data) => {
      output += data;
      if (output.includes("LOCK_HELD")) markReady();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => {
      markReady();
      resolve({ code, output });
    });
  });
  child.stdin.end(query);
  return { ready, done };
}
const version = () =>
  sql(
    `begin; ${identity(lead)} select public.get_schedule_snapshot('${event}')->>'version'; rollback;`,
  )
    .trim()
    .split(/\r?\n/)
    .at(-2);
const save = (n, v) =>
  `select public.save_scouting_schedule('${event}','${v}','${JSON.stringify({ remove_ids: [], rows: [{ id: assignment(n), slot_match_id: match(n), team_number: 1, scout_user_id: "00000000-0000-4000-8000-000000000004", assignment_type: "match", status: "assigned" }] })}');`;
const draft = (n) =>
  `insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,game_slug,schema_version,game_data) values (gen_random_uuid(),'${event}','${match(n)}',1,'${assignment(n)}','${scout}','2026-test',1,'{}');`;
const oldVersion = version();
const scoutFirst = start(
  `begin; ${identity(scout)} ${draft(1)}\n\\echo LOCK_HELD\nselect pg_sleep(1); commit;`,
);
await scoutFirst.ready;
const staleSave = start(
  `begin; ${identity(lead)} ${save(1, oldVersion)} commit;`,
);
assert.equal((await scoutFirst.done).code, 0);
const stale = await staleSave.done;
assert.notEqual(stale.code, 0);
assert.match(stale.output, /preview is stale/);
assert.equal(
  sql(
    `select scout_user_id||':'||status from public.scouting_assignments where id='${assignment(1)}';`,
  ).trim(),
  scout + ":in_progress",
);
const leadFirst = start(
  `begin; ${identity(lead)} ${save(2, version())}\n\\echo LOCK_HELD\nselect pg_sleep(1); commit;`,
);
await leadFirst.ready;
const oldScout = start(`begin; ${identity(scout)} ${draft(2)} commit;`);
assert.equal((await leadFirst.done).code, 0);
const rejected = await oldScout.done;
assert.notEqual(rejected.code, 0);
assert.match(rejected.output, /foreign key constraint/);
assert.equal(
  sql("select count(*) from public.match_scouting_submissions;").trim(),
  "1",
);
console.log(
  "Concurrent draft first: stale save rejected. Schedule save first: outdated draft rejected. No submission detached.",
);
