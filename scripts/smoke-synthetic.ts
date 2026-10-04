import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  LARGE_FIXTURE_EVENT_KEY,
  LARGE_FIXTURE_MARKER,
} from "./fixtures/large-event";
import { localStatus } from "./synthetic-event";

async function main() {
  const status = localStatus();
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(base.hostname))
    throw new Error("Smoke test only accepts a local Next.js URL.");
  const jar = new Map<string, string>();
  const supabase = createServerClient(status.API_URL, status.PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });
  const signedIn = await supabase.auth.signInWithPassword({
    email: `frc26-${LARGE_FIXTURE_MARKER}-admin@example.test`,
    password: "SyntheticLocalOnly2026!",
  });
  if (signedIn.error) throw signedIn.error;
  const cookie = [...jar]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const match = await service
    .from("matches")
    .select("id")
    .eq("tba_match_key", `${LARGE_FIXTURE_EVENT_KEY}_qm52`)
    .single();
  if (match.error) throw new Error("Synthetic match 52 is unavailable.");
  const assignment = await service
    .from("scouting_assignments")
    .select("id")
    .eq("match_id", match.data.id)
    .eq("assignment_type", "match")
    .eq("status", "assigned")
    .limit(1)
    .single();
  if (assignment.error)
    throw new Error("Synthetic capture assignment is unavailable.");
  const paths = [
    "/events",
    `/events/${LARGE_FIXTURE_EVENT_KEY}`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/schedule`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/matches/${LARGE_FIXTURE_EVENT_KEY}_qm7`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/matches/${LARGE_FIXTURE_EVENT_KEY}_qm52`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/scout/match/${assignment.data.id}`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/teams`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/teams/90001`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/stats`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/picklist`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/match-prep`,
    `/events/${LARGE_FIXTURE_EVENT_KEY}/data-review`,
    "/admin/scheduling",
    `/admin/health?eventKey=${LARGE_FIXTURE_EVENT_KEY}`,
  ];
  for (const path of paths) {
    const started = performance.now();
    const response = await fetch(new URL(path, base), {
      headers: { cookie },
      redirect: "follow",
    });
    const html = await response.text();
    if (
      !response.ok ||
      response.url.includes("/login") ||
      !html.includes("SYNTHETIC")
    )
      throw new Error(
        `${path}: HTTP ${response.status}, landed at ${response.url}, synthetic marker ${html.includes("SYNTHETIC")}`,
      );
    if (
      path.startsWith("/admin/health") &&
      (!html.includes("Competition Readiness") ||
        !html.includes("Open server sync conflicts") ||
        html.includes(status.SERVICE_ROLE_KEY))
    )
      throw new Error(
        "Competition Readiness is incomplete or exposes a credential.",
      );
    process.stdout.write(
      `OK ${path} · ${Math.round(performance.now() - started)} ms\n`,
    );
  }
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
