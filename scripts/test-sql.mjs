import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Own, network-isolated, --rm container only. Never accepts a database URL.
const root = process.cwd();
const name = `frc26-sql-test-${randomUUID().slice(0, 12)}`;
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `docker ${args[0]} failed:\n${result.stderr || result.stdout}`,
    );
  return result.stdout;
}
function sql(path) {
  docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    readFileSync(path, "utf8"),
  );
}

let started = false;
try {
  docker([
    "run",
    "--rm",
    "--detach",
    "--network",
    "none",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "--name",
    name,
    "postgres:17",
  ]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const check = spawnSync(
      "docker",
      ["exec", name, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (check.status === 0) {
      ready = true;
      break;
    }
    spawnSync("docker", ["exec", name, "sleep", "1"]);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  sql(join(root, "tests", "sql", "auth-fixture.sql"));
  for (const file of readdirSync(join(root, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sql(join(root, "supabase", "migrations", file));
  }
  const suites = readdirSync(join(root, "tests", "sql"))
    .filter((f) => f.endsWith(".sql") && f !== "auth-fixture.sql")
    .sort();
  for (const file of suites) {
    sql(join(root, "tests", "sql", file));
    process.stdout.write(`PASS ${file}\n`);
  }
  process.stdout.write(
    `${suites.length} disposable PostgreSQL suites passed.\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  if (started) {
    try {
      docker(["stop", name]);
    } catch (error) {
      process.stderr.write(`Could not stop ${name}: ${error}\n`);
      process.exitCode = 1;
    }
  }
}
