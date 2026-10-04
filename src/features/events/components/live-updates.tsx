"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  liveChangeEvents,
  liveChangeFilter,
  type LiveTable,
} from "../live-update-policy";

export function LiveUpdates({
  eventId,
  eventKey,
  tables,
  checkTba = false,
}: {
  eventId: string;
  eventKey?: string;
  tables: LiveTable[];
  checkTba?: boolean;
}) {
  const router = useRouter();
  const tableKey = tables.join(",");
  useEffect(() => {
    const db = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = db.channel(
      `live:${eventId}:${tableKey}:${Math.random().toString(36).slice(2)}`,
    );
    for (const table of tableKey.split(",") as LiveTable[]) {
      for (const event of liveChangeEvents(table)) {
        channel.on(
          "postgres_changes",
          {
            event,
            schema: "public",
            table,
            filter: liveChangeFilter(eventId, table),
          },
          () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => router.refresh(), 400);
          },
        );
      }
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [eventId, router, tableKey]);

  useEffect(() => {
    if (!checkTba || !eventKey) return;
    const check = () => {
      if (document.visibilityState === "visible")
        void fetch(
          `/api/events/${encodeURIComponent(eventKey)}/refresh-check`,
          { method: "POST" },
        ).catch(() => undefined);
    };
    check();
    const interval = setInterval(check, 120_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [checkTba, eventKey]);
  return null;
}
