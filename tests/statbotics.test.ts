import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTeamEvent } from "../src/lib/statbotics/schemas";
import {
  StatboticsClient,
  StatboticsError,
} from "../src/lib/statbotics/client";
import {
  syncStatboticsForEvent as syncWithRepository,
  type StatboticsRepository,
} from "../src/features/events/server/statbotics-sync";
import { statboticsRepository } from "../src/features/events/server/statbotics-repository";
import { statboticsRetryDelay } from "../src/lib/statbotics/retry";

type TestRepository = Pick<StatboticsRepository, "commit" | "failed"> &
  Partial<StatboticsRepository>;
function syncStatboticsForEvent(
  event: Parameters<typeof syncWithRepository>[0],
  repository: TestRepository,
  client?: StatboticsClient,
) {
  return syncWithRepository(
    event,
    {
      claim: async () => ({ token: "fixture-lease" }),
      release: async () => {},
      cached: async () => ({ count: 0, oldestFetchedAt: null }),
      ...repository,
    },
    client,
  );
}

const event = { id: "synthetic", tba_key: "2026fixture" };
const row = {
  team: 1,
  event: event.tba_key,
  time: 1234,
  epa: {
    total_points: 0,
    breakdown: { auto_points: 0, teleop_points: 12, custom_game_metric: 7 },
  },
  record: { total: { wins: 0 } },
};
test("Statbotics normalizes zero, absent phase data, and evolving source fields", () => {
  const result = normalizeTeamEvent(row);
  assert.equal(result.epa_total, 0);
  assert.equal(result.epa_auto, 0);
  assert.equal(result.epa_teleop, 12);
  assert.equal(result.epa_endgame, null);
  assert.equal(result.source_updated_at, null);
  assert.equal(result.payload.epa?.breakdown?.custom_game_metric, 7);
  assert.equal(
    normalizeTeamEvent({ team: 1, event: event.tba_key }).epa_total,
    null,
  );
  assert.equal(
    normalizeTeamEvent({ ...row, epa: { total_points: { mean: 3 } } })
      .epa_total,
    3,
  );
  assert.equal(
    normalizeTeamEvent({ ...row, updated_at: "2026-09-23T00:00:00Z" })
      .source_updated_at,
    "2026-09-23T00:00:00Z",
  );
  assert.throws(() =>
    normalizeTeamEvent({ ...row, epa: { total_points: "3" } }),
  );
});
test("Statbotics uses one public event request, validates identities and rejects duplicates", async () => {
  const client = new StatboticsClient(async (url, init) => {
    assert.equal(
      String(url),
      "https://api.statbotics.io/v3/team_events?event=2026fixture&limit=1000",
    );
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.ok(init?.signal);
    return Response.json([row]);
  });
  assert.equal((await client.teamEvents(event.tba_key))[0].epa_total, 0);
  for (const rows of [
    [{ ...row, event: "2026wrong" }],
    [row, row],
    [{ ...row, team: -1 }],
  ]) {
    await assert.rejects(
      new StatboticsClient(async () => Response.json(rows)).teamEvents(
        event.tba_key,
      ),
      StatboticsError,
    );
  }
});
test("bounded transient retries and no retries for malformed/permanent responses", async () => {
  for (const [status, expected] of [
    [503, 3],
    [401, 1],
    [404, 1],
  ]) {
    let count = 0;
    const client = new StatboticsClient(
      async () => {
        count++;
        return new Response("untrusted body", { status });
      },
      async () => {},
    );
    await assert.rejects(client.teamEvents(event.tba_key), StatboticsError);
    assert.equal(count, expected);
  }
  let count = 0;
  await assert.rejects(
    new StatboticsClient(async () => {
      count++;
      return Response.json({ error: "unavailable" });
    }).teamEvents(event.tba_key),
  );
  assert.equal(count, 1);
});
test("sync records safe failure without throwing or changing existing metrics; retry can succeed", async () => {
  let committed = 0,
    failed = 0;
  const repository: TestRepository = {
    async commit(_event, _attempt, rows) {
      committed++;
      assert.equal(rows[0].epa_total, 0);
    },
    async failed(_event, _attempt, message) {
      failed++;
      assert.ok(!message.includes("private diagnostics"));
    },
  };
  const bad = new StatboticsClient(
    async () => {
      throw new Error("private diagnostics");
    },
    async () => {},
  );
  assert.equal(
    (await syncStatboticsForEvent(event, repository, bad)).ok,
    false,
  );
  assert.equal(committed, 0);
  assert.equal(failed, 1);
  assert.equal(
    (
      await syncStatboticsForEvent(
        event,
        repository,
        new StatboticsClient(async () => Response.json([row])),
      )
    ).ok,
    true,
  );
  assert.equal(committed, 1);
  assert.equal(
    (
      await syncStatboticsForEvent(
        event,
        {
          async commit() {
            throw Error();
          },
          async failed() {
            throw Error();
          },
        },
        new StatboticsClient(async () => Response.json([])),
      )
    ).ok,
    false,
  );
});

test("all transient upstream statuses retry sequentially with exponential backoff and three attempts maximum", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const status of [429, 500, 502, 503, 504]) {
    let attempts = 0,
      active = 0,
      maxActive = 0;
    const delays: number[] = [];
    const api = new StatboticsClient(
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        attempts++;
        return new Response("upstream unavailable", { status });
      },
      async (ms) => {
        delays.push(ms);
      },
      () => 0,
    );
    await assert.rejects(api.teamEvents("2026cass"), (error: unknown) => {
      assert.ok(error instanceof StatboticsError);
      assert.equal(error.status, status);
      assert.match(error.message, /2026cass after 3 attempts/);
      return true;
    });
    assert.equal(attempts, 3);
    assert.equal(maxActive, 1);
    assert.deepEqual(delays, [250, 500]);
  }
});

test("Retry-After no longer prevents retrying a transient failure, and recovery commits once", async (t) => {
  t.mock.method(console, "error", () => {});
  let requests = 0,
    commits = 0;
  const delays: number[] = [];
  const api = new StatboticsClient(
    async () =>
      ++requests === 1
        ? new Response("[]", { status: 500, headers: { "Retry-After": "3" } })
        : Response.json([row]),
    async (ms) => {
      delays.push(ms);
    },
  );
  const result = await syncStatboticsForEvent(
    event,
    {
      commit: async () => {
        commits++;
      },
      failed: async () =>
        assert.fail("Recovered request must not record failure"),
    },
    api,
  );
  assert.equal(result.ok, true);
  assert.equal(requests, 2);
  assert.equal(commits, 1);
  assert.deepEqual(delays, [3000]);
});

test("upstream 500 with an empty JSON body stays a failure and logs its origin and event", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "error", (entry: string) => {
    logs.push(entry);
  });
  let writes = 0;
  const saved = normalizeTeamEvent(row);
  const result = await syncStatboticsForEvent(
    event,
    {
      commit: async () => {
        writes++;
      },
      failed: async (_event, _time, message) =>
        assert.match(message, /API returned HTTP 500/),
    },
    new StatboticsClient(
      async () => new Response("[]", { status: 500 }),
      async () => {},
    ),
  );
  assert.equal(result.ok, false);
  assert.equal(writes, 0);
  assert.equal(saved.epa_total, 0);
  const entry = logs
    .map((value) => JSON.parse(value))
    .find((value) => value.stage === "upstream_response");
  assert.equal(entry.eventKey, event.tba_key);
  assert.equal(entry.upstreamStatus, 500);
  assert.equal(entry.responseDetails, "[]");
  assert.equal(entry.attempt, 1);
});

test("null and absent EPA fields remain null, while a genuine zero survives", () => {
  for (const epa of [
    null,
    undefined,
    {},
    { total_points: null, breakdown: null },
    {
      total_points: { mean: null },
      breakdown: { auto_points: null, auto_fuel: null },
    },
  ]) {
    const metric = normalizeTeamEvent({ ...row, epa });
    assert.equal(metric.epa_total, null);
    assert.equal(metric.epa_auto, null);
    assert.equal(metric.components_2026?.auto_fuel, null);
  }
  assert.equal(normalizeTeamEvent(row).epa_total, 0);
});

test("Supabase RPC errors expose their code and cause separately from upstream HTTP errors", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "error", (entry: string) => {
    logs.push(entry);
  });
  const mockDb = {
    rpc: async (operation: string) =>
      operation === "claim_statbotics_sync"
        ? {
            data: { token: "00000000-0000-4000-8000-000000000001" },
            error: null,
          }
        : {
            error: {
              code: "42501",
              message: "permission denied for schema private",
              details: "Admin helper inaccessible",
              hint: "Apply the service-role guard migration",
            },
          },
  } as unknown as Parameters<typeof statboticsRepository>[0];
  const repo = statboticsRepository(mockDb, () => mockDb);
  const result = await syncStatboticsForEvent(
    event,
    repo,
    new StatboticsClient(async () => Response.json([row])),
  );
  assert.equal(result.ok, false);
  assert.match(
    result.message,
    /Supabase store_statbotics_sync failed \(42501\)/,
  );
  assert.match(result.message, /permission denied for schema private/);
  assert.match(result.message, /status shown may be stale/);
  assert.doesNotMatch(result.message, /HTTP 500/);
  const entries = logs.map((entry) => JSON.parse(entry));
  assert.equal(
    entries.find((entry) => entry.stage === "supabase_commit").responseDetails
      .hint,
    "Apply the service-role guard migration",
  );
  assert.ok(entries.some((entry) => entry.stage === "supabase_failure_record"));
});

test("Retry-After seconds and HTTP dates are honored without a 30-second truncation", () => {
  const now = Date.parse("2026-10-08T23:00:00Z");
  for (const value of ["120", "Thu, 08 Oct 2026 23:02:00 GMT"]) {
    const plan = statboticsRetryDelay(
      new Response("", { headers: { "Retry-After": value } }),
      0,
      now,
      () => 0.5,
    );
    assert.equal(plan.delayMs, 120000);
    assert.equal(plan.retryNotBefore, "2026-10-08T23:02:00.000Z");
  }
  assert.equal(
    statboticsRetryDelay(new Response(), 0, now, () => 0.5).delayMs,
    375,
  );
  assert.equal(
    statboticsRetryDelay(new Response(), 1, now, () => 0.5).delayMs,
    750,
  );
  assert.equal(
    statboticsRetryDelay(
      new Response("", { headers: { "Retry-After": "garbage" } }),
      0,
      now,
      () => 0,
    ).delayMs,
    250,
  );
});

test("long Retry-After defers retries, persists cooldown and serves persistent cache", async (t) => {
  t.mock.method(console, "error", () => {});
  const now = Date.now();
  let requests = 0,
    recorded = 0,
    releasedAt = "";
  const result = await syncStatboticsForEvent(
    event,
    {
      commit: async () => assert.fail("Failed upstream must not write EPA"),
      failed: async () => {
        recorded++;
      },
      cached: async () => ({
        count: 60,
        oldestFetchedAt: "2026-10-04T07:26:00Z",
      }),
      release: async (_token, retryAt) => {
        releasedAt = retryAt;
      },
    },
    new StatboticsClient(
      async () => {
        requests++;
        return new Response("[]", {
          status: 503,
          headers: { "Retry-After": "120" },
        });
      },
      async () =>
        assert.fail("Must not shorten Retry-After to fit the request"),
      () => 0,
      () => now,
    ),
  );
  assert.equal(requests, 1);
  assert.equal(recorded, 1);
  assert.equal(releasedAt, new Date(now + 120000).toISOString());
  assert.equal(result.ok, false);
  assert.equal(result.source, "cache");
  assert.match(result.message, /cached EPA for 60 teams/);
  assert.match(result.message, /2026-10-04/);
});

test("shared lease prevents overlapping syncs for both the same and different events", async () => {
  let resolveRequest!: (response: Response) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  let claimed = false,
    requests = 0,
    commits = 0;
  const repository: TestRepository = {
    claim: async () => {
      if (claimed) return { token: null, reason: "busy" };
      claimed = true;
      return { token: "shared-token" };
    },
    commit: async () => {
      commits++;
    },
    failed: async () => assert.fail("Skipped sync must not record failure"),
    release: async () => {
      claimed = false;
    },
  };
  const client = new StatboticsClient(async () => {
    requests++;
    started();
    return new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  });
  const first = syncStatboticsForEvent(event, repository, client);
  await startedPromise;
  for (const target of [event, { id: "other", tba_key: "2026other" }]) {
    const skipped = await syncStatboticsForEvent(target, repository, client);
    assert.equal(skipped.ok, false);
    assert.match(skipped.message, /already running/);
  }
  assert.equal(requests, 1);
  resolveRequest(Response.json([row]));
  assert.equal((await first).ok, true);
  assert.equal(commits, 1);
  assert.equal(claimed, false);
});

test("durable cooldown skips upstream and does not overwrite the previous sync status", async () => {
  const result = await syncStatboticsForEvent(
    event,
    {
      claim: async () => ({
        token: null,
        reason: "cooldown",
        retryAt: "2026-10-09T00:00:00Z",
      }),
      commit: async () => assert.fail("No lease"),
      failed: async () => assert.fail("No lease"),
    },
    new StatboticsClient(async () =>
      assert.fail("Cooldown must not call upstream"),
    ),
  );
  assert.match(result.message, /Retry after 2026-10-09/);
});

test("Supabase lease failure prevents upstream requests and preserves cached EPA", async (t) => {
  t.mock.method(console, "error", () => {});
  const result = await syncStatboticsForEvent(
    event,
    {
      claim: async () => {
        throw Error("lease unavailable");
      },
      cached: async () => ({
        count: 2,
        oldestFetchedAt: "2026-10-01T00:00:00Z",
      }),
      commit: async () => assert.fail("No lease"),
      failed: async () => assert.fail("No lease"),
    },
    new StatboticsClient(async () =>
      assert.fail("Must fail closed before upstream"),
    ),
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /cached EPA for 2 teams/);
});

test("transport failure while reading a 200 response retries without being called a parser error", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "error", (entry: string) => {
    logs.push(entry);
  });
  let requests = 0;
  const client = new StatboticsClient(
    async () => {
      requests++;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new DOMException("Timed out", "TimeoutError"));
          },
        }),
      );
    },
    async () => {},
    () => 0,
  );
  await assert.rejects(client.teamEvents(event.tba_key), (error: unknown) => {
    assert.ok(error instanceof StatboticsError);
    assert.equal(error.code, "network");
    assert.equal(error.context.stage, "upstream_body");
    return true;
  });
  assert.equal(requests, 3);
  const entries = logs.map((entry) => JSON.parse(entry));
  assert.ok(
    entries.every(
      (entry) =>
        entry.origin === "upstream_transport" &&
        entry.errorKind === "TimeoutError",
    ),
  );
});

test("lease release errors are reported to the admin after a successful cache write", async (t) => {
  t.mock.method(console, "error", () => {});
  let commits = 0;
  const result = await syncStatboticsForEvent(
    event,
    {
      commit: async () => {
        commits++;
      },
      failed: async () => assert.fail("The EPA write succeeded"),
      release: async () => {
        throw Error("DB unavailable");
      },
    },
    new StatboticsClient(async () => Response.json([row])),
  );
  assert.equal(commits, 1);
  assert.equal(result.ok, false);
  assert.match(result.message, /lease could not be released/);
});

test("malformed and oversized responses fail before any snapshot commit with transform diagnostics", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "error", (entry: string) => {
    logs.push(entry);
  });
  for (const response of [
    new Response("not JSON"),
    new Response("[]", { headers: { "Content-Length": "5000001" } }),
  ]) {
    const result = await syncStatboticsForEvent(
      event,
      {
        commit: async () => assert.fail("Invalid data must not commit"),
        failed: async () => {},
      },
      new StatboticsClient(async () => response),
    );
    assert.equal(result.ok, false);
  }
  assert.ok(logs.some((entry) => JSON.parse(entry).stage === "transform"));
});

test("empty successful EPA results report missing coverage without claiming metrics were refreshed", async () => {
  const result = await syncStatboticsForEvent(
    event,
    { commit: async () => {}, failed: async () => {} },
    new StatboticsClient(async () => Response.json([])),
  );
  assert.equal(result.ok, true);
  assert.match(result.message, /no event EPA/);
  assert.match(result.message, /Offseason/);
  assert.match(result.message, /Previous metrics were retained/);
});
