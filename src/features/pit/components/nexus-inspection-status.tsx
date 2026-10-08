import {
  inspectionLabel,
  type CachedNexusInspection,
} from "@/lib/nexus/inspection";

export function NexusInspectionStatus({
  inspection,
}: {
  inspection: CachedNexusInspection | null;
}) {
  return (
    <p
      className="mt-2 text-sm"
      title={inspection ? `Nexus snapshot: ${inspection.fetchedAt}` : undefined}
    >
      Inspection (Nexus):{" "}
      {inspection ? inspectionLabel(inspection.value) : "Unavailable"}
      {inspection?.stale && (
        <span className="text-muted">
          {" "}
          · cached; check Nexus for current status
        </span>
      )}
    </p>
  );
}
