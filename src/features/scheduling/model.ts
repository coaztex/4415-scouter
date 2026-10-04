import { z } from "zod";
const uuid = z.uuid();
export const slotSchema = z.object({
  team_number: z.number().int().positive(),
  alliance: z.enum(["red", "blue"]),
  station: z.number().int().min(1).max(3),
});
export const scheduleMatchSchema = z.object({
  id: uuid,
  key: z.string(),
  comp_level: z.enum(["qm", "ef", "qf", "sf", "f"]),
  match_number: z.number().int(),
  set_number: z.number().int(),
  sequence: z.number().int(),
  scheduled_time: z.string().nullable(),
  actual_time: z.string().nullable(),
  stations: z.array(slotSchema),
});
export const assignmentSchema = z.object({
  id: uuid,
  match_id: uuid.nullable(),
  break_match_id: uuid.nullable(),
  team_number: z.number().int().nullable(),
  scout_user_id: uuid,
  assignment_type: z.enum(["match", "break"]),
  status: z.enum(["assigned", "in_progress", "submitted", "missed"]),
  sequence: z.number().int(),
  has_submission: z.boolean(),
  has_final: z.boolean(),
  scout_name: z.string(),
});
export const scheduleSnapshotSchema = z.object({
  version: z.string(),
  observationVersion: z.string().default(""),
  data: z.object({
    event: z.object({
      id: uuid,
      tba_key: z.string(),
      name: z.string(),
      status: z.enum(["active", "archived"]),
    }),
    scouts: z.array(
      z.object({
        id: uuid,
        display_name: z.string(),
        username: z.string(),
        role: z.enum(["scout", "strategy", "admin"]),
      }),
    ),
    matches: z.array(scheduleMatchSchema),
    assignments: z.array(assignmentSchema),
    observations: z
      .array(
        z.object({
          team_number: z.number().int().positive(),
          count: z.number().int().nonnegative(),
        }),
      )
      .default([]),
  }),
});
export type ScheduleSnapshot = z.infer<typeof scheduleSnapshotSchema>;
export type ScheduleAssignment = z.infer<typeof assignmentSchema>;
export type ScheduleMatch = z.infer<typeof scheduleMatchSchema>;
export const generateConfigSchema = z.strictObject({
  matchIds: z
    .array(uuid)
    .min(1)
    .max(200)
    .refine((v) => new Set(v).size === v.length),
  scoutIds: z
    .array(uuid)
    .min(1)
    .max(100)
    .refine((v) => new Set(v).size === v.length),
  maxConsecutive: z.number().int().min(1).max(20),
  replaceMode: z
    .enum(["fill_gaps", "replace_editable"])
    .default("replace_editable"),
});
export type GenerateConfig = z.infer<typeof generateConfigSchema>;
export const planRowSchema = z.strictObject({
  id: uuid.nullable(),
  slot_match_id: uuid,
  team_number: z.number().int().positive().nullable(),
  scout_user_id: uuid,
  assignment_type: z.enum(["match", "break"]),
  status: z.enum(["assigned", "missed"]),
});
export type PlanRow = z.infer<typeof planRowSchema>;
export type PlanOperations = { remove_ids: string[]; rows: PlanRow[] };
export function assignmentSlot(a: ScheduleAssignment) {
  return a.match_id ?? a.break_match_id;
}
export function isProtected(a: ScheduleAssignment) {
  return (
    a.status === "submitted" || a.status === "in_progress" || a.has_submission
  );
}
export function retainedByGenerator(a: ScheduleAssignment) {
  return isProtected(a) || a.status === "missed";
}
export type PreviewRow = {
  slot_match_id: string;
  team_number: number | null;
  scout_user_id: string;
  assignment_type: "match" | "break";
  status: ScheduleAssignment["status"];
  retained: boolean;
};
export type SchedulePreview = {
  rows: PreviewRow[];
  warnings: string[];
  summary: {
    scouts: number;
    matches: number;
    desiredSlots: number;
    coveredSlots: number;
    coveragePercent: number;
    uncovered: { matchId: string; matchKey: string; teamNumber: number }[];
    teamsCovered: number;
    teamsInRange: number;
    teamDistribution: {
      teamNumber: number;
      planned: number;
      observed: number;
    }[];
    averageAssignments: number;
    minimumAssignments: number;
    maximumAssignments: number;
  };
  workloads: {
    scoutId: string;
    assignments: number;
    assignmentsInRange: number;
    breakBlocks: { first: string; last: string; length: number }[];
    longestRun: number;
  }[];
  operations: PlanOperations;
};
export type ScheduleActionState = {
  error?: string;
  message?: string;
  preview?: SchedulePreview;
  config?: GenerateConfig;
  version?: string;
  observationVersion?: string;
};
