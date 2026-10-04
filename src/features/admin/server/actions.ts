"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { AdminOperationError } from "./provision-account";
import { createAccount, saveAccount } from "./accounts";
import { expectedProfile, roles, type AdminState } from "../schemas";
import { isEventTimezone } from "@/features/events/timezone";
import { resolvePasswordReset, dismissPasswordReset } from "./password-resets";

export async function passwordResetDecisionAction(
  _previous: AdminState & { temporaryPassword?: string },
  form: FormData,
): Promise<AdminState & { temporaryPassword?: string }> {
  try {
    await requireRole("admin");
    const operation = z.enum(["reset", "dismiss"]).parse(form.get("operation"));
    if (operation === "dismiss") {
      await dismissPasswordReset(form.get("id"));
      revalidatePath("/admin/users");
      return { message: "Request dismissed." };
    }
    const result = await resolvePasswordReset(
      form.get("id"),
      form.get("temporary_password"),
    );
    return result;
  } catch (error) {
    return {
      error:
        error instanceof AdminOperationError
          ? error.message
          : error instanceof z.ZodError
            ? "Use a temporary password of 16–128 characters, or leave it blank to generate one."
            : "Reset request could not be processed.",
    };
  }
}

export async function eventTimezoneAction(
  _previous: AdminState,
  form: FormData,
): Promise<AdminState> {
  try {
    const { db } = await requireRole("admin");
    const id = z.uuid().parse(form.get("id"));
    const timezone = z
      .string()
      .trim()
      .max(100)
      .refine(isEventTimezone)
      .parse(form.get("timezone"));
    const result = await db
      .from("events")
      .update({ timezone, timezone_source: "admin" })
      .eq("id", id)
      .select("tba_key")
      .single();
    if (result.error) return { error: "Event timezone could not be saved." };
    revalidatePath("/admin/events");
    revalidatePath(`/events/${result.data.tba_key}`, "layout");
    return {
      message: "Event timezone saved. Stored timestamps are unchanged.",
    };
  } catch {
    return {
      error: "Enter an IANA timezone such as America/Los_Angeles, or UTC.",
    };
  }
}

export async function accountAction(
  _previous: AdminState,
  form: FormData,
): Promise<AdminState> {
  try {
    await requireRole("admin");
    if (form.get("confirmed") !== "yes")
      return { error: "Review and confirm this account change." };
    const operation = z.enum(["create", "update"]).parse(form.get("operation"));
    const fields = {
      display_name: form.get("display_name"),
      username: form.get("username"),
      role: form.get("role"),
    };
    if (operation === "create") {
      await createAccount({
        ...fields,
        email: form.get("email"),
        password: form.get("password"),
      });
    } else {
      const access = z
        .enum(["true", "false", "change"])
        .parse(form.get("active"));
      const before = expectedProfile.parse(
        JSON.parse(z.string().parse(form.get("expected"))),
      );
      if (access === "change" && !before.must_change_password)
        return { error: "This account changed. Refresh and review it again." };
      await saveAccount(
        z.string().parse(form.get("id")),
        {
          ...fields,
          active: access !== "false",
          approval_pending:
            access !== "false"
              ? false
              : form.get("approval_pending") === "true",
        },
        before,
      );
    }
    revalidatePath("/", "layout");
    return {
      message:
        operation === "create"
          ? "Account created. Share the temporary password privately and ask the user to change it under Account."
          : "Account saved.",
    };
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError || error instanceof SyntaxError
          ? "Check the fields: username must be 3–40 letters/digits/underscores; temporary passwords need at least 16 characters."
          : error instanceof AdminOperationError ||
              error instanceof AuthorizationError
            ? error.message
            : "Account operation failed.",
    };
  }
}

export async function accountApprovalAction(
  _previous: AdminState,
  form: FormData,
): Promise<AdminState> {
  try {
    await requireRole("admin");
    const operation = z
      .enum(["approve", "reject"])
      .parse(form.get("operation"));
    const before = expectedProfile.parse(
      JSON.parse(z.string().parse(form.get("expected"))),
    );
    if (!before.approval_pending || before.active)
      return {
        error:
          "This account is no longer pending. Refresh and review it again.",
      };
    const role =
      operation === "approve"
        ? z.enum(roles).parse(form.get("role") ?? "scout")
        : "scout";
    await saveAccount(
      z.string().parse(form.get("id")),
      {
        ...before,
        active: operation === "approve",
        approval_pending: false,
        role,
      },
      before,
    );
    revalidatePath("/", "layout");
    return {
      message:
        operation === "approve"
          ? before.must_change_password
            ? "Account approved. The user must change the temporary password before access is enabled."
            : "Account approved."
          : "Request rejected. The account is disabled; its records are preserved.",
    };
  } catch (error) {
    return {
      error:
        error instanceof AdminOperationError ||
        error instanceof AuthorizationError
          ? error.message
          : "Account decision failed. Refresh and review the account.",
    };
  }
}

export async function eventStatusAction(
  _previous: AdminState,
  form: FormData,
): Promise<AdminState> {
  try {
    const { db } = await requireRole("admin");
    if (form.get("confirmed") !== "yes")
      return { error: "Confirm the event status change." };
    const id = z.uuid().parse(form.get("id"));
    const expected = z.enum(["active", "archived"]).parse(form.get("expected"));
    const next = expected === "active" ? "archived" : "active";
    const { data, error } = await db
      .from("events")
      .update({ status: next })
      .eq("id", id)
      .eq("status", expected)
      .select("tba_key")
      .maybeSingle();
    if (error || !data)
      return {
        error:
          "Event changed or could not be saved. Refresh and review it again.",
      };
    revalidatePath("/admin", "layout");
    revalidatePath("/events", "layout");
    return {
      message:
        next === "archived"
          ? "Event archived. Scouting records are preserved."
          : "Event is active.",
    };
  } catch {
    return { error: "An active admin and valid event are required." };
  }
}

export async function ourTeamAction(
  _previous: AdminState,
  form: FormData,
): Promise<AdminState> {
  try {
    const { db } = await requireRole("admin");
    const id = z.uuid().parse(form.get("id"));
    const raw = z.string().trim().parse(form.get("teamNumber"));
    const teamNumber =
      raw === "" ? null : z.coerce.number().int().positive().parse(raw);
    if (teamNumber !== null) {
      const member = await db
        .from("event_teams")
        .select("team_number")
        .eq("event_id", id)
        .eq("team_number", teamNumber)
        .maybeSingle();
      if (member.error || !member.data)
        return { error: "Choose a team on this event roster." };
    }
    const result = await db
      .from("events")
      .update({ our_team_number: teamNumber })
      .eq("id", id)
      .select("tba_key")
      .maybeSingle();
    if (result.error || !result.data)
      return { error: "Team setting could not be saved." };
    revalidatePath(`/events/${result.data.tba_key}/match-prep`);
    revalidatePath("/admin/events");
    return {
      message:
        teamNumber === null
          ? "Our team number cleared."
          : "Our team number saved.",
    };
  } catch {
    return { error: "Enter a positive team number or leave it blank." };
  }
}
