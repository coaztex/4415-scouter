import "server-only";
import { notFound } from "next/navigation";
import { eventContext, getEvent } from "@/features/events/server/queries";
import { getCachedStatboticsMetrics } from "@/lib/statbotics/cache";
import { getCachedTbaMetrics } from "@/lib/tba/cache";
import {
  primaryRobotMedia,
  ROBOT_MEDIA_BUCKET,
} from "@/features/robot-media/model";
import { createServiceClient } from "@/lib/supabase/service";
import { TEAM_AVATAR_BUCKET } from "@/features/team-avatar/model";
import {
  enrichIncidents,
  incidentColumns,
  type IncidentRow,
} from "@/features/incidents/model";
import {
  buildScouting,
  emptyScouting,
  parsePit,
  type TeamDirectoryRow,
} from "../model";

export async function getTeamDirectory(
  eventKey: string,
  includeAvatars = false,
  focusTeamNumber?: number,
) {
  const event = await getEvent(eventKey),
    { db, profile } = await eventContext();
  if (event.game_slug !== "2026-rebuilt")
    throw new Error("This team directory requires the 2026 REBUILT module.");
  let membersQuery = db
    .from("event_teams")
    .select("team_number,pit_status")
    .eq("event_id", event.id)
    .limit(1000);
  let teamsQuery = db
    .from("teams")
    .select("team_number,nickname,city,state,country,website,rookie_year")
    .limit(10000);
  let rankingsQuery = db
    .from("event_rankings")
    .select("team_number,rank,wins,losses,ties,ranking_score")
    .eq("event_id", event.id)
    .limit(1000);
  let submissionsQuery = db
    .from("match_scouting_submissions")
    .select("id,match_id,team_number,game_data,completed_at")
    .eq("event_id", event.id)
    .eq("status", "final")
    .eq("game_slug", "2026-rebuilt")
    .eq("schema_version", 2)
    .limit(5000);
  let pitQuery = db
    .from("pit_scouting_submissions")
    .select("team_number,game_data")
    .eq("event_id", event.id)
    .eq("status", "final")
    .eq("game_slug", "2026-rebuilt")
    .eq("schema_version", 2)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  let avatarsQuery = db
    .from("team_avatars")
    .select("team_number,storage_path")
    .eq("event_id", event.id)
    .limit(1000);
  if (focusTeamNumber !== undefined) {
    membersQuery = membersQuery.eq("team_number", focusTeamNumber);
    teamsQuery = teamsQuery.eq("team_number", focusTeamNumber);
    rankingsQuery = rankingsQuery.eq("team_number", focusTeamNumber);
    submissionsQuery = submissionsQuery.eq("team_number", focusTeamNumber);
    pitQuery = pitQuery.eq("team_number", focusTeamNumber);
    avatarsQuery = avatarsQuery.eq("team_number", focusTeamNumber);
  }
  const [
    members,
    teams,
    rankings,
    submissions,
    matches,
    pitReports,
    avatars,
    statbotics,
    tba,
  ] = await Promise.all([
    membersQuery,
    teamsQuery,
    rankingsQuery,
    submissionsQuery,
    db
      .from("matches")
      .select("id,tba_match_key,match_number,set_number,comp_level")
      .eq("event_id", event.id)
      .limit(1000),
    pitQuery,
    includeAvatars ? avatarsQuery : Promise.resolve({ data: [], error: null }),
    getCachedStatboticsMetrics(db, event.id, event.tba_key, focusTeamNumber),
    getCachedTbaMetrics(db, event.id, event.year, focusTeamNumber),
  ]);
  for (const result of [
    members,
    teams,
    rankings,
    submissions,
    matches,
    pitReports,
    avatars,
  ])
    if (result.error) throw new Error("Team directory unavailable.");
  const memberRows = members.data ?? [],
    teamRows = teams.data ?? [],
    rankingRows = rankings.data ?? [],
    submissionRows = submissions.data ?? [],
    matchRows = matches.data ?? [];
  const teamMap = new Map(teamRows.map((row) => [row.team_number, row])),
    rankMap = new Map(rankingRows.map((row) => [row.team_number, row]));
  const avatarUrls = new Map<number, string>();
  if (includeAvatars && avatars.data?.length) {
    const signed = await createServiceClient()
      .storage.from(TEAM_AVATAR_BUCKET)
      .createSignedUrls(
        avatars.data.map((item) => item.storage_path),
        3600,
      );
    if (signed.data) {
      const byPath = new Map(
        signed.data
          .filter((item) => item.signedUrl)
          .map((item) => [item.path, item.signedUrl!]),
      );
      for (const item of avatars.data) {
        const url = byPath.get(item.storage_path);
        if (url) avatarUrls.set(item.team_number, url);
      }
    }
  }
  const statMap = new Map(statbotics.map((row) => [row.team_number, row])),
    tbaMap = new Map(tba.map((row) => [row.team_number, row]));
  const pitMap = new Map<number, NonNullable<ReturnType<typeof parsePit>>>();
  for (const report of pitReports.data ?? []) {
    if (pitMap.has(report.team_number)) continue;
    const parsed = parsePit(report.game_data);
    if (parsed) pitMap.set(report.team_number, parsed);
  }
  const scouting = buildScouting(event.id, submissionRows, matchRows);
  const rows: TeamDirectoryRow[] = memberRows.map((member) => {
    const team = teamMap.get(member.team_number),
      rank = rankMap.get(member.team_number),
      stat = statMap.get(member.team_number),
      tbaRow = tbaMap.get(member.team_number);
    return {
      teamNumber: member.team_number,
      nickname: team?.nickname ?? null,
      avatarUrl: avatarUrls.get(member.team_number) ?? null,
      city: team?.city ?? null,
      state: team?.state ?? null,
      pitStatus: member.pit_status,
      pitMechanism:
        pitMap.get(member.team_number)?.primary_scoring_mechanism ?? "unknown",
      pitReported: pitMap.has(member.team_number),
      pitOtherType: pitMap.get(member.team_number)?.other_shooter_type ?? null,
      rank: rank?.rank ?? null,
      wins: rank?.wins ?? null,
      losses: rank?.losses ?? null,
      ties: rank?.ties ?? null,
      statbotics: stat
        ? {
            fetchedAt: stat.fetched_at,
            total: stat.epa_total,
            auto: stat.epa_auto,
            teleop: stat.epa_teleop,
            endgame: stat.epa_endgame,
            components: stat.components_2026 ?? {
              auto_fuel: null,
              auto_tower: null,
              transition_fuel: null,
              first_shift_fuel: null,
              second_shift_fuel: null,
              endgame_fuel: null,
              endgame_tower: null,
              teleop_fuel: null,
              total_fuel: null,
              total_tower: null,
            },
          }
        : null,
      tba: tbaRow
        ? {
            fetchedAt: tbaRow.fetched_at,
            opr: tbaRow.opr,
            dpr: tbaRow.dpr,
            ccwm: tbaRow.ccwm,
            components: tbaRow.components_2026 ?? {
              auto_fuel: null,
              teleop_fuel: null,
              total_fuel: null,
              auto_tower_points: null,
              endgame_tower_points: null,
              total_tower_points: null,
            },
          }
        : null,
      scouting: scouting.metrics.get(member.team_number) ?? emptyScouting(),
      observations: scouting.observations.get(member.team_number) ?? [],
    };
  });
  return {
    event,
    profile,
    rows,
    pitMap,
    teamMap,
    matchMap: new Map(matchRows.map((match) => [match.id, match])),
  };
}

export async function getTeamDetail(eventKey: string, teamNumber: number) {
  const directory = await getTeamDirectory(eventKey, true, teamNumber),
    row = directory.rows.find((item) => item.teamNumber === teamNumber);
  if (!row) notFound();
  const { db } = await eventContext();
  const [pitRows, notes, profiles, incidents, media] = await Promise.all([
    db
      .from("pit_scouting_submissions")
      .select("id,game_data,completed_at,updated_at,scout_user_id")
      .eq("event_id", directory.event.id)
      .eq("team_number", teamNumber)
      .eq("status", "final")
      .eq("schema_version", 2)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(20),
    db
      .from("team_notes")
      .select("id,note,author_user_id,created_at,updated_at")
      .eq("event_id", directory.event.id)
      .eq("team_number", teamNumber)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("profiles").select("id,display_name,username").limit(1000),
    db
      .from("team_incidents")
      .select(incidentColumns)
      .eq("event_id", directory.event.id)
      .eq("team_number", teamNumber)
      .order("created_at")
      .limit(1000),
    db
      .from("robot_media")
      .select("id,source,storage_path,external_url,is_primary,created_at")
      .eq("event_id", directory.event.id)
      .eq("team_number", teamNumber)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (
    pitRows.error ||
    notes.error ||
    profiles.error ||
    incidents.error ||
    media.error
  )
    throw new Error("Team detail unavailable.");
  const mediaRows = await Promise.all(
    (media.data ?? []).map(async (item) => {
      if (!item.storage_path) return { ...item, url: item.external_url };
      const signed = await createServiceClient()
        .storage.from(ROBOT_MEDIA_BUCKET)
        .createSignedUrl(item.storage_path, 3600);
      return { ...item, url: signed.error ? null : signed.data.signedUrl };
    }),
  );
  const primary = primaryRobotMedia(mediaRows.filter((item) => item.url));
  const latestPit =
    pitRows.data
      .map((record) => ({ ...record, parsed: parsePit(record.game_data) }))
      .find((record) => record.parsed) ?? null;
  const authors = new Map(
    profiles.data.map((p) => [p.id, p.display_name || p.username]),
  );
  return {
    ...directory,
    row,
    latestPit,
    media: mediaRows,
    primaryMedia: primary,
    incidents: enrichIncidents(
      (incidents.data ?? []) as IncidentRow[],
      directory.matchMap,
      directory.teamMap,
      authors,
    ),
    notes: notes.data.map((note) => ({
      ...note,
      author: authors.get(note.author_user_id) ?? "Team member",
    })),
  };
}

export async function getScoutingRecord(
  eventKey: string,
  teamNumber: number,
  submissionId: string,
) {
  const detail = await getTeamDetail(eventKey, teamNumber);
  const { db } = await eventContext();
  const result = await db
    .from("match_scouting_submissions")
    .select("id,match_id,team_number,game_data,completed_at")
    .eq("id", submissionId)
    .eq("event_id", detail.event.id)
    .eq("team_number", teamNumber)
    .eq("status", "final")
    .eq("game_slug", "2026-rebuilt")
    .eq("schema_version", 2)
    .maybeSingle();
  if (result.error) throw new Error("Scouting record unavailable.");
  const record = result.data
    ? buildScouting(
        detail.event.id,
        [result.data],
        [...detail.matchMap.values()],
      ).observations.get(teamNumber)?.[0]
    : null;
  if (!record) notFound();
  return { ...detail, record };
}
