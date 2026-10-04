import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import type { teamMediaSchema } from "@/lib/tba/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { TEAM_AVATAR_BUCKET, teamAvatarPath } from "../model";
import { prepareTbaAvatar } from "./image";

type TbaMedia = z.infer<typeof teamMediaSchema>[number];

/** Cache only TBA's designated team avatars; other event media remain robot media. */
export async function syncTbaTeamAvatars(
  eventId: string,
  media: readonly TbaMedia[],
  allowed: ReadonlySet<number>,
) {
  const svc = createServiceClient();
  const current = await svc
    .from("team_avatars")
    .select("team_number,storage_path")
    .eq("event_id", eventId)
    .limit(1000);
  if (current.error) throw current.error;
  const paths = new Map(
    current.data.map((row) => [row.team_number, row.storage_path]),
  );
  const candidates = new Map<number, TbaMedia[]>();
  for (const item of media
    .filter((entry) => entry.type === "avatar")
    .sort((a, b) => Number(b.preferred) - Number(a.preferred))) {
    for (const key of item.team_keys) {
      const teamNumber = Number(key.slice(3));
      if (allowed.has(teamNumber))
        candidates.set(teamNumber, [
          ...(candidates.get(teamNumber) ?? []),
          item,
        ]);
    }
  }
  let usable = 0;
  const entries = [...candidates.entries()];
  for (let start = 0; start < entries.length; start += 8) {
    await Promise.all(
      entries.slice(start, start + 8).map(async ([teamNumber, options]) => {
        let image: Buffer | null = null;
        for (const item of options) {
          image = await prepareTbaAvatar(item);
          if (image) break;
        }
        if (!image) return;
        usable++;
        const hash = createHash("sha256").update(image).digest("hex");
        const path = teamAvatarPath(eventId, teamNumber, hash);
        const oldPath = paths.get(teamNumber);
        if (oldPath === path) return;
        const uploaded = await svc.storage
          .from(TEAM_AVATAR_BUCKET)
          .upload(path, image, {
            contentType: "image/webp",
            cacheControl: "86400",
            upsert: true,
          });
        if (uploaded.error) throw uploaded.error;
        const saved = await svc.from("team_avatars").upsert(
          {
            event_id: eventId,
            team_number: teamNumber,
            storage_path: path,
            source: "tba",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "event_id,team_number" },
        );
        if (saved.error) {
          await svc.storage.from(TEAM_AVATAR_BUCKET).remove([path]);
          throw saved.error;
        }
        if (oldPath)
          await svc.storage.from(TEAM_AVATAR_BUCKET).remove([oldPath]);
      }),
    );
  }
  return usable;
}
