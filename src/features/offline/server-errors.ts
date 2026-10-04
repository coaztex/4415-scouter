import type { FailureKind } from "./model";
export function databaseFailure(code: string): FailureKind {
  if (["40001", "23505", "23514"].includes(code)) return "conflict";
  if (code === "42501") return "auth";
  return "transient";
}
