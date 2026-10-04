import test from "node:test";
import assert from "node:assert/strict";
import {
  registerAccount,
  requestPasswordReset,
  completeRequiredPasswordChange,
  RESET_REQUEST_MESSAGE,
} from "../src/features/auth/server/flows";
import {
  registrationInput,
  passwordChangeInput,
} from "../src/features/auth/schemas";
import {
  accountAccess,
  hasProfileRole,
  isAuthPage,
} from "../src/lib/auth/account-access";
import { authenticate } from "../src/features/auth/server/authenticate";

const registration = {
  display_name: " New Scout ",
  username: " New_SCOUT ",
  email: " Scout@Example.invalid ",
  password: "  long-test-password  ",
  confirm_password: "  long-test-password  ",
};

test("registration normalizes identity, keeps password, and discards supplied privileges", () => {
  const result = registrationInput.parse({
    ...registration,
    role: "admin",
    active: true,
    approval_pending: false,
  });
  assert.equal(result.username, "new_scout");
  assert.equal(result.display_name, "New Scout");
  assert.equal(result.email, "scout@example.invalid");
  assert.equal(result.password, registration.password);
  assert.equal("role" in result, false);
  assert.equal("active" in result, false);
});

test("registration validates fields and checks username uniqueness before signup", async () => {
  for (const patch of [
    { display_name: " " },
    { username: "bad/name" },
    { email: "bad" },
    { password: "short" },
    { confirm_password: "different" },
  ]) {
    const result = await registerAccount(
      { ...registration, ...patch },
      {
        async usernameExists() {
          assert.fail("must not query");
        },
        async signUp() {
          assert.fail("must not sign up");
        },
      },
    );
    assert.ok(result.fieldErrors);
  }
  let calls = 0;
  const duplicate = await registerAccount(registration, {
    async usernameExists() {
      return true;
    },
    async signUp() {
      calls++;
      return { created: true };
    },
  });
  assert.match(duplicate.error!, /username/i);
  assert.equal(calls, 0);
  const created = await registerAccount(registration, {
    async usernameExists(username) {
      assert.equal(username, "new_scout");
      return false;
    },
    async signUp(values) {
      assert.equal("role" in values, false);
      assert.equal("active" in values, false);
      return { created: true };
    },
  });
  assert.deepEqual(created, { created: true });
});

test("signup provider failure never returns private details", async () => {
  const result = await registerAccount(registration, {
    async usernameExists() {
      return false;
    },
    async signUp() {
      throw Error("private provider detail");
    },
  });
  assert.ok(result.error);
  assert.ok(!JSON.stringify(result).includes("private provider detail"));
});

test("pending and forced-change accounts have no workspace role access", () => {
  for (const role of ["scout", "strategy", "admin"] as const) {
    const pending = {
      active: false,
      approval_pending: true,
      must_change_password: true,
      role,
    };
    assert.equal(accountAccess(pending), "pending");
    assert.equal(hasProfileRole(pending, "scout"), false);
    assert.equal(hasProfileRole(pending, "admin"), false);
    const forced = { ...pending, approval_pending: false };
    assert.equal(accountAccess(forced), "password_change");
    assert.equal(hasProfileRole(forced, "scout"), false);
  }
  assert.equal(
    hasProfileRole(
      {
        active: true,
        approval_pending: false,
        must_change_password: false,
        role: "scout",
      },
      "scout",
    ),
    true,
  );
  assert.equal(
    hasProfileRole(
      {
        active: true,
        approval_pending: false,
        must_change_password: false,
        role: "scout",
      },
      "strategy",
    ),
    false,
  );
  assert.equal(
    hasProfileRole(
      {
        active: true,
        approval_pending: false,
        must_change_password: false,
        role: "admin",
      },
      "admin",
    ),
    true,
  );
  assert.equal(isAuthPage("/change-password"), true);
  assert.equal(isAuthPage("/reset-password"), false);
});

test("username and email login retain pending and forced-change sessions but clear disabled ones", async () => {
  let cleared = 0;
  const base = {
    async resolveUsername(username: string) {
      assert.equal(username, "new_scout");
      return "scout@example.invalid";
    },
    async signIn(email: string) {
      assert.equal(email, "scout@example.invalid");
      return "id";
    },
    async activeProfile(): Promise<boolean | "pending" | "password_change"> {
      return "pending";
    },
    async clearSession() {
      cleared++;
    },
  };
  assert.equal(
    await authenticate({ identifier: "new_scout", password: "secret" }, base),
    "pending",
  );
  assert.equal(
    await authenticate(
      { identifier: "scout@example.invalid", password: "secret" },
      {
        ...base,
        async activeProfile() {
          return "password_change" as const;
        },
      },
    ),
    "password_change",
  );
  assert.equal(
    await authenticate(
      { identifier: "scout@example.invalid", password: "secret" },
      {
        ...base,
        async activeProfile() {
          return true;
        },
      },
    ),
    true,
  );
  assert.equal(
    await authenticate(
      { identifier: "scout@example.invalid", password: "secret" },
      {
        ...base,
        async activeProfile() {
          return false;
        },
      },
    ),
    false,
  );
  assert.equal(cleared, 1);
});

test("username or email reset request always returns the same neutral result", async () => {
  let identifier = "";
  const known = await requestPasswordReset(" New_SCOUT ", async (value) => {
    identifier = value;
  });
  assert.equal(identifier, "new_scout");
  assert.equal(known.message, RESET_REQUEST_MESSAGE);
  const absent = await requestPasswordReset(
    "absent@example.invalid",
    async () => {},
  );
  const failure = await requestPasswordReset(
    "absent@example.invalid",
    async () => {
      throw Error("database detail");
    },
  );
  assert.deepEqual(absent, known);
  assert.deepEqual(failure, known);
});

test("required change validates password, checks eligibility, updates Auth, then clears flag", async () => {
  assert.equal(
    passwordChangeInput.safeParse({
      password: "short",
      confirm_password: "short",
    }).success,
    false,
  );
  const input = {
    password: "long-new-password",
    confirm_password: "long-new-password",
  };
  const calls: string[] = [];
  const base = {
    async eligible() {
      return false;
    },
    async update(value: string) {
      calls.push(value);
      return true;
    },
    async finish() {
      calls.push("finish");
      return true;
    },
  };
  assert.ok((await completeRequiredPasswordChange(input, base)).error);
  assert.deepEqual(calls, []);
  assert.ok(
    (
      await completeRequiredPasswordChange(
        { ...input, confirm_password: "different" },
        {
          ...base,
          async eligible() {
            return true;
          },
        },
      )
    ).fieldErrors,
  );
  assert.equal(
    (
      await completeRequiredPasswordChange(input, {
        ...base,
        async eligible() {
          return true;
        },
      })
    ).success,
    true,
  );
  assert.deepEqual(calls, [input.password, "finish"]);
});
