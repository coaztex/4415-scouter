import { z } from "zod";

// Nexus supports official, offseason and arbitrary demo keys, not just TBA keys.
export const nexusEventKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
export function nexusEventKey(event: {
  tba_key: string;
  nexus_event_key?: string | null;
}) {
  return nexusEventKeySchema.parse(event.nexus_event_key ?? event.tba_key);
}
