import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePublicSupabaseEnvironment } from "../src/lib/env/public";
import {
  getServiceRoleEnvironment,
  getOptionalShellSupabaseEnvironment,
} from "../src/lib/server/env";

test("rejects missing, partial, unsafe URLs and private keys in public configuration", () => {
  for (const [url, key] of [
    [undefined, undefined],
    ["https://example.supabase.co", undefined],
    ["http://example.supabase.co", "sb_publishable_test"],
    ["https://user:pass@example.supabase.co", "sb_publishable_test"],
    ["https://example.supabase.co/path", "sb_publishable_test"],
    ["https://example.supabase.co", "sb_secret_test"],
    ["https://example.supabase.co", "header.payload.signature"],
  ])
    assert.throws(() => parsePublicSupabaseEnvironment(url, key));
});

test("accepts hosted and local public configuration", () => {
  for (const url of ["https://example.supabase.co", "http://127.0.0.1:54321"])
    assert.deepEqual(
      parsePublicSupabaseEnvironment(url, "sb_publishable_test"),
      { url, publishableKey: "sb_publishable_test" },
    );
});

test("shell permits absent configuration but rejects partial configuration", () => {
  const old = { ...process.env };
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.equal(getOptionalShellSupabaseEnvironment(), null);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    assert.throws(getOptionalShellSupabaseEnvironment);
  } finally {
    process.env = old;
  }
});

test("service key is lazy, validated separately, and absent from errors", () => {
  const old = { ...process.env };
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(getServiceRoleEnvironment);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_publishable_private_test";
    assert.throws(
      getServiceRoleEnvironment,
      (error: unknown) =>
        error instanceof Error &&
        !error.message.includes("sb_publishable_private_test"),
    );
    // Synthetic shape only, never used as credentials or sent to a service.
    const key = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    assert.equal(getServiceRoleEnvironment().serviceRoleKey, key);
  } finally {
    process.env = old;
  }
});
