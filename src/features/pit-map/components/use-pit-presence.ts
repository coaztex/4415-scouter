"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  connectPitPresence,
  emptyPitPresence,
  type PitPresenceSnapshot,
} from "../presence";

export function usePitPresence(
  eventId: string,
  teamNumber: number | null = null,
  enabled = true,
) {
  const [state, setState] = useState({
    eventId,
    teamNumber,
    snapshot: emptyPitPresence,
  });
  useEffect(() => {
    if (!enabled) return;
    let connection: ReturnType<typeof connectPitPresence> | undefined;
    let previous = "";
    const update = (value: PitPresenceSnapshot) => {
      const key = JSON.stringify(value);
      if (key !== previous) {
        previous = key;
        setState({ eventId, teamNumber, snapshot: value });
      }
    };
    const join = () => {
      try {
        connection = connectPitPresence(
          createClient(),
          eventId,
          teamNumber,
          update,
        );
      } catch {
        /* Optional configuration failure cannot block scouting. */
      }
    };
    join();
    const visibility = () =>
      connection?.visibility(document.visibilityState === "visible");
    const leave = () => {
      update(emptyPitPresence);
      connection?.dispose();
    };
    const restore = (e: PageTransitionEvent) => {
      if (e.persisted) {
        join();
        visibility();
      }
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", restore);
      connection?.dispose();
    };
  }, [eventId, teamNumber, enabled]);
  return enabled && state.eventId === eventId && state.teamNumber === teamNumber
    ? state.snapshot
    : emptyPitPresence;
}
