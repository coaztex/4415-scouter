"use client";

import { EventContextBridge } from "@/components/layout/workspace-shell";

export function EventNavigation({
  eventKey,
  label,
}: {
  eventKey: string;
  label: string;
}) {
  return <EventContextBridge eventKey={eventKey} label={label} />;
}
