import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { boardFixture, boardId } from "./fixtures/strategy-board";
import type { BoardSaveResult } from "../src/features/strategy-board/server/actions";
const load = createRequire(
  `${process.cwd()}/tests/strategy-board-server.test.ts`,
);
const f = boardFixture();
let saved: {
  board_data: unknown;
  schema_version: number;
  revision: number;
  updated_at: string;
} | null = null;
let permission = true,
  rpcCode: string | null = null,
  rpcCalls = 0;
let storageError: string | null = null;
let profileRole: "strategy" | "scout" = "strategy";
function from(table: string) {
  let rows: Record<string, unknown>[] =
    table === "events"
      ? [{ id: f.eventId, status: "active", game_slug: f.gameSlug }]
      : table === "matches"
        ? [
            {
              id: f.matchId,
              event_id: f.eventId,
              tba_match_key: f.matchKey,
              comp_level: "qm",
              set_number: 1,
              match_number: 1,
            },
          ]
        : table === "match_teams"
          ? f.lineup.map((row) => ({ ...row, event_id: f.eventId }))
          : table === "strategy_boards" && saved
            ? [{ ...saved, event_id: f.eventId, match_id: f.matchId }]
            : [];
  const builder = {
    select() {
      return builder;
    },
    eq(key: string, value: unknown) {
      rows = rows.filter((row) => row[key] === value);
      return builder;
    },
    async maybeSingle() {
      return {
        data: rows[0] ?? null,
        error:
          table === "strategy_boards" && storageError
            ? { code: storageError }
            : null,
      };
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return builder;
}
class AuthorizationError extends Error {}
function stub(path: string, exports: unknown) {
  const resolved = load.resolve(path),
    stubModule = new Module(resolved);
  stubModule.exports = exports;
  stubModule.loaded = true;
  load.cache[resolved] = stubModule;
}
stub("../src/lib/auth/server", {
  AuthorizationError,
  async requireRole(role: string) {
    assert.ok(["strategy", "scout"].includes(role));
    if (!permission || (role === "strategy" && profileRole === "scout"))
      throw new AuthorizationError();
    return {
      db: {
        from,
        rpc(
          name: string,
          args: {
            expected_revision: number;
            document: unknown;
            target_event: string;
            target_match: string;
          },
        ) {
          if (name === "read_strategy_board_map") {
            return {
              maybeSingle: async () => ({
                data: saved
                  ? {
                      ...saved,
                      board_data: {
                        ...f.document,
                        phases: Object.fromEntries(
                          Object.entries(f.document.phases).map(
                            ([id, phase]) => [id, { ...phase, notes: "" }],
                          ),
                        ),
                      },
                    }
                  : null,
                error: null,
              }),
            };
          }
          rpcCalls++;
          assert.equal(name, "save_strategy_board");
          assert.equal(args.target_event, f.eventId);
          assert.equal(args.target_match, f.matchId);
          if (rpcCode) return { data: null, error: { code: rpcCode } };
          return { data: args.expected_revision + 1, error: null };
        },
      },
      profile: { id: f.actorId, role: profileRole },
    };
  },
});
stub("../src/features/events/server/queries", {
  async getEvent(key: string) {
    return {
      id: f.eventId,
      tba_key: key,
      status: "active",
      game_slug: f.gameSlug,
    };
  },
});
stub("next/navigation", {
  notFound() {
    throw new Error("not-found");
  },
});
const { getStrategyBoard } = load(
  "../src/features/strategy-board/server/queries",
) as typeof import("../src/features/strategy-board/server/queries");
const { saveStrategyBoard } = load(
  "../src/features/strategy-board/server/actions",
) as typeof import("../src/features/strategy-board/server/actions");
test("missing board storage identifies the migration and never substitutes an empty board", async () => {
  try {
    for (const code of ["PGRST205", "42P01"]) {
      storageError = code;
      await assert.rejects(
        getStrategyBoard(f.eventKey, f.matchKey),
        /Apply migration 20261023000000_strategy_boards.sql/,
      );
    }
    storageError = "08006";
    await assert.rejects(
      getStrategyBoard(f.eventKey, f.matchKey),
      /Existing data has not been overwritten/,
    );
  } finally {
    storageError = null;
  }
});
test("board query uses canonical event/match and exact actual station order, then reloads saved phases", async () => {
  saved = null;
  const first = await getStrategyBoard(f.eventKey, f.matchKey);
  assert.equal(first.matchId, f.matchId);
  assert.equal(first.revision, 0);
  assert.deepEqual(
    first.lineup.map((row) => row.stationLabel),
    ["R1", "R2", "R3", "B1", "B2", "B3"],
  );
  const document = structuredClone(first.document);
  document.phases.transition.notes = "Saved transition";
  saved = {
    board_data: document,
    schema_version: 1,
    revision: 4,
    updated_at: "2026-10-06",
  };
  assert.equal(
    (await getStrategyBoard(f.eventKey, f.matchKey)).document.phases.transition
      .notes,
    "Saved transition",
  );
  await assert.rejects(
    getStrategyBoard(f.eventKey, "2026test_qm2"),
    /not-found/,
  );
  saved = { ...saved, schema_version: 2 };
  await assert.rejects(getStrategyBoard(f.eventKey, f.matchKey), /schema/);
  saved = null;
});
test("server save validates roles and station/phase identity before revision RPC", async () => {
  const value = {
    eventId: f.eventId,
    matchId: f.matchId,
    expectedRevision: 0,
    document: f.document,
  };
  assert.deepEqual(await saveStrategyBoard(value), { ok: true, revision: 1 });
  const before = rpcCalls;
  permission = false;
  assert.equal(
    (
      (await saveStrategyBoard(value)) as Extract<
        BoardSaveResult,
        { ok: false }
      >
    ).kind,
    "auth",
  );
  permission = true;
  const document = structuredClone(f.document);
  document.phases.auto.markers[0].teamNumber = 999;
  assert.equal(
    (
      (await saveStrategyBoard({ ...value, document })) as Extract<
        BoardSaveResult,
        { ok: false }
      >
    ).kind,
    "invalid",
  );
  assert.equal(
    (
      (await saveStrategyBoard({ ...value, matchId: boardId(99) })) as Extract<
        BoardSaveResult,
        { ok: false }
      >
    ).kind,
    "invalid",
  );
  assert.equal(rpcCalls, before);
});
test("conflicting saves and authorization loss return safe failures, never overwrite", async () => {
  const value = {
    eventId: f.eventId,
    matchId: f.matchId,
    expectedRevision: 1,
    document: f.document,
  };
  for (const [code, kind] of [
    ["P0001", "conflict"],
    ["42501", "auth"],
    ["08006", "transient"],
  ]) {
    rpcCode = code;
    const result = await saveStrategyBoard(value);
    assert.equal(result.ok, false);
    assert.equal(
      (result as Extract<BoardSaveResult, { ok: false }>).kind,
      kind,
    );
  }
  rpcCode = null;
});

test("scouts receive a map-only document and cannot use the save action", async () => {
  profileRole = "scout";
  try {
    saved = {
      board_data: f.document,
      schema_version: 1,
      revision: 3,
      updated_at: "2026-10-07T00:00:00Z",
    };
    const context = await getStrategyBoard(f.eventKey, f.matchKey);
    assert.equal(context.viewOnly, true);
    assert.equal(context.readOnly, true);
    assert.ok(
      Object.values(context.document.phases).every((p) => p.notes === ""),
    );
    const result = await saveStrategyBoard({
      eventId: f.eventId,
      matchId: f.matchId,
      expectedRevision: 3,
      document: f.document,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, "auth");
  } finally {
    profileRole = "strategy";
    saved = null;
  }
});
