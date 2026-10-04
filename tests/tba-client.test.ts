import { test } from "node:test";
import assert from "node:assert/strict";
import { TbaClient, TbaError } from "../src/lib/tba/client";

const event = { key: "2026fixture", year: 2026, name: "Synthetic event" };
test("TBA transport sends the server key with bounded request settings and captures cache headers", async () => {
  const client = new TbaClient({
    key: "synthetic-secret",
    fetcher: async (url, init) => {
      assert.equal(
        url,
        "https://www.thebluealliance.com/api/v3/event/2026fixture",
      );
      assert.equal(
        new Headers(init?.headers).get("X-TBA-Auth-Key"),
        "synthetic-secret",
      );
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      return Response.json(event, {
        headers: { etag: "version-one", "cache-control": "max-age=60" },
      });
    },
  });
  const result = await client.event("2026fixture");
  assert.equal(result.data.name, event.name);
  assert.equal(result.cache.etag, "version-one");
  assert.equal(result.cache.cacheControl, "max-age=60");
  assert.throws(
    () => new TbaClient({ key: "x", baseUrl: "https://untrusted.invalid" }),
  );
  assert.throws(() => new TbaClient({ key: "" }));
});
test("transient failures retry at most twice, permanent errors and invalid JSON never retry", async () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    let calls = 0;
    const client = new TbaClient({
      key: "secret",
      retries: 100,
      sleep: async () => {},
      fetcher: async () => {
        calls++;
        return new Response("secret provider body", { status });
      },
    });
    await assert.rejects(
      client.event("2026fixture"),
      (error: unknown) =>
        error instanceof TbaError &&
        error.status === status &&
        !error.message.includes("secret"),
    );
    assert.equal(calls, [429, 500, 503].includes(status) ? 3 : 1);
  }
  let calls = 0;
  const malformed = new TbaClient({
    key: "secret",
    fetcher: async () => {
      calls++;
      return new Response("not JSON");
    },
  });
  await assert.rejects(
    malformed.event("2026fixture"),
    (error: unknown) =>
      error instanceof TbaError && error.code === "invalid_response",
  );
  assert.equal(calls, 1);
});
test("network timeouts retry finitely; long Retry-After stops without early retry", async () => {
  let calls = 0;
  const timeout = new TbaClient({
    key: "secret",
    sleep: async () => {},
    fetcher: async () => {
      calls++;
      throw new DOMException("sensitive diagnostic", "TimeoutError");
    },
  });
  await assert.rejects(
    timeout.event("2026fixture"),
    (error: unknown) => error instanceof TbaError && error.code === "timeout",
  );
  assert.equal(calls, 3);
  calls = 0;
  const limited = new TbaClient({
    key: "secret",
    fetcher: async () => {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { "retry-after": "120" },
      });
    },
  });
  await assert.rejects(limited.event("2026fixture"));
  assert.equal(calls, 1);
});
test("optional data may be unavailable; malicious keys fail before a request", async () => {
  let calls = 0;
  const client = new TbaClient({
    key: "secret",
    fetcher: async () => {
      calls++;
      return new Response(null, { status: 404 });
    },
  });
  assert.equal((await client.rankings("2026fixture")).data, null);
  await assert.rejects(client.event("../../secret"));
  assert.equal(calls, 1);
});
test("event team media uses one authenticated event endpoint and validates its shape", async () => {
  const client = new TbaClient({
    key: "secret",
    fetcher: async (url) => {
      assert.equal(
        url,
        "https://www.thebluealliance.com/api/v3/event/2026fixture/team_media",
      );
      return Response.json([
        {
          type: "imgur",
          direct_url: "https://i.imgur.com/AB12cd.jpeg",
          preferred: true,
          team_keys: ["frc4415"],
        },
        {
          type: "avatar",
          direct_url: "",
          preferred: true,
          team_keys: ["frc4415"],
          details: { base64Image: "cG5n" },
        },
      ]);
    },
  });
  const result = await client.teamMedia("2026fixture");
  assert.equal(result.data?.[0].team_keys[0], "frc4415");
  assert.equal(result.data?.[1].details?.base64Image, "cG5n");
});
