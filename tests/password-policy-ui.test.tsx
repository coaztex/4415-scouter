import "./fixtures/dom-setup";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_LENGTH_HINT,
} from "../src/lib/auth/password-policy";

// Render the actual forms with inert action references; never import privileged clients.
const loadForms = createRequire(
  `${process.cwd()}/tests/password-policy-ui.test.tsx`,
);
for (const [path, names] of [
  [
    "../src/features/auth/server/lifecycle-actions",
    [
      "registrationAction",
      "forgotPasswordAction",
      "requiredPasswordChangeAction",
    ],
  ],
  ["../src/features/auth/server/password-action", ["changePasswordAction"]],
  [
    "../src/features/admin/server/actions",
    ["accountAction", "accountApprovalAction", "passwordResetDecisionAction"],
  ],
] as const) {
  const resolved = loadForms.resolve(path);
  const stub = new Module(resolved);
  stub.exports = Object.fromEntries(
    names.map((name) => [name, async () => ({})]),
  );
  stub.loaded = true;
  loadForms.cache[resolved] = stub;
}
const { RegistrationForm, RequiredPasswordChangeForm } = loadForms(
  "../src/features/auth/components/lifecycle-forms",
) as typeof import("../src/features/auth/components/lifecycle-forms");
const { PasswordForm } = loadForms(
  "../src/features/auth/components/password-form",
) as typeof import("../src/features/auth/components/password-form");
const { CreateAccountForm, PasswordResetRequestForm } = loadForms(
  "../src/features/admin/components/account-forms",
) as typeof import("../src/features/admin/components/account-forms");

test("all new-password forms share policy constraints and copy without changing current-password login", () => {
  const forms = [
    <RegistrationForm key="signup" />,
    <RequiredPasswordChangeForm key="reset" />,
    <PasswordForm key="account" />,
    <CreateAccountForm key="admin-create" />,
    <PasswordResetRequestForm
      key="admin-reset"
      request={{
        id: "request",
        username: "scout",
        display_name: "Scout",
        email: null,
        requested_at: "2026-10-06T12:00:00Z",
        approval_pending: true,
      }}
    />,
  ];
  for (const form of forms) {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(form);
    const newPasswords = host.querySelectorAll<HTMLInputElement>(
      'input[type="password"]:not([name="current_password"])',
    );
    assert.ok(newPasswords.length > 0);
    for (const input of newPasswords) {
      assert.equal(input.minLength, MIN_PASSWORD_LENGTH);
      assert.equal(input.maxLength, MAX_PASSWORD_LENGTH);
    }
    assert.ok(host.textContent?.includes(PASSWORD_LENGTH_HINT));
    const current = host.querySelector<HTMLInputElement>(
      '[name="current_password"]',
    );
    if (current) assert.equal(current.hasAttribute("minlength"), false);
  }
  const registration = renderToStaticMarkup(<RegistrationForm />);
  assert.match(registration, /Admin approval is required/);
  assert.doesNotMatch(registration, /name="(?:role|active|approval_pending)"/);
});
