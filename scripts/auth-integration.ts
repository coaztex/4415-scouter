// Local Supabase and isolated Next server only. Never accepts a remote URL.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { localStatus } from "./synthetic-event";

const status = localStatus();
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(status.API_URL).hostname),
);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(status.DB_URL).hostname));
const origin = "http://localhost:3002";
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new Client({ connectionString: status.DB_URL, ssl: false });
const marker = randomUUID().replaceAll("-", "");
const username = `auth_${marker}`;
const email = `${username}@example.invalid`;
const password = `LocalTestOnly_${marker}!`;
const newPassword = `NewLocalTestOnly_${marker}!`;
let userId: string | undefined;
let testAdminId: string | undefined;

class BrowserSession {
  private cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}) {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        ...init.headers,
        Origin: origin,
        Cookie: [...this.cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0],
        separator = pair.indexOf("=");
      const name = pair.slice(0, separator),
        value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return response;
  }
  async actionForm(path: string, selector = "form") {
    const page = await this.request(path);
    assert.equal(page.status, 200);
    const dom = new JSDOM(await page.text());
    const form = dom.window.document.querySelector(selector);
    assert.ok(form, `Missing form on ${path}`);
    const data = new FormData();
    for (const input of form.querySelectorAll<HTMLInputElement>(
      'input[type="hidden"][name]',
    ))
      data.set(input.name, input.value);
    dom.window.close();
    return data;
  }
  async submit(
    path: string,
    fields: Record<string, string>,
    submitter?: { name: string; value: string },
    selector = "form",
  ) {
    const data = await this.actionForm(path, selector);
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    if (submitter) data.set(submitter.name, submitter.value);
    return this.request(path, { method: "POST", body: data });
  }
}

async function main() {
  const savedTsconfig = readFileSync("tsconfig.json", "utf8");
  const savedNextEnv = readFileSync("next-env.d.ts", "utf8");
  const server = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "dev", "--port", "3002"],
    {
      stdio: "ignore",
      env: {
        ...process.env,
        SCOUT_AUTH_TEST: "1",
        NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
        TBA_AUTH_KEY: "",
        TBA_WEBHOOK_SECRET: "",
      },
    },
  );
  try {
    await db.connect();
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        ready = (await fetch(`${origin}/login`)).ok;
      } catch {
        /* starting */
      }
      if (ready) break;
      if (server.exitCode !== null)
        throw Error("Isolated app server failed to start");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Isolated app server not ready");

    const session = new BrowserSession();
    const registered = await session.submit("/register", {
      display_name: "Local Auth Test",
      username,
      email,
      password,
      confirm_password: password,
    });
    assert.equal(registered.status, 303);
    assert.equal(
      registered.headers.get("location"),
      "/pending-approval?created=1",
    );
    const profile = await admin
      .from("profiles")
      .select("id,role,active,approval_pending,must_change_password")
      .eq("username", username)
      .single();
    assert.ok(profile.data);
    userId = profile.data.id;
    assert.equal(profile.data.role, "scout");
    assert.equal(profile.data.active, false);
    assert.equal(profile.data.approval_pending, true);
    assert.equal(
      new URL(
        (await session.request("/events")).headers.get("location")!,
        origin,
      ).pathname,
      "/pending-approval",
    );
    const denied = await session.request("/api/scouting/sync", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(denied.status, 403);
    console.log(
      "PASS signup creates pending Scout without email confirmation; pages and API remain blocked",
    );

    const unknown = await (
      await session.submit("/forgot-password", {
        identifier: "absent@example.invalid",
      })
    ).text();
    const requested = await (
      await session.submit("/forgot-password", { identifier: username })
    ).text();
    assert.ok(
      unknown.includes(
        "If that account exists, a password reset request has been sent to an administrator.",
      ),
    );
    assert.ok(
      requested.includes(
        "If that account exists, a password reset request has been sent to an administrator.",
      ),
    );
    const duplicate = await session.submit("/forgot-password", {
      identifier: email,
    });
    assert.equal(duplicate.status, 200);
    const requests = await admin
      .from("password_reset_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending");
    assert.equal(requests.data?.length, 1);
    const requestId = requests.data![0].id;
    console.log(
      "PASS unknown and known identifiers have neutral responses; username/email requests deduplicate",
    );

    const approver = await admin
      .from("profiles")
      .select("id")
      .eq("active", true)
      .eq("role", "admin")
      .limit(1)
      .single();
    assert.ok(
      approver.data,
      "Seed a local synthetic admin before integration testing",
    );
    const createdAdmin = await admin.auth.admin.createUser({
      email: `admin_${marker}@example.invalid`,
      password,
      email_confirm: true,
      user_metadata: {
        username: `admin_${marker}`,
        display_name: "Local Test Admin",
      },
    });
    assert.ok(createdAdmin.data.user);
    testAdminId = createdAdmin.data.user.id;
    assert.equal(
      (
        await admin
          .from("profiles")
          .update({ active: true, role: "admin" })
          .eq("id", testAdminId)
      ).error,
      null,
    );
    const adminSession = new BrowserSession();
    assert.equal(
      (
        await adminSession.submit("/login", {
          identifier: `admin_${marker}`,
          password,
        })
      ).status,
      303,
    );
    const resetSelector = `form:has(input[name="id"][value="${requestId}"])`;
    const forged = await adminSession.actionForm("/admin/users", resetSelector);
    forged.set("operation", "reset");
    const unauthorized = await session.request("/admin/users", {
      method: "POST",
      body: forged,
    });
    assert.equal(
      new URL(unauthorized.headers.get("location")!, origin).pathname,
      "/pending-approval",
    );
    const temporary = `TemporaryLocalTest_${marker}!`;
    const reset = await adminSession.submit(
      "/admin/users",
      { temporary_password: temporary },
      { name: "operation", value: "reset" },
      resetSelector,
    );
    assert.equal(reset.status, 200);
    assert.ok(
      (await reset.text()).includes(temporary),
      "Admin action did not return the temporary password",
    );
    const afterReset = await admin
      .from("profiles")
      .select("active,approval_pending,must_change_password")
      .eq("id", userId)
      .single();
    assert.deepEqual(afterReset.data, {
      active: false,
      approval_pending: true,
      must_change_password: true,
    });
    assert.equal(
      (
        await admin
          .from("password_reset_requests")
          .select("status")
          .eq("id", requestId)
          .single()
      ).data?.status,
      "resolved",
    );
    console.log(
      "PASS only admin can reset; temporary password leaves account pending and request resolved",
    );

    const temporarySession = new BrowserSession();
    const tempLogin = await temporarySession.submit("/login", {
      identifier: username,
      password: temporary,
    });
    assert.equal(tempLogin.headers.get("location"), "/pending-approval");
    const pendingChange = await temporarySession.request("/change-password");
    assert.ok(
      new URL(
        pendingChange.headers.get("location") ?? "/change-password",
        origin,
      ).pathname === "/pending-approval" ||
        (await pendingChange.text()).includes("/pending-approval"),
      "Pending account reached password-change form",
    );
    const approvalSelector = `form:has(input[name="id"][value="${userId}"]):has(button[value="approve"])`;
    const approved = await adminSession.submit(
      "/admin/users?active=pending",
      { role: "scout" },
      { name: "operation", value: "approve" },
      approvalSelector,
    );
    assert.equal(approved.status, 200);
    const forced = await admin
      .from("profiles")
      .select("active,approval_pending,must_change_password,role")
      .eq("id", userId)
      .single();
    assert.deepEqual(forced.data, {
      active: false,
      approval_pending: false,
      must_change_password: true,
      role: "scout",
    });
    assert.equal(
      new URL(
        (await temporarySession.request("/events")).headers.get("location")!,
        origin,
      ).pathname,
      "/change-password",
    );
    const changed = await temporarySession.submit("/change-password", {
      password: newPassword,
      confirm_password: newPassword,
    });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get("location"), "/events");
    assert.equal(
      (
        await admin
          .from("profiles")
          .select("active,must_change_password")
          .eq("id", userId)
          .single()
      ).data?.active,
      true,
    );
    assert.equal((await temporarySession.request("/events")).status, 200);
    for (const identifier of [email, username]) {
      const login = new BrowserSession();
      assert.equal(
        (
          await login.submit("/login", { identifier, password: newPassword })
        ).headers.get("location"),
        "/events",
      );
    }
    console.log(
      "PASS approval preserves forced change; new password clears flag and username/email login works",
    );
  } catch (error) {
    console.error(
      "Local authentication integration failed; credentials and provider bodies are omitted.",
    );
    if (error instanceof Error)
      console.error(
        error.stack
          ?.split("\n")
          .find((line) => line.includes("auth-integration")) ?? error.name,
      );
    process.exitCode = 1;
  } finally {
    if (userId) {
      await db.query(
        "delete from public.admin_account_audit where target_id=$1",
        [userId],
      );
      if ((await admin.auth.admin.deleteUser(userId)).error)
        process.exitCode = 1;
    }
    if (testAdminId) {
      await db.query(
        "delete from public.admin_account_audit where actor_id=$1 or target_id=$1",
        [testAdminId],
      );
      if ((await admin.auth.admin.deleteUser(testAdminId)).error)
        process.exitCode = 1;
    }
    await db.end();
    server.kill();
    writeFileSync("tsconfig.json", savedTsconfig);
    writeFileSync("next-env.d.ts", savedNextEnv);
  }
}
main().catch(() => {
  console.error("Local auth test setup failed; no secrets are logged.");
  process.exitCode = 1;
});
