import { z } from "zod";
import { isEventTimezone } from "@/features/events/timezone";

export const eventKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9]{4}[a-z0-9]+$/)
  .max(40);
export const teamKeySchema = z.string().regex(/^frc[1-9][0-9]*$/);
const text = z.string().nullable().optional();
const time = z.number().int().nonnegative().nullable().optional();
export const eventSchema = z.object({
  key: eventKeySchema,
  year: z.number().int(),
  name: z.string().min(1),
  short_name: text,
  event_type: z.number().int().nullable().optional(),
  city: text,
  state_prov: text,
  country: text,
  start_date: z.string().date().nullable().optional(),
  end_date: z.string().date().nullable().optional(),
  timezone: z.string().refine(isEventTimezone).nullish().catch(null),
});
export const teamSchema = z
  .object({
    key: teamKeySchema,
    team_number: z.number().int().positive(),
    nickname: text,
    name: text,
    city: text,
    state_prov: text,
    country: text,
    rookie_year: z.number().int().nullable().optional(),
    website: text,
  })
  .refine((team) => team.key === `frc${team.team_number}`);
const alliance = z.object({
  team_keys: z.array(teamKeySchema).max(3),
  surrogate_team_keys: z.array(teamKeySchema).optional(),
  dq_team_keys: z.array(teamKeySchema).optional(),
  score: z.number().int(),
});
export const matchSchema = z.object({
  key: z.string(),
  event_key: eventKeySchema,
  comp_level: z.enum(["qm", "ef", "qf", "sf", "f"]),
  set_number: z.number().int().positive(),
  match_number: z.number().int().positive(),
  time,
  predicted_time: time,
  actual_time: time,
  winning_alliance: z.enum(["", "red", "blue"]).nullable(),
  alliances: z.object({ red: alliance, blue: alliance }),
  // Retain source keys; season parsing happens outside the transport schema.
  score_breakdown: z.record(z.string(), z.json()).nullish(),
  post_result_time: time,
  videos: z
    .array(z.object({ type: z.string(), key: z.string().max(200) }))
    .nullish()
    .catch(null),
});
export const rankingsSchema = z
  .object({
    rankings: z
      .array(
        z.object({
          team_key: teamKeySchema,
          rank: z.number().int().positive(),
          record: z
            .object({
              wins: z.number().int().nonnegative(),
              losses: z.number().int().nonnegative(),
              ties: z.number().int().nonnegative(),
            })
            .nullable()
            .optional(),
          sort_orders: z.array(z.number()).optional(),
        }),
      )
      .nullable(),
    sort_order_info: z
      .array(z.object({ name: z.string(), precision: z.number().optional() }))
      .optional(),
  })
  .nullable();
const metricMap = z
  .record(teamKeySchema, z.number().finite())
  .nullable()
  .optional();
export const oprsSchema = z
  .object({ oprs: metricMap, dprs: metricMap, ccwms: metricMap })
  .nullable();
export const coprsSchema = z
  .record(z.string(), z.record(teamKeySchema, z.number().finite()))
  .nullable();
export const alliancesSchema = z
  .array(z.object({ name: text, picks: z.array(teamKeySchema).max(8) }))
  .nullable();
export const teamMediaSchema = z
  .array(
    z.object({
      type: z.string(),
      direct_url: z.string(),
      preferred: z.boolean().optional(),
      team_keys: z.array(teamKeySchema),
      details: z
        .object({ base64Image: z.string().max(300_000).optional() })
        .optional(),
    }),
  )
  .max(5000);
export type TbaEvent = z.infer<typeof eventSchema>;
