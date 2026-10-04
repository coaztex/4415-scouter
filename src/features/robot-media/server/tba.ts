import "server-only";
import { createTbaClient } from "@/lib/tba";
import { createServiceClient } from "@/lib/supabase/service";
import { tbaRobotImage } from "../model";
import { syncTbaTeamAvatars } from "@/features/team-avatar/server/tba";

/** Optional image cache: TBA media outages never erase existing photos or fail match sync. */
export async function syncTbaRobotMedia(eventId: string, eventKey: string) {
  const response = await createTbaClient().teamMedia(eventKey);
  if (!response.data) return 0;
  const svc = createServiceClient();
  const roster = await svc
    .from("event_teams")
    .select("team_number")
    .eq("event_id", eventId)
    .limit(1000);
  if (roster.error) throw roster.error;
  const allowed = new Set(roster.data.map((row) => row.team_number));
  const rows = response.data.flatMap((item) => {
    const url = tbaRobotImage(item);
    if (!url) return [];
    return item.team_keys.flatMap((key) => {
      const teamNumber = Number(key.slice(3));
      return allowed.has(teamNumber)
        ? [
            {
              event_id: eventId,
              team_number: teamNumber,
              external_url: url,
              source: "tba" as const,
              media_type: "robot_photo",
              is_primary: false,
            },
          ]
        : [];
    });
  });
  const unique = [
    ...new Map(
      rows.map((row) => [`${row.team_number}:${row.external_url}`, row]),
    ).values(),
  ];
  if (unique.length) {
    const current = await svc
      .from("robot_media")
      .select("team_number,external_url")
      .eq("event_id", eventId)
      .eq("source", "tba")
      .limit(5000);
    if (current.error) throw current.error;
    const seen = new Set(
      current.data.map((row) => `${row.team_number}:${row.external_url}`),
    );
    const missing = unique.filter(
      (row) => !seen.has(`${row.team_number}:${row.external_url}`),
    );
    if (missing.length) {
      const saved = await svc.from("robot_media").insert(missing);
      if (saved.error && saved.error.code !== "23505") throw saved.error;
    }
  }
  const avatarCount = await syncTbaTeamAvatars(eventId, response.data, allowed);
  return { robotCount: unique.length, avatarCount };
}
