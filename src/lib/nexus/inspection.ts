import { z } from "zod";

export const nexusInspectionSchema = z.object({
  inspected: z.boolean().nullish(),
  status: z.string().trim().min(1).max(80).nullish(),
  queuePosition: z.number().int().positive().nullish(),
});
export type NexusInspection = z.infer<typeof nexusInspectionSchema>;
export type CachedNexusInspection = {
  value: NexusInspection;
  fetchedAt: string;
  stale: boolean;
};
const snapshotSchema = z.record(
  z.string().regex(/^[1-9]\d{0,5}$/),
  nexusInspectionSchema,
);
export function normalizeNexusInspection(input: unknown) {
  const snapshot = snapshotSchema.parse(input);
  if (Object.keys(snapshot).length > 2000)
    throw new Error("Nexus inspection response exceeds the supported size.");
  return snapshot;
}
export function inspectionLabel(value: NexusInspection) {
  const labels: Record<string, string> = {
    complete: "Complete",
    queued: "Queued",
    "not-started": "Not started",
    reinspection: "Reinspection",
    hold: "On hold",
  };
  const status = value.status
    ? (labels[value.status] ?? value.status)
    : value.inspected === true
      ? "Inspected"
      : value.inspected === false
        ? "Not inspected"
        : "Unknown";
  return `${status}${value.queuePosition != null ? ` · queue #${value.queuePosition}` : ""}`;
}
