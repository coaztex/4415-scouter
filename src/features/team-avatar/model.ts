export const TEAM_AVATAR_BUCKET = "team-avatars";
export const MAX_AVATAR_BYTES = 64 * 1024;

export function teamAvatarPath(
  eventId: string,
  teamNumber: number,
  hash: string,
) {
  if (
    !/^[0-9a-f-]{36}$/.test(eventId) ||
    !Number.isSafeInteger(teamNumber) ||
    teamNumber <= 0 ||
    !/^[0-9a-f]{64}$/.test(hash)
  )
    throw new Error("Invalid team avatar identity.");
  return `${eventId}/${teamNumber}/${hash}.webp`;
}

export function avatarBase64(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const row = input as { type?: unknown; details?: { base64Image?: unknown } };
  const value = row.details?.base64Image;
  if (
    row.type !== "avatar" ||
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 300_000 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    return null;
  return value;
}
