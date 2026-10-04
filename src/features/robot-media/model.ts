export const ROBOT_MEDIA_BUCKET = "robot-media";
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTOS_PER_TEAM = 4;

export function robotMediaPath(
  eventId: string,
  teamNumber: number,
  id: string,
) {
  if (
    !/^[0-9a-f-]{36}$/.test(eventId) ||
    !/^[0-9a-f-]{36}$/.test(id) ||
    !Number.isSafeInteger(teamNumber) ||
    teamNumber <= 0
  )
    throw new Error("Invalid robot media identity.");
  return `${eventId}/${teamNumber}/${id}.jpg`;
}

/** Only direct image media from TBA's image host is displayed as a robot photo. */
export function tbaRobotImage(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (row.type !== "imgur" || typeof row.direct_url !== "string") return null;
  try {
    const url = new URL(row.direct_url);
    return url.protocol === "https:" &&
      url.hostname === "i.imgur.com" &&
      /^\/[A-Za-z0-9]+\.(jpe?g|png|webp)$/.test(url.pathname) &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function primaryRobotMedia<
  T extends { source: string; is_primary: boolean; created_at: string },
>(rows: readonly T[]): T | null {
  return (
    [...rows].sort(
      (a, b) =>
        Number(b.source === "pit_upload") - Number(a.source === "pit_upload") ||
        Number(b.is_primary) - Number(a.is_primary) ||
        b.created_at.localeCompare(a.created_at),
    )[0] ?? null
  );
}
