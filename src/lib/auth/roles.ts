import type { ProfileRole } from "@/types/database";
const rank: Record<ProfileRole, number> = { scout: 0, strategy: 1, admin: 2 };
export function isAtLeastRole(actual: ProfileRole, minimum: ProfileRole) {
  return rank[actual] >= rank[minimum];
}
