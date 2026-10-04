import test from "node:test";
import assert from "node:assert/strict";
import {
  provisionAccount,
  type ProvisionDependencies,
} from "../src/features/admin/server/provision-account";
const input = {
  username: "new_scout",
  display_name: "New Scout",
  role: "scout",
  email: "scout@example.invalid",
  password: "long-test-only-password",
};
test("account provisioning stops on duplicate username without creating Auth users", async () => {
  const dependencies: ProvisionDependencies = {
    async usernameExists() {
      return true;
    },
    async createAuth() {
      throw new Error("Must not create");
    },
    async activate() {
      throw new Error("Must not activate");
    },
  };
  await assert.rejects(provisionAccount(input, dependencies), /already in use/);
});
test("provisioning creates Auth first and returns no password or email", async () => {
  const calls: string[] = [];
  const result = await provisionAccount(input, {
    async usernameExists() {
      return false;
    },
    async createAuth() {
      calls.push("create");
      return "test-id";
    },
    async activate(id, values) {
      assert.equal(id, "test-id");
      assert.equal(values.role, "scout");
      calls.push("activate");
    },
  });
  assert.equal(result, "test-id");
  assert.deepEqual(calls, ["create", "activate"]);
});
test("provider failures and partial activation errors never include passwords; partial accounts are recoverable", async () => {
  const deps: ProvisionDependencies = {
    async usernameExists() {
      return false;
    },
    async createAuth() {
      throw Error(input.password);
    },
    async activate() {},
  };
  await assert.rejects(
    provisionAccount(input, deps),
    (error) =>
      error instanceof Error && !error.message.includes(input.password),
  );
  deps.createAuth = async () => "inactive-id";
  deps.activate = async () => {
    throw Error(input.password);
  };
  await assert.rejects(
    provisionAccount(input, deps),
    (error) =>
      error instanceof Error &&
      error.message.includes("inactive-id") &&
      !error.message.includes(input.password),
  );
});
