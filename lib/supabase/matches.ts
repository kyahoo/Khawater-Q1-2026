import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { getTeamMembers } from "@/lib/supabase/teams";

export type MatchRoomTeam = {
  id: string;
  name: string;
  roster: Array<{
    userId: string;
    nickname: string;
    isCaptain: boolean;
  }>;
};

export type MatchRoomData = {
  match: {
    id: string;
    roundLabel: string;
    format: string;
    scheduledAt: string | null;
    status: string;
    teamAScore: number | null;
    teamBScore: number | null;
    lobbyName: string | null;
    lobbyPassword: string | null;
  };
  teamA: MatchRoomTeam;
  teamB: MatchRoomTeam;
  checkedInUserIds: string[];
  biometricVerifiedUserIds: string[];
};

export type MatchRoomFetchResult = {
  data: MatchRoomData | null;
  error: unknown | null;
};

async function getMatchRoomTeam(params: {
  teamId: string;
  fallbackName: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data: teamRow, error: teamError } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", params.teamId)
    .maybeSingle();

  if (teamError) {
    console.error("Match team fetch failed:", teamError);
  }

  let roster = [] as MatchRoomTeam["roster"];

  try {
    const teamMembers = await getTeamMembers(params.teamId);
    roster = teamMembers.map((member) => ({
      userId: member.userId,
      nickname: member.nickname,
      isCaptain: member.isCaptain,
    }));
  } catch (rosterError) {
    console.error("Match roster fetch failed:", rosterError);
  }

  return {
    id: teamRow?.id ?? params.teamId,
    name: teamRow?.name ?? params.fallbackName,
    roster,
  };
}

export async function getMatchRoomData(matchId: string): Promise<MatchRoomFetchResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: matchRow, error: matchError } = await supabase
    .from("tournament_matches")
    .select(
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, lobby_name, lobby_password"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) {
    console.error("Match fetch failed:", matchError);
    return {
      data: null,
      error: matchError,
    };
  }

  if (!matchRow) {
    const notFoundError = new Error(`No tournament match found for id ${matchId}.`);
    console.error("Match fetch failed:", notFoundError);
    return {
      data: null,
      error: notFoundError,
    };
  }

  const typedMatch = matchRow as Database["public"]["Tables"]["tournament_matches"]["Row"];

  const { data: checkIns, error: checkInsError } = await supabase
    .from("match_check_ins")
    .select("player_id, biometric_verified")
    .eq("match_id", matchId);

  if (checkInsError) {
    console.error("Match check-ins fetch failed:", checkInsError);
  }

  const typedCheckIns =
    (checkIns ?? []) as Array<{ player_id: string; biometric_verified: boolean }>;
  const checkedInUserIds = typedCheckIns.map((row) => row.player_id);
  const biometricVerifiedUserIds = typedCheckIns
    .filter((row) => row.biometric_verified)
    .map((row) => row.player_id);

  const teamAId = typedMatch.team_a_id;
  const teamBId = typedMatch.team_b_id;

  const [teamA, teamB] = await Promise.all([
    getMatchRoomTeam({
      teamId: teamAId,
      fallbackName: "Team A",
    }),
    getMatchRoomTeam({
      teamId: teamBId,
      fallbackName: "Team B",
    }),
  ]);

  return {
    data: {
      match: {
        id: typedMatch.id,
        roundLabel: typedMatch.round_label,
        format: typedMatch.format,
        scheduledAt: typedMatch.scheduled_at,
        status: typedMatch.status,
        teamAScore: typedMatch.team_a_score,
        teamBScore: typedMatch.team_b_score,
        lobbyName: typedMatch.lobby_name ?? null,
        lobbyPassword: typedMatch.lobby_password ?? null,
      },
      teamA,
      teamB,
      checkedInUserIds,
      biometricVerifiedUserIds,
    },
    error: null,
  };
}

export async function getMatchesForUserTeam(userId: string): Promise<
  Array<{
    id: string;
    roundLabel: string;
    format: string;
    scheduledAt: string | null;
    status: string;
    teamAName: string;
    teamBName: string;
    teamAId: string;
    teamBId: string;
  }>
> {
  const supabase = getSupabaseBrowserClient();

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership) {
    return [];
  }

  const teamId = (membership as { team_id: string }).team_id;

  const { data: activeTournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (tournamentError || !activeTournament) {
    return [];
  }

  const tournamentId = (activeTournament as { id: string }).id;

  const { data: matches, error: matchesError } = await supabase
    .from("tournament_matches")
    .select(
      "id, team_a_id, team_b_id, round_label, scheduled_at, status, format, created_at"
    )
    .eq("tournament_id", tournamentId)
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .order("scheduled_at", { ascending: true });

  if (matchesError || !matches?.length) {
    return [];
  }

  const teamIds = Array.from(
    new Set(
      (matches as Array<{ team_a_id: string; team_b_id: string }>).flatMap(
        (m) => [m.team_a_id, m.team_b_id]
      )
    )
  );

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", teamIds);

  const teamNameById = new Map(
    ((teams ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name])
  );

  return (matches as Array<{
    id: string;
    team_a_id: string;
    team_b_id: string;
    round_label: string;
    scheduled_at: string | null;
    status: string;
    format: string;
  }>).map((m) => ({
    id: m.id,
    roundLabel: m.round_label,
    format: m.format,
    scheduledAt: m.scheduled_at,
    status: m.status,
    teamAName: teamNameById.get(m.team_a_id) ?? "Team A",
    teamBName: teamNameById.get(m.team_b_id) ?? "Team B",
    teamAId: m.team_a_id,
    teamBId: m.team_b_id,
  }));
}
