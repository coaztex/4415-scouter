import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTbaClient } from "@/lib/tba";
import { syncTbaEvent } from "./tba-sync";
import { tbaRepository } from "./tba-repository";
import { syncStatboticsForEvent } from "./statbotics-sync";
import { statboticsRepository } from "./statbotics-repository";
import { syncTbaRobotMedia } from "@/features/robot-media/server/tba";

/** Authorized actions/jobs share this orchestration; each provider commits independently. */
export async function syncEvent(
  db: SupabaseClient<Database>,
  key: string,
  gameSlug: string,
) {
  const tba = await syncTbaEvent(
    createTbaClient(),
    tbaRepository(db),
    key,
    gameSlug,
  );
  const statbotics = await syncStatboticsForEvent(
    { id: tba.eventId, tba_key: key },
    statboticsRepository(db),
  );
  const media = await syncTbaRobotMedia(tba.eventId, key)
    .then((counts) => ({ ok: true as const, ...counts }))
    .catch(() => ({ ok: false as const, robotCount: 0, avatarCount: 0 }));
  return { ...tba, statbotics, media };
}
