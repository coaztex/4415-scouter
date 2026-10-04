// Explicit disposable container only. Never connect this fixture to Supabase.
import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";
const args = [
  "exec",
  "-i",
  "frc26-admin-test",
  "psql",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-At",
];
const sql = (query) =>
  execFileSync("docker", args, { input: query, encoding: "utf8" });
sql(`insert into auth.users(id) values ('00000000-0000-0000-0000-000000000040'),('00000000-0000-0000-0000-000000000041');
update public.profiles set active=true,role='admin' where id in ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000041');`);
const remove = (id) =>
  new Promise((resolve) => {
    const p = spawn("docker", args);
    let output = "";
    p.stdout.on("data", (data) => (output += data));
    p.stderr.on("data", (data) => (output += data));
    p.on("close", (code) => resolve({ code, output }));
    p.stdin.end(
      `begin; update public.profiles set active=false where id='${id}'; select pg_sleep(0.3); commit;`,
    );
  });
const results = await Promise.all([
  remove("00000000-0000-0000-0000-000000000040"),
  remove("00000000-0000-0000-0000-000000000041"),
]);
assert.equal(results.filter((result) => result.code === 0).length, 1);
assert.ok(
  results.some((result) => result.output.includes("last_active_admin")),
);
assert.equal(
  sql(
    "select count(*) from public.profiles where active and role='admin';",
  ).trim(),
  "1",
);
console.log(
  "Concurrent removal: exactly one succeeds; last active admin retained.",
);
