import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_MIN_MESSAGE,
  passwordSchema,
} from "../src/lib/auth/password-policy";
import { accountInput, temporaryPassword } from "../src/features/admin/schemas";
import {
  registrationInput,
  passwordChangeInput,
} from "../src/features/auth/schemas";
import {
  completeRequiredPasswordChange,
  registerAccount,
} from "../src/features/auth/server/flows";
import { provisionAccount } from "../src/features/admin/server/provision-account";

const identity = {
  username: "boundary_scout",
  display_name: "Boundary Scout",
  email: "boundary@example.invalid",
};
const values = ["Ab1!xyZ", "Ab1!xyZ?", "Ab1!xyZ?longer"];

test("every new-password schema rejects seven and accepts eight or more without trimming", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(temporaryPassword, passwordSchema);
  for (const password of values) {
    const accepted = password.length >= MIN_PASSWORD_LENGTH;
    assert.equal(passwordSchema.safeParse(password).success, accepted);
    assert.equal(
      registrationInput.safeParse({
        ...identity,
        password,
        confirm_password: password,
      }).success,
      accepted,
    );
    assert.equal(
      passwordChangeInput.safeParse({ password, confirm_password: password })
        .success,
      accepted,
    );
    assert.equal(
      accountInput.safeParse({ ...identity, role: "scout", password }).success,
      accepted,
    );
  }
  const spaced = " Ab1!xy ";
  assert.equal(passwordSchema.parse(spaced), spaced);
  assert.equal(
    passwordSchema.safeParse("x".repeat(MAX_PASSWORD_LENGTH + 1)).success,
    false,
  );
  assert.equal(
    passwordSchema.safeParse(values[0]).error?.issues[0].message,
    PASSWORD_MIN_MESSAGE,
  );
  const config = readFileSync("supabase/config.toml", "utf8");
  assert.equal(
    Number(config.match(/^minimum_password_length\s*=\s*(\d+)/m)?.[1]),
    MIN_PASSWORD_LENGTH,
  );
});

test("signup enforces the boundary before Auth and still drops self-selected privileges", async () => {
  for (const password of values) {
    let sent = false;
    const result = await registerAccount(
      {
        ...identity,
        password,
        confirm_password: password,
        role: "admin",
        active: true,
        approval_pending: false,
      },
      {
        async usernameExists() {
          return false;
        },
        async signUp(input) {
          sent = true;
          assert.equal(input.password, password);
          for (const key of ["role", "active", "approval_pending"])
            assert.equal(key in input, false);
          return { created: true };
        },
      },
    );
    assert.equal(sent, password.length >= MIN_PASSWORD_LENGTH);
    if (sent) assert.equal(result.created, true);
    else
      assert.match(result.fieldErrors?.password ?? "", /at least 8 characters/);
  }
});

test("password reset completion applies the same boundary before eligibility or Supabase updates", async () => {
  for (const password of values) {
    const calls: string[] = [];
    const result = await completeRequiredPasswordChange(
      { password, confirm_password: password },
      {
        async eligible() {
          calls.push("eligible");
          return true;
        },
        async update(received) {
          assert.equal(received, password);
          calls.push("Auth update");
          return true;
        },
        async finish() {
          calls.push("finish");
          return true;
        },
      },
    );
    if (password.length < MIN_PASSWORD_LENGTH) {
      assert.deepEqual(calls, []);
      assert.ok(result.fieldErrors?.password);
    } else {
      assert.deepEqual(calls, ["eligible", "Auth update", "finish"]);
      assert.equal(result.success, true);
    }
  }
  assert.ok(
    (
      await completeRequiredPasswordChange(
        { password: values[1], confirm_password: values[1] },
        {
          async eligible() {
            return false;
          },
          async update() {
            assert.fail("Pending/disabled account must not update Auth");
          },
          async finish() {
            assert.fail("Pending/disabled account must not activate itself");
          },
        },
      )
    ).error,
  );
});

test("admin provisioning rejects seven before any provider call and accepts eight or more", async () => {
  for (const password of values) {
    const calls: string[] = [];
    const provision = () =>
      provisionAccount(
        { ...identity, role: "scout", password },
        {
          async usernameExists() {
            calls.push("lookup");
            return false;
          },
          async createAuth(input) {
            calls.push("Auth create");
            assert.equal(input.password, password);
            return "test-id";
          },
          async activate(id, input) {
            calls.push("admin activation");
            assert.equal(id, "test-id");
            assert.equal(input.role, "scout");
          },
        },
      );
    if (password.length < MIN_PASSWORD_LENGTH) {
      await assert.rejects(provision());
      assert.deepEqual(calls, []);
    } else {
      assert.equal(await provision(), "test-id");
      assert.deepEqual(calls, ["lookup", "Auth create", "admin activation"]);
    }
  }
});
