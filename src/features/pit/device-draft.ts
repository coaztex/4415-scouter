import { z } from "zod";
import { rebuiltPitBaseSchema } from "@/games/2026-rebuilt/pit-schema";
// Draft text may be incomplete; final submission still uses the canonical schema.
const routine = rebuiltPitBaseSchema.shape.autonomous_routines
  .unwrap()
  .element.extend({
    note: z.string().max(500).optional(),
    name: z.string().max(80).optional(),
  });
export const pitDeviceDraftSchema = z.object({
  data: rebuiltPitBaseSchema.extend({
    strategy_note: z.string().max(500).optional(),
    autonomous_routines: z.array(routine).max(20).nullable(),
  }),
  clientId: z.uuid(),
  revision: z.number().int().min(0),
  capacityMode: z.enum(["approximate_count", "band"]),
  numeric: z.string().max(50),
  weightNumeric: z.string().max(50).optional(),
  claimed: z.boolean(),
});
export function pitDraftKey(
  actorId: string,
  eventId: string,
  teamNumber: number,
) {
  return `pit:${actorId}:${eventId}:${teamNumber}`;
}
