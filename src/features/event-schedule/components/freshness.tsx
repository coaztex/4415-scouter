"use client";

import { useEffect, useState } from "react";
import { eventTime } from "@/features/events/timezone";
import { scheduleFreshness } from "../model";

export function FreshnessStatus({
  lastSync,
  initialNow,
  liveWindow,
  syncExpiresAt,
  staleAfterMs,
  timezone,
}: {
  lastSync: string | null;
  initialNow: number;
  liveWindow: boolean;
  syncExpiresAt: string | null;
  staleAfterMs: number;
  timezone: string;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(clock);
  }, []);
  const syncing = Boolean(syncExpiresAt && Date.parse(syncExpiresAt) > now);
  const freshness = scheduleFreshness(
    lastSync,
    now,
    liveWindow,
    syncing,
    staleAfterMs,
  );
  const localTime = eventTime(lastSync, timezone);
  return (
    <span>
      {freshness.label}
      {localTime ? ` · ${localTime}` : ""}
    </span>
  );
}
