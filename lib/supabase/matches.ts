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
    resultScreenshotUrls: string[];
    winnerTeamId: string | null;
  };
  teamA: MatchRoomTeam;
  teamB: MatchRoomTeam;
  checkedInUserIds: string[];
  biometricVerifiedUserIds: string[];
  screenshotUploadedUserIds: string[];
};

export type MatchRoomFetchResult = {
  data: MatchRoomData | null;
  error: unknown | null;
};

type MatchRoomBaseRow = Pick<
  Database["public"]["Tables"]["tournament_matches"]["Row"],
  | "id"
  | "tournament_id"
  | "team_a_id"
  | "team_b_id"
  | "round_label"
  | "scheduled_at"
  | "status"
  | "team_a_score"
  | "team_b_score"
  | "format"
  | "lobby_name"
  | "lobby_password"
  | "result_screenshot_urls"
>;

type MatchRoomQueryRow = MatchRoomBaseRow & {
  result_screenshot_urls: string[] | null;
  winner_team_id?: string | null;
};

export type UserTeamMatch = {
  id: string;
  roundLabel: string;
  format: string;
  scheduledAt: string | null;
  status: string;
  teamAScore: number | null;
  teamAName: string;
  teamALogoUrl: string | null;
  teamBScore: number | null;
  teamBName: string;
  teamBLogoUrl: string | null;
  teamAId: string;
  teamBId: string;
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

  const initialMatchResult = await supabase
    .from("tournament_matches")
    .select(
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, lobby_name, lobby_password, result_screenshot_urls, winner_team_id"
    )
    .eq("id", matchId)
    .maybeSingle();
  let matchRow = initialMatchResult.data as MatchRoomQueryRow | null;
  let matchError = initialMatchResult.error;

  if (
    matchError?.message.includes("column tournament_matches.") &&
    matchError.message.includes("does not exist")
  ) {
    console.warn(
      "Match fetch is falling back to the legacy tournament_matches schema:",
      matchError.message
    );

    const legacyResult = await supabase
      .from("tournament_matches")
      .select(
        "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, lobby_name, lobby_password, result_screenshot_urls"
      )
      .eq("id", matchId)
      .maybeSingle();

    matchRow = legacyResult.data;
    matchError = legacyResult.error;
  }

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

  const typedMatch = matchRow as MatchRoomQueryRow;

  const { data: checkIns, error: checkInsError } = await supabase
    .from("match_check_ins")
    .select("player_id, biometric_verified, is_checked_in, lobby_screenshot_url")
    .eq("match_id", matchId);

  if (checkInsError) {
    console.error("Match check-ins fetch failed:", checkInsError);
  }

  const typedCheckIns = (checkIns ?? []) as Array<{
    player_id: string;
    biometric_verified: boolean;
    is_checked_in: boolean;
    lobby_screenshot_url: string | null;
  }>;
  const checkedInUserIds = typedCheckIns
    .filter((row) => row.is_checked_in)
    .map((row) => row.player_id);
  const biometricVerifiedUserIds = typedCheckIns
    .filter((row) => row.biometric_verified)
    .map((row) => row.player_id);
  const screenshotUploadedUserIds = typedCheckIns
    .filter((row) => Boolean(row.lobby_screenshot_url))
    .map((row) => row.player_id);

  const teamAId = typedMatch.team_a_id;
  const teamBId = typedMatch.team_b_id;
  const resultScreenshotUrls = Array.isArray(typedMatch.result_screenshot_urls)
    ? typedMatch.result_screenshot_urls.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0
      )
    : [];

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
        resultScreenshotUrls,
        winnerTeamId:
          typeof typedMatch.winner_team_id === "string"
            ? typedMatch.winner_team_id
            : null,
      },
      teamA,
      teamB,
      checkedInUserIds,
      biometricVerifiedUserIds,
      screenshotUploadedUserIds,
    },
    error: null,
  };
}

export async function getMatchesForUserTeam(userId: string): Promise<UserTeamMatch[]> {
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
      "id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, created_at"
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
    .select("id, name, logo_url")
    .in("id", teamIds);

  const teamNameById = new Map(
    (
      (teams ?? []) as Array<{ id: string; name: string; logo_url: string | null }>
    ).map((team) => [
      team.id,
      {
        name: team.name,
        logoUrl: team.logo_url,
      },
    ])
  );

  return (matches as Array<{
    id: string;
    team_a_id: string;
    team_b_id: string;
    round_label: string;
    scheduled_at: string | null;
    status: string;
    team_a_score: number | null;
    team_b_score: number | null;
    format: string;
  }>).map((m) => ({
    id: m.id,
    roundLabel: m.round_label,
    format: m.format,
    scheduledAt: m.scheduled_at,
    status: m.status,
    teamAScore: m.team_a_score,
    teamAName: teamNameById.get(m.team_a_id)?.name ?? "Team A",
    teamALogoUrl: teamNameById.get(m.team_a_id)?.logoUrl ?? null,
    teamBScore: m.team_b_score,
    teamBName: teamNameById.get(m.team_b_id)?.name ?? "Team B",
    teamBLogoUrl: teamNameById.get(m.team_b_id)?.logoUrl ?? null,
    teamAId: m.team_a_id,
    teamBId: m.team_b_id,
  }));
}
