import test from "node:test";
import assert from "node:assert/strict";
import { accountInput, profileValues } from "../src/features/admin/schemas";
test("account creation validates identifiers and temporary passwords without trimming passwords", () => {
  const input = {
    username: " SCOUT_1 ",
    display_name: " Scout ",
    role: "scout",
    email: "user@example.invalid",
    password: " a sufficiently long password ",
  };
  const result = accountInput.parse(input);
  assert.equal(result.username, "scout_1");
  assert.equal(result.display_name, "Scout");
  assert.equal(result.password, input.password);
  for (const patch of [
    { username: "bad/name" },
    { role: "owner" },
    { email: "not-email" },
    { password: "short" },
  ])
    assert.equal(accountInput.safeParse({ ...input, ...patch }).success, false);
  assert.equal(
    profileValues.safeParse({
      username: "scout",
      display_name: "Scout",
      role: "scout",
      active: "false",
    }).success,
    false,
  );
});
