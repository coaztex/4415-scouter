import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/server";
import { serviceClient } from "./accounts";
import { AdminOperationError } from "./provision-account";
import { temporaryPassword } from "../schemas";

export async function pendingPasswordResets(page = 1) {
  await requireRole("admin");
  const admin = serviceClient();
  const result = await admin
    .from("password_reset_requests")
    .select("id,user_id,requested_at", { count: "exact" })
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .range((page - 1) * 25, page * 25 - 1);
  if (result.error) throw new Error("Reset requests unavailable.");
  const requests = await Promise.all(
    result.data.map(async (request) => {
      const [profile, account] = await Promise.all([
        admin
          .from("profiles")
          .select(
            "username,display_name,active,approval_pending,must_change_password",
          )
          .eq("id", request.user_id)
          .single(),
        admin.auth.admin.getUserById(request.user_id),
      ]);
      if (profile.error || !profile.data || account.error)
        throw new Error("Reset request details unavailable.");
      return {
        ...request,
        ...profile.data,
        email: account.data.user.email ?? null,
      };
    }),
  );
  return { requests, count: result.count ?? 0, page };
}

export async function resolvePasswordReset(
  requestId: unknown,
  preferredPassword: unknown,
) {
  const { profile } = await requireRole("admin");
  const id = z.uuid().parse(requestId);
  const password =
    preferredPassword === "" || preferredPassword === null
      ? randomBytes(27).toString("base64url")
      : temporaryPassword.parse(preferredPassword);
  const admin = serviceClient();
  const staged = await admin.rpc("begin_admin_password_reset", {
    actor_id: profile.id,
    request_id: id,
  });
  if (staged.error || !staged.data)
    throw new AdminOperationError(
      staged.error?.message?.includes("last_active_admin")
        ? "Promote another active admin before resetting the last admin's password."
        : "This reset request or account changed. Refresh and review it again.",
    );
  const updated = await admin.auth.admin.updateUserById(staged.data, {
    password,
  });
  if (updated.error)
    throw new AdminOperationError(
      "Supabase could not set the temporary password. The request remains pending; retry the reset.",
    );
  const finished = await admin.rpc("finish_admin_password_reset", {
    actor_id: profile.id,
    request_id: id,
  });
  if (finished.error)
    return {
      temporaryPassword: password,
      message:
        "Password changed, but request status could not be saved. Share this temporary password privately and review the pending request.",
    };
  return {
    temporaryPassword: password,
    message:
      "Temporary password set. Share it privately. It is shown only in this response.",
  };
}

export async function dismissPasswordReset(requestId: unknown) {
  const { profile } = await requireRole("admin");
  const id = z.uuid().parse(requestId);
  const result = await serviceClient().rpc("dismiss_admin_password_reset", {
    actor_id: profile.id,
    request_id: id,
  });
  if (result.error)
    throw new AdminOperationError(
      "This request changed. Refresh and review it again.",
    );
}
