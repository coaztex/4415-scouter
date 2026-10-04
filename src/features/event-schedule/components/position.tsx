"use client";

import { useEffect, useRef } from "react";

export function SchedulePosition({
  targetId,
  label,
}: {
  targetId: string | null;
  label: string;
}) {
  const positioned = useRef(false);
  const jump = () => {
    if (targetId)
      document
        .getElementById(targetId)
        ?.scrollIntoView({ block: "center", behavior: "auto" });
  };
  useEffect(() => {
    if (!targetId || positioned.current) return;
    positioned.current = true;
    const frame = requestAnimationFrame(jump);
    return () => cancelAnimationFrame(frame);
    // Position once on entry; incoming Realtime updates must not move a reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);
  if (!targetId) return null;
  return (
    <button
      type="button"
      onClick={jump}
      className="min-h-11 rounded-control border border-border-strong bg-surface px-2 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-subtle"
    >
      Jump to {label}
    </button>
  );
}
