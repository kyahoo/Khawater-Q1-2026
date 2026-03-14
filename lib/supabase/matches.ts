import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  listPlayerMedalsForUsersWithClient,
  type PlayerMedalWithTournament,
} from "@/lib/supabase/player-medals";

function createLiveSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

export type MatchRoomTeam = {
  id: string;
  name: string;
  roster: Array<{
    userId: string;
    nickname: string;
    isCaptain: boolean;
    medals: PlayerMedalWithTournament[];
  }>;
};

export type MatchRoomData = {
  match: {
    id: string;
    roundLabel: string;
    format: string;
    adminOverride: boolean;
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
  admin_override?: boolean | null;
  result_screenshot_urls: string[] | null;
  winner_team_id?: string | null;
  opponent_notified: boolean | null;
  reminder_1h_sent: boolean | null;
  reminder_30m_sent: boolean | null;
  is_forfeit: boolean | null;
};

type MatchRoomTeamQueryRow = {
  id: string;
  name: string;
  team_members:
    | Array<{
        user_id: string;
        is_captain: boolean;
        created_at: string;
        profiles:
          | {
              id: string;
              nickname: string;
            }
          | Array<{
              id: string;
              nickname: string;
            }>
          | null;
      }>
    | null;
};

export type UserTeamMatch = {
  id: string;
  roundLabel: string;
  format: string;
  scheduledAt: string | null;
  status: string;
  adminOverride: boolean;
  teamAScore: number | null;
  teamAName: string;
  teamALogoUrl: string | null;
  teamACheckInCount: number;
  teamBScore: number | null;
  teamBName: string;
  teamBLogoUrl: string | null;
  teamBCheckInCount: number;
  teamAId: string;
  teamBId: string;
  userTeamId: string;
};

type UserTeamMatchQueryRow = {
  id: string;
  team_a_id: string;
  team_b_id: string;
  round_label: string;
  scheduled_at: string | null;
  status: string;
  admin_override?: boolean | null;
  team_a_score: number | null;
  team_b_score: number | null;
  format: string;
};

type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

type TeamMembershipRow = {
  team_id: string;
  user_id: string;
};

type MatchCheckInListRow = {
  match_id: string;
  player_id: string;
  is_checked_in: boolean;
  is_ready?: boolean | null;
};

export type UserTeamMatchTechnicalOutcome =
  | "technical-loss"
  | "technical-win"
  | "technical-double-forfeit";

export const REQUIRED_TEAM_CHECK_INS = 5;
export const PRE_MATCH_OPEN_WINDOW_MS = 30 * 60 * 1000;
export const MATCH_CHECK_IN_TIMEOUT_MS = 15 * 60 * 1000;

const almatyWallClockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Almaty",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function getAlmatyWallClockTimeMs(dateInput: string | Date) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = almatyWallClockFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);

  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function getCurrentAlmatyWallClockTimeMs() {
  return getAlmatyWallClockTimeMs(new Date()) ?? Date.now();
}

function normalizeMatchStatus(status: string) {
  return status.trim().toLowerCase();
}

export function isUserTeamMatchCompleted(
  match: Pick<UserTeamMatch, "status">
) {
  const normalizedStatus = normalizeMatchStatus(match.status);
  return normalizedStatus === "finished" || normalizedStatus === "completed";
}

export function getUserTeamMatchTechnicalOutcome(
  match: Pick<
    UserTeamMatch,
    | "adminOverride"
    | "scheduledAt"
    | "status"
    | "teamAId"
    | "teamACheckInCount"
    | "teamBId"
    | "teamBCheckInCount"
    | "userTeamId"
  >,
  currentTimeMs = getCurrentAlmatyWallClockTimeMs()
): UserTeamMatchTechnicalOutcome | null {
  if (match.adminOverride || isUserTeamMatchCompleted(match) || !match.scheduledAt) {
    return null;
  }

  const scheduledTimeMs = getAlmatyWallClockTimeMs(match.scheduledAt);

  if (
    scheduledTimeMs === null ||
    currentTimeMs <= scheduledTimeMs + MATCH_CHECK_IN_TIMEOUT_MS
  ) {
    return null;
  }

  const teamAMissingPlayers = match.teamACheckInCount < REQUIRED_TEAM_CHECK_INS;
  const teamBMissingPlayers = match.teamBCheckInCount < REQUIRED_TEAM_CHECK_INS;

  if (!teamAMissingPlayers && !teamBMissingPlayers) {
    return null;
  }

  const userTeamCheckInCount =
    match.userTeamId === match.teamAId
      ? match.teamACheckInCount
      : match.userTeamId === match.teamBId
        ? match.teamBCheckInCount
        : null;
  const opponentTeamCheckInCount =
    match.userTeamId === match.teamAId
      ? match.teamBCheckInCount
      : match.userTeamId === match.teamBId
        ? match.teamACheckInCount
        : null;

  if (
    userTeamCheckInCount !== null &&
    userTeamCheckInCount < REQUIRED_TEAM_CHECK_INS &&
    opponentTeamCheckInCount !== null &&
    opponentTeamCheckInCount >= REQUIRED_TEAM_CHECK_INS
  ) {
    return "technical-loss";
  }

  if (
    userTeamCheckInCount !== null &&
    userTeamCheckInCount >= REQUIRED_TEAM_CHECK_INS &&
    opponentTeamCheckInCount !== null &&
    opponentTeamCheckInCount < REQUIRED_TEAM_CHECK_INS
  ) {
    return "technical-win";
  }

  return "technical-double-forfeit";
}

export function isUserTeamMatchPast(
  match: UserTeamMatch,
  currentTimeMs = getCurrentAlmatyWallClockTimeMs()
) {
  return (
    isUserTeamMatchCompleted(match) ||
    getUserTeamMatchTechnicalOutcome(match, currentTimeMs) !== null
  );
}

export function isUserTeamMatchLive(
  match: UserTeamMatch,
  currentTimeMs = getCurrentAlmatyWallClockTimeMs()
) {
  if (!match.scheduledAt || isUserTeamMatchPast(match, currentTimeMs)) {
    return false;
  }

  const scheduledTimeMs = getAlmatyWallClockTimeMs(match.scheduledAt);

  if (scheduledTimeMs === null) {
    return false;
  }

  return currentTimeMs >= scheduledTimeMs - PRE_MATCH_OPEN_WINDOW_MS;
}

function normalizeMatchRoomTeam(params: {
  teamRow: MatchRoomTeamQueryRow | null;
  teamId: string;
  fallbackName: string;
  medalsByUserId: Record<string, PlayerMedalWithTournament[]>;
}) {
  const sortedMemberships = (params.teamRow?.team_members ?? []).slice().sort(
    (membershipA, membershipB) =>
      new Date(membershipA.created_at).getTime() -
      new Date(membershipB.created_at).getTime()
  );
  const roster = sortedMemberships.map((membership) => {
    const profile = Array.isArray(membership.profiles)
      ? membership.profiles[0]
      : membership.profiles;

    return {
      userId: membership.user_id,
      nickname: profile?.nickname ?? "Player",
      isCaptain: membership.is_captain,
      medals: params.medalsByUserId[membership.user_id] ?? [],
    };
  });

  return {
    id: params.teamRow?.id ?? params.teamId,
    name: params.teamRow?.name ?? params.fallbackName,
    roster,
  };
}

export async function getMatchRoomData(matchId: string): Promise<MatchRoomFetchResult> {
  if (typeof window === "undefined") {
    throw new Error(
      "getMatchRoomData must be called from the browser to perform a live Supabase query."
    );
  }

  const supabase = createLiveSupabaseBrowserClient();

  const initialMatchResult = await supabase
    .from("tournament_matches")
    .select(
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, lobby_name, lobby_password, result_screenshot_urls, winner_team_id, opponent_notified, reminder_1h_sent, reminder_30m_sent, is_forfeit, admin_override"
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

  const [tournamentThresholdResult, checkInsResult, lobbyPhotosResult, teamsResult] =
    await Promise.all([
      supabase
        .from("tournaments")
        .select("check_in_threshold")
        .eq("id", typedMatch.tournament_id)
        .maybeSingle(),
      supabase
        .from("match_check_ins")
        .select(
          "player_id, biometric_verified, is_checked_in, is_ready, lobby_screenshot_url"
        )
        .eq("match_id", matchId),
      supabase
        .from("match_lobby_photos")
        .select("player_id, map_number, photo_url")
        .eq("match_id", matchId),
      supabase
        .from("teams")
        .select(
          "id, name, team_members(user_id, is_captain, created_at, profiles(id, nickname))"
        )
        .in("id", [typedMatch.team_a_id, typedMatch.team_b_id]),
    ]);

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

  const checkIns = checkInsResult.data;
  const checkInsError = checkInsResult.error;

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

  const lobbyPhotos = lobbyPhotosResult.data;
  const lobbyPhotosError = lobbyPhotosResult.error;

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
  const teamRows = (teamsResult.data ?? []) as unknown as MatchRoomTeamQueryRow[];
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const rosterUserIds = teamRows.flatMap((team) =>
    (team.team_members ?? []).map((membership) => membership.user_id)
  );
  let medalsByUserId = {} as Record<string, PlayerMedalWithTournament[]>;

  if (teamsResult.error) {
    console.error("Match teams fetch failed:", teamsResult.error);
  }

  try {
    medalsByUserId = await listPlayerMedalsForUsersWithClient(supabase, rosterUserIds);
  } catch (medalsError) {
    console.error("Match player medals fetch failed:", medalsError);
  }

  const resultScreenshotUrls = Array.isArray(typedMatch.result_screenshot_urls)
    ? typedMatch.result_screenshot_urls.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0
      )
    : [];
  const teamA = normalizeMatchRoomTeam({
    teamRow: teamById.get(teamAId) ?? null,
    teamId: teamAId,
    fallbackName: "Team A",
    medalsByUserId,
  });
  const teamB = normalizeMatchRoomTeam({
    teamRow: teamById.get(teamBId) ?? null,
    teamId: teamBId,
    fallbackName: "Team B",
    medalsByUserId,
  });

  return {
    data: {
      match: {
        id: typedMatch.id,
        roundLabel: typedMatch.round_label,
        format: typedMatch.format,
        adminOverride: typedMatch.admin_override ?? false,
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
  const [membershipResult, activeTournamentResult] = await Promise.all([
    supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("tournaments")
      .select("id")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const membership = membershipResult.data;
  const membershipError = membershipResult.error;
  const activeTournament = activeTournamentResult.data;
  const tournamentError = activeTournamentResult.error;

  if (membershipError) {
    throw membershipError;
  }

  if (tournamentError) {
    throw tournamentError;
  }

  if (!membership || !activeTournament) {
    return [];
  }

  const teamId = (membership as { team_id: string }).team_id;
  const tournamentId = (activeTournament as { id: string }).id;

  const primaryMatchesResult = await supabase
    .from("tournament_matches")
    .select(
      "id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, admin_override"
    )
    .eq("tournament_id", tournamentId)
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .order("scheduled_at", { ascending: true });
  let matches = primaryMatchesResult.data as UserTeamMatchQueryRow[] | null;
  let matchesError = primaryMatchesResult.error;

  if (
    matchesError?.message.includes("column tournament_matches.") &&
    matchesError.message.includes("does not exist")
  ) {
    console.warn(
      "My matches fetch is falling back to the legacy tournament_matches schema:",
      matchesError.message
    );

    const legacyMatchesResult = await supabase
      .from("tournament_matches")
      .select(
        "id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format"
      )
      .eq("tournament_id", tournamentId)
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      .order("scheduled_at", { ascending: true });

    matches = (legacyMatchesResult.data ?? []).map((match) => ({
      ...match,
      admin_override: false,
    })) as UserTeamMatchQueryRow[];
    matchesError = legacyMatchesResult.error;
  }

  if (matchesError) {
    throw matchesError;
  }

  if (!matches?.length) {
    return [];
  }

  const teamIds = Array.from(
    new Set(
      (matches as UserTeamMatchQueryRow[]).flatMap(
        (m) => [m.team_a_id, m.team_b_id]
      )
    )
  );
  const matchIds = (matches as UserTeamMatchQueryRow[]).map((match) => match.id);

  const [teamsResult, teamMembershipsResult, checkInsResult] = await Promise.all([
    supabase.from("teams").select("id, name, logo_url").in("id", teamIds),
    supabase.from("team_members").select("team_id, user_id").in("team_id", teamIds),
    supabase
      .from("match_check_ins")
      .select("match_id, player_id, is_checked_in, is_ready")
      .in("match_id", matchIds),
  ]);
  const teams = teamsResult.data;
  const teamsError = teamsResult.error;

  if (teamsError) {
    throw teamsError;
  }

  if (teamMembershipsResult.error) {
    throw teamMembershipsResult.error;
  }

  if (checkInsResult.error) {
    throw checkInsResult.error;
  }

  const teamNameById = new Map(
    ((teams ?? []) as TeamRow[]).map((team) => [
      team.id,
      {
        name: team.name,
        logoUrl: team.logo_url,
      },
    ])
  );
  const playerTeamIdByUserId = new Map(
    ((teamMembershipsResult.data ?? []) as TeamMembershipRow[]).map((membership) => [
      membership.user_id,
      membership.team_id,
    ])
  );
  const matchById = new Map(
    (matches as UserTeamMatchQueryRow[]).map((match) => [match.id, match])
  );
  const checkInCountsByMatchId = new Map<
    string,
    { teamAPlayerIds: Set<string>; teamBPlayerIds: Set<string> }
  >();

  for (const row of (checkInsResult.data ?? []) as MatchCheckInListRow[]) {
    if (!(row.is_ready || row.is_checked_in)) {
      continue;
    }

    const match = matchById.get(row.match_id);

    if (!match) {
      continue;
    }

    const playerTeamId = playerTeamIdByUserId.get(row.player_id);

    if (!playerTeamId) {
      continue;
    }

    let counts = checkInCountsByMatchId.get(row.match_id);

    if (!counts) {
      counts = {
        teamAPlayerIds: new Set<string>(),
        teamBPlayerIds: new Set<string>(),
      };
      checkInCountsByMatchId.set(row.match_id, counts);
    }

    if (playerTeamId === match.team_a_id) {
      counts.teamAPlayerIds.add(row.player_id);
      continue;
    }

    if (playerTeamId === match.team_b_id) {
      counts.teamBPlayerIds.add(row.player_id);
    }
  }

  return (matches as UserTeamMatchQueryRow[]).map((m) => ({
    id: m.id,
    roundLabel: m.round_label,
    format: m.format,
    scheduledAt: m.scheduled_at,
    status: m.status,
    adminOverride: m.admin_override ?? false,
    teamAScore: m.team_a_score,
    teamAName: teamNameById.get(m.team_a_id)?.name ?? "Team A",
    teamALogoUrl: teamNameById.get(m.team_a_id)?.logoUrl ?? null,
    teamACheckInCount:
      checkInCountsByMatchId.get(m.id)?.teamAPlayerIds.size ?? 0,
    teamBScore: m.team_b_score,
    teamBName: teamNameById.get(m.team_b_id)?.name ?? "Team B",
    teamBLogoUrl: teamNameById.get(m.team_b_id)?.logoUrl ?? null,
    teamBCheckInCount:
      checkInCountsByMatchId.get(m.id)?.teamBPlayerIds.size ?? 0,
    teamAId: m.team_a_id,
    teamBId: m.team_b_id,
    userTeamId: teamId,
  }));
}

export async function getMatchesForUserTeam(userId: string): Promise<UserTeamMatch[]> {
  const supabase = getSupabaseBrowserClient();
  return getMatchesForUserTeamWithClient(supabase, userId);
}

export async function getHasLiveMatchForUserWithClient(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const matches = await getMatchesForUserTeamWithClient(supabase, userId);
  return matches.some(isUserTeamMatchLive);
}

export async function getHasLiveMatchForUser(userId: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  return getHasLiveMatchForUserWithClient(supabase, userId);
}
