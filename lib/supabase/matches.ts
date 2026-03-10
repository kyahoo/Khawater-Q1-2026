import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    checkInThreshold: number;
    scheduledAt: string | null;
    status: string;
    teamAScore: number | null;
    teamBScore: number | null;
    lobbyName: string | null;
    lobbyPassword: string | null;
    resultScreenshotUrls: string[];
    winnerTeamId: string | null;
    opponentNotified: boolean;
    reminder1hSent: boolean;
    reminder30mSent: boolean;
    isForfeit: boolean;
  };
  teamA: MatchRoomTeam;
  teamB: MatchRoomTeam;
  lobbyPhotos: Array<{
    playerId: string;
    mapNumber: number;
    photoUrl: string;
  }>;
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
  opponent_notified: boolean | null;
  reminder_1h_sent: boolean | null;
  reminder_30m_sent: boolean | null;
  is_forfeit: boolean | null;
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
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, lobby_name, lobby_password, result_screenshot_urls, winner_team_id, opponent_notified, reminder_1h_sent, reminder_30m_sent, is_forfeit"
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

    matchRow = legacyResult.data
      ? ({
          ...legacyResult.data,
          opponent_notified: null,
          reminder_1h_sent: null,
          reminder_30m_sent: null,
          is_forfeit: null,
        } as MatchRoomQueryRow)
      : null;
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
  let checkInThreshold = 10;

  const tournamentThresholdResult = await supabase
    .from("tournaments")
    .select("check_in_threshold")
    .eq("id", typedMatch.tournament_id)
    .maybeSingle();

  if (
    tournamentThresholdResult.error?.message.includes(
      "column tournaments.check_in_threshold does not exist"
    )
  ) {
    console.warn(
      "Tournament fetch is falling back to the legacy tournaments schema:",
      tournamentThresholdResult.error.message
    );
  } else if (tournamentThresholdResult.error) {
    console.error("Tournament threshold fetch failed:", tournamentThresholdResult.error);
  } else if (
    tournamentThresholdResult.data &&
    typeof tournamentThresholdResult.data.check_in_threshold === "number"
  ) {
    checkInThreshold = Math.max(tournamentThresholdResult.data.check_in_threshold, 1);
  }

  const { data: checkIns, error: checkInsError } = await supabase
    .from("match_check_ins")
    .select(
      "player_id, biometric_verified, is_checked_in, is_ready, lobby_screenshot_url"
    )
    .eq("match_id", matchId);

  if (checkInsError) {
    console.error("Match check-ins fetch failed:", checkInsError);
  }

  const typedCheckIns = (checkIns ?? []) as Array<{
    player_id: string;
    biometric_verified: boolean;
    is_checked_in: boolean;
    is_ready: boolean;
    lobby_screenshot_url: string | null;
  }>;
  const checkedInUserIds = typedCheckIns
    .filter((row) => row.is_ready || row.is_checked_in)
    .map((row) => row.player_id);
  const biometricVerifiedUserIds = typedCheckIns
    .filter((row) => row.biometric_verified)
    .map((row) => row.player_id);

  let typedLobbyPhotos = [] as Array<{
    player_id: string;
    map_number: number;
    photo_url: string;
  }>;

  const { data: lobbyPhotos, error: lobbyPhotosError } = await supabase
    .from("match_lobby_photos")
    .select("player_id, map_number, photo_url")
    .eq("match_id", matchId);

  if (lobbyPhotosError) {
    console.error("Match lobby photos fetch failed:", lobbyPhotosError);
  } else {
    typedLobbyPhotos = (lobbyPhotos ?? []) as Array<{
      player_id: string;
      map_number: number;
      photo_url: string;
    }>;
  }

  if (typedLobbyPhotos.length === 0) {
    typedLobbyPhotos = typedCheckIns
      .filter((row) => Boolean(row.lobby_screenshot_url))
      .map((row) => ({
        player_id: row.player_id,
        map_number: 1,
        photo_url: row.lobby_screenshot_url as string,
      }));
  }

  const screenshotUploadedUserIds = Array.from(
    new Set(typedLobbyPhotos.map((row) => row.player_id))
  );

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
        checkInThreshold,
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
        opponentNotified: typedMatch.opponent_notified ?? false,
        reminder1hSent: typedMatch.reminder_1h_sent ?? false,
        reminder30mSent: typedMatch.reminder_30m_sent ?? false,
        isForfeit: typedMatch.is_forfeit ?? false,
      },
      teamA,
      teamB,
      lobbyPhotos: typedLobbyPhotos.map((row) => ({
        playerId: row.player_id,
        mapNumber: row.map_number,
        photoUrl: row.photo_url,
      })),
      checkedInUserIds,
      biometricVerifiedUserIds,
      screenshotUploadedUserIds,
    },
    error: null,
  };
}

export async function getMatchesForUserTeamWithClient(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<UserTeamMatch[]> {
  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }

  if (!membership) {
    return [];
  }

  const teamId = (membership as { team_id: string }).team_id;

  const { data: activeTournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (tournamentError) {
    throw tournamentError;
  }

  if (!activeTournament) {
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

  if (matchesError) {
    throw matchesError;
  }

  if (!matches?.length) {
    return [];
  }

  const teamIds = Array.from(
    new Set(
      (matches as Array<{ team_a_id: string; team_b_id: string }>).flatMap(
        (m) => [m.team_a_id, m.team_b_id]
      )
    )
  );

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, logo_url")
    .in("id", teamIds);

  if (teamsError) {
    throw teamsError;
  }

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

export async function getMatchesForUserTeam(userId: string): Promise<UserTeamMatch[]> {
  const supabase = getSupabaseBrowserClient();
  return getMatchesForUserTeamWithClient(supabase, userId);
}
