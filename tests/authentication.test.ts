import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticate,
  type LoginDependencies,
} from "../src/features/auth/server/authenticate";
import { allowLoginAttempt } from "../src/features/auth/server/rate-limit";
import { isAtLeastRole } from "../src/lib/auth/roles";

function setup() {
  const calls: string[] = [];
  const dependencies: LoginDependencies = {
    async resolveUsername(value) {
      calls.push(`lookup:${value}`);
      return "test@example.invalid";
    },
    async signIn(email, password) {
      calls.push(`signin:${email}:${password}`);
      return "id";
    },
    async activeProfile(id) {
      calls.push(`profile:${id}`);
      return true;
    },
    async clearSession() {
      calls.push("clear");
    },
  };
  return { calls, dependencies };
}
test("email login skips privileged lookup and preserves password whitespace", async () => {
  const { calls, dependencies } = setup();
  assert.equal(
    await authenticate(
      { identifier: " Test@Example.invalid ", password: " pass " },
      dependencies,
    ),
    true,
  );
  assert.deepEqual(calls, ["signin:test@example.invalid: pass ", "profile:id"]);
});
test("username login normalizes username and only returns success after active profile check", async () => {
  const { calls, dependencies } = setup();
  assert.equal(
    await authenticate(
      { identifier: " SCOUT_1 ", password: "secret" },
      dependencies,
    ),
    true,
  );
  assert.deepEqual(calls, [
    "lookup:scout_1",
    "signin:test@example.invalid:secret",
    "profile:id",
  ]);
});
test("missing usernames still attempt password auth; inactive/missing profiles clear issued sessions", async () => {
  const { calls, dependencies } = setup();
  dependencies.resolveUsername = async () => null;
  dependencies.signIn = async (email) => {
    assert.match(email, /@invalid\.invalid$/);
    calls.push("attempt");
    return null;
  };
  assert.equal(
    await authenticate(
      { identifier: "unknown", password: "secret" },
      dependencies,
    ),
    false,
  );
  assert.deepEqual(calls, ["attempt"]);
  const disabled = setup();
  disabled.dependencies.activeProfile = async () => false;
  assert.equal(
    await authenticate(
      { identifier: "scout", password: "secret" },
      disabled.dependencies,
    ),
    false,
  );
  assert.equal(disabled.calls.at(-1), "clear");
});
test("invalid inputs, provider errors and lookup failures never expose identity or grant access", async () => {
  const { dependencies, calls } = setup();
  for (const identifier of [null, {}, "x", "bad/user", "a".repeat(255)])
    assert.equal(
      await authenticate({ identifier, password: "secret" }, dependencies),
      false,
    );
  assert.equal(calls.length, 0);
  dependencies.resolveUsername = async () => {
    throw new Error("private email or credential");
  };
  assert.equal(
    await authenticate(
      { identifier: "unknown", password: "secret" },
      dependencies,
    ),
    false,
  );
  dependencies.signIn = async () => null;
  assert.equal(
    await authenticate(
      { identifier: "test@example.invalid", password: "wrong" },
      dependencies,
    ),
    false,
  );
});
test("local burst limiter expires and does not permit unlimited attempts", () => {
  for (let i = 0; i < 10; i++)
    assert.equal(allowLoginAttempt("test-ip", 100), true);
  assert.equal(allowLoginAttempt("test-ip", 100), false);
  assert.equal(allowLoginAttempt("test-ip", 60100), true);
});
test("admin route role requirement never accepts scout or strategy", () => {
  assert.equal(isAtLeastRole("admin", "admin"), true);
  assert.equal(isAtLeastRole("scout", "admin"), false);
  assert.equal(isAtLeastRole("strategy", "admin"), false);
});
