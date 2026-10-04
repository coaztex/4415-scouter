import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/server";
import { getTeamDirectory } from "@/features/teams/server/queries";
import { pickTeam, stateSchema } from "../model";
import { snapshotSchema } from "../snapshot";

export async function getPicklist(eventKey: string, snapshotId?: string) {
  const { db } = await requireRole("strategy");
  const directory = await getTeamDirectory(eventKey);
  const [workspace, event, snapshots] = await Promise.all([
    db
      .from("event_picklists")
      .select("state,revision,updated_at")
      .eq("event_id", directory.event.id)
      .single(),
    db
      .from("events")
      .select("our_team_number")
      .eq("id", directory.event.id)
      .single(),
    db
      .from("picklist_snapshots")
      .select("id,name,created_at,revision")
      .eq("event_id", directory.event.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (workspace.error || event.error || snapshots.error)
    throw new Error(
      "Picklist unavailable. Check the event configuration and migrations.",
    );
  let snapshot = null;
  if (snapshotId) {
    if (!z.uuid().safeParse(snapshotId).success) notFound();
    const result = await db
      .from("picklist_snapshots")
      .select("id,name,created_at,revision,state,evidence")
      .eq("event_id", directory.event.id)
      .eq("id", snapshotId)
      .maybeSingle();
    if (result.error) throw new Error("Snapshot unavailable.");
    if (!result.data) notFound();
    snapshot = {
      ...result.data,
      state: stateSchema.parse(result.data.state),
      evidence: snapshotSchema.parse(result.data.evidence),
    };
  }
  return {
    event: directory.event,
    ownTeamNumber: event.data.our_team_number,
    teams: directory.rows.map(pickTeam),
    state: stateSchema.parse(workspace.data.state),
    revision: workspace.data.revision,
    snapshots: snapshots.data,
    snapshot,
  };
}
