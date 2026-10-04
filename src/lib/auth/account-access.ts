import { isAtLeastRole } from "./roles";
import type { ProfileRole } from "@/types/database";

export type AccountAccess =
  "active" | "pending" | "password_change" | "disabled";
export function accountAccess(profile: {
  active: boolean;
  approval_pending: boolean;
  must_change_password?: boolean;
}): AccountAccess {
  if (profile.approval_pending) return "pending";
  if (profile.must_change_password) return "password_change";
  if (profile.active && !profile.approval_pending) return "active";
  return "disabled";
}

export function hasProfileRole(
  profile: {
    active: boolean;
    approval_pending: boolean;
    must_change_password?: boolean;
    role: ProfileRole;
  },
  minimum: ProfileRole,
) {
  return (
    accountAccess(profile) === "active" && isAtLeastRole(profile.role, minimum)
  );
}

export function isAuthPage(pathname: string) {
  return [
    "/login",
    "/register",
    "/forgot-password",
    "/change-password",
    "/pending-approval",
  ].includes(pathname);
}
