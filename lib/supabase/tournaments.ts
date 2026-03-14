import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  listPlayerMedalsForUsers,
  type PlayerMedalWithTournament,
} from "@/lib/supabase/player-medals";
import { getProfileByUserId } from "@/lib/supabase/profiles";

const TOURNAMENT_SELECT_COLUMNS =
  "id, name, banner_url, is_active, number_of_groups, teams_eliminated_per_group, playoff_format, check_in_threshold, prize_pool, dates, created_at";
const LEGACY_TOURNAMENT_SELECT_COLUMNS =
  "id, name, banner_url, is_active, number_of_groups, teams_eliminated_per_group, playoff_format, created_at";

type TournamentConfirmationInsert =
  Database["public"]["Tables"]["tournament_confirmations"]["Insert"];
type TournamentTeamEntryInsert =
  Database["public"]["Tables"]["tournament_team_entries"]["Insert"];
type TournamentMatchInsert =
  Database["public"]["Tables"]["tournament_matches"]["Insert"];
type TournamentMatchUpdate =
  Database["public"]["Tables"]["tournament_matches"]["Update"];

type TournamentSelectRow = {
  id: string;
  name: string;
  banner_url: string | null;
  is_active: boolean;
  number_of_groups: number;
  teams_eliminated_per_group: number;
  playoff_format: string;
  check_in_threshold?: number | null;
  prize_pool?: string | null;
  dates?: string | null;
  created_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  banner_url: string | null;
  is_active: boolean;
  number_of_groups: number;
  teams_eliminated_per_group: number;
  playoff_format: string;
  check_in_threshold: number;
  prize_pool: string | null;
  dates: string | null;
  created_at: string;
};

export type TournamentConfirmation = {
  tournament_id: string;
  user_id: string;
  confirmed_at: string;
};

export type TournamentTeamEntry = {
  id: string;
  tournament_id: string;
  team_id: string;
  entered_by: string;
  is_suspended: boolean;
  created_at: string;
};

export type EnteredTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
  captainName: string;
  roster: Array<{
    id: string;
    nickname: string;
    mmr: number | null;
    isMMRVerified: boolean;
    medals: PlayerMedalWithTournament[];
  }>;
  isSuspended: boolean;
};

export type TournamentMatch = {
  id: string;
  roundLabel: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamALogoUrl: string | null;
  teamBName: string;
  teamBLogoUrl: string | null;
  scheduledAt: string | null;
  status: string;
  teamAScore: number | null;
  teamBScore: number | null;
  winnerTeamId: string | null;
  isForfeit: boolean;
  displayOrder: number;
  format: string;
  adminOverride: boolean;
  requireLobbyPhoto: boolean;
  lobbyPhotoMap1Only: boolean;
  teamACheckInCount: number;
  teamBCheckInCount: number;
};

export type AdminTournamentEntryTeam = {
  id: string;
  name: string;
  captainName: string;
  memberCount: number;
  confirmedCount: number;
  hasEntered: boolean;
  isSuspended: boolean;
  canEnter: boolean;
};

type TournamentInsert = Database["public"]["Tables"]["tournaments"]["Insert"];
type TournamentUpdate = Database["public"]["Tables"]["tournaments"]["Update"];

type TeamProfileJoin = {
  id: string;
  nickname: string;
  mmr: number | null;
  mmr_status: string | null;
};

type TeamMembershipJoin = {
  user_id: string;
  is_captain: boolean;
  created_at: string;
  profiles: TeamProfileJoin | TeamProfileJoin[] | null;
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

type TeamMetaJoinRow = {
  id: string;
  name: string;
  team_members: TeamMembershipJoin[] | null;
};

function normalizeJoinedRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === "object") {
    return [value as T];
  }

  return [];
}

function isMissingTournamentColumnsError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("column tournaments.check_in_threshold does not exist") ||
      error.message.includes("column tournaments.prize_pool does not exist") ||
      error.message.includes("column tournaments.dates does not exist"))
  );
}

function normalizeTournament(row: TournamentSelectRow): Tournament {
  return {
    id: row.id,
    name: row.name,
    banner_url: row.banner_url,
    is_active: row.is_active,
    number_of_groups: row.number_of_groups,
    teams_eliminated_per_group: row.teams_eliminated_per_group,
    playoff_format: row.playoff_format,
    check_in_threshold: Math.max(row.check_in_threshold ?? 10, 1),
    prize_pool: row.prize_pool ?? null,
    dates: row.dates ?? null,
    created_at: row.created_at,
  };
}

async function getTournamentById(tournamentId: string) {
  const supabase = getSupabaseBrowserClient();
  const result = await supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT_COLUMNS)
    .eq("id", tournamentId)
    .maybeSingle();

  if (result.error && isMissingTournamentColumnsError(result.error)) {
    const legacyResult = await supabase
      .from("tournaments")
      .select(LEGACY_TOURNAMENT_SELECT_COLUMNS)
      .eq("id", tournamentId)
      .maybeSingle();

    if (legacyResult.error) {
      throw legacyResult.error;
    }

    return legacyResult.data ? normalizeTournament(legacyResult.data) : null;
  }

  if (result.error) {
    throw result.error;
  }

  return result.data ? normalizeTournament(result.data as TournamentSelectRow) : null;
}

export async function getActiveTournament() {
  const supabase = getSupabaseBrowserClient();
  const result = await supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT_COLUMNS)
    .eq("is_active", true);

  let data = result.data as TournamentSelectRow[] | null;
  let error = result.error;

  if (error && isMissingTournamentColumnsError(error)) {
    const legacyResult = await supabase
      .from("tournaments")
      .select(LEGACY_TOURNAMENT_SELECT_COLUMNS)
      .eq("is_active", true);

    data = legacyResult.data as TournamentSelectRow[] | null;
    error = legacyResult.error;
  }

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  if (data.length > 1) {
    throw new Error("Multiple active tournaments detected.");
  }

  return normalizeTournament(data[0]);
}

export async function listTournaments() {
  const supabase = getSupabaseBrowserClient();
  const result = await supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT_COLUMNS)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  let data = result.data as TournamentSelectRow[] | null;
  let error = result.error;

  if (error && isMissingTournamentColumnsError(error)) {
    const legacyResult = await supabase
      .from("tournaments")
      .select(LEGACY_TOURNAMENT_SELECT_COLUMNS)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    data = legacyResult.data as TournamentSelectRow[] | null;
    error = legacyResult.error;
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeTournament);
}

export async function createTournament(params: {
  name: string;
  numberOfGroups: number;
  teamsEliminatedPerGroup: number;
  playoffFormat: string;
  prizePool: string;
  dates: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const payload: TournamentInsert = {
    name: params.name,
    is_active: false,
    number_of_groups: params.numberOfGroups,
    teams_eliminated_per_group: params.teamsEliminatedPerGroup,
    playoff_format: params.playoffFormat,
    prize_pool: params.prizePool,
    dates: params.dates,
  };
  const { data, error } = await supabase
    .from("tournaments")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const tournament = await getTournamentById((data as { id: string }).id);

  if (!tournament) {
    throw new Error("Created tournament could not be reloaded.");
  }

  return tournament;
}

export async function setActiveTournament(tournamentId: string) {
  const supabase = getSupabaseBrowserClient();

  const { error: deactivateError } = await supabase
    .from("tournaments")
    .update({ is_active: false })
    .neq("id", tournamentId);

  if (deactivateError) {
    throw deactivateError;
  }

  const { error: activateError } = await supabase
    .from("tournaments")
    .update({ is_active: true })
    .eq("id", tournamentId)
    .select("id")
    .single();

  if (activateError) {
    throw activateError;
  }

  const tournament = await getTournamentById(tournamentId);

  if (!tournament) {
    throw new Error("Active tournament could not be reloaded.");
  }

  return tournament;
}

export async function updateTournamentCheckInThreshold(
  tournamentId: string,
  checkInThreshold: number
) {
  const supabase = getSupabaseBrowserClient();
  const normalizedThreshold = Math.max(1, Math.floor(checkInThreshold));
  const { error } = await supabase
    .from("tournaments")
    .update({ check_in_threshold: normalizedThreshold })
    .eq("id", tournamentId);

  if (error) {
    throw error;
  }

  const tournament = await getTournamentById(tournamentId);

  if (!tournament) {
    throw new Error("Tournament could not be reloaded after updating the threshold.");
  }

  return tournament;
}

export async function updateTournamentDetails(
  tournamentId: string,
  params: {
    prizePool: string | null;
    dates: string | null;
  }
) {
  const supabase = getSupabaseBrowserClient();
  const payload: TournamentUpdate = {
    prize_pool: params.prizePool,
    dates: params.dates,
  };
  const { error } = await supabase
    .from("tournaments")
    .update(payload)
    .eq("id", tournamentId);

  if (error) {
    throw error;
  }

  const tournament = await getTournamentById(tournamentId);

  if (!tournament) {
    throw new Error("Tournament could not be reloaded after updating its details.");
  }

  return tournament;
}

export async function getTournamentConfirmation(
  tournamentId: string,
  userId: string
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tournament_confirmations")
    .select("tournament_id, user_id, confirmed_at")
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TournamentConfirmation | null;
}

export async function confirmTournamentParticipation(
  tournamentId: string,
  userId: string
) {
  const profile = await getProfileByUserId(userId);

  if (!profile?.mmr) {
    throw new Error(
      "Укажите текущий MMR в профиле перед подтверждением участия."
    );
  }

  const supabase = getSupabaseBrowserClient();
  const payload: TournamentConfirmationInsert = {
    tournament_id: tournamentId,
    user_id: userId,
    confirmed_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("tournament_confirmations")
    .upsert(payload, {
      onConflict: "tournament_id,user_id",
    });

  if (error) {
    throw error;
  }
}

export async function getTournamentConfirmationsForUsers(
  tournamentId: string,
  userIds: string[]
) {
  if (userIds.length === 0) {
    return [] as TournamentConfirmation[];
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tournament_confirmations")
    .select("tournament_id, user_id, confirmed_at")
    .eq("tournament_id", tournamentId)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as TournamentConfirmation[];
}

export async function getTournamentTeamEntry(
  tournamentId: string,
  teamId: string
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tournament_team_entries")
    .select("id, tournament_id, team_id, entered_by, is_suspended, created_at")
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TournamentTeamEntry | null;
}

export async function createTournamentTeamEntry(params: {
  tournamentId: string;
  teamId: string;
  enteredBy: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const payload: TournamentTeamEntryInsert = {
    tournament_id: params.tournamentId,
    team_id: params.teamId,
    entered_by: params.enteredBy,
    is_suspended: false,
  };
  const { data, error } = await supabase
    .from("tournament_team_entries")
    .upsert(payload, {
      onConflict: "tournament_id,team_id",
    })
    .select("id, tournament_id, team_id, entered_by, is_suspended, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data as TournamentTeamEntry;
}

export async function getEnteredTeamsForTournament(
  tournamentId: string
): Promise<EnteredTeam[]> {
  const supabase = getSupabaseBrowserClient();

  const { data: entries, error: entriesError } = await supabase
    .from("tournament_team_entries")
    .select("team_id, is_suspended")
    .eq("tournament_id", tournamentId)
    .eq("is_suspended", false);

  if (entriesError) {
    throw entriesError;
  }

  const typedEntries = (entries ?? []) as Array<{
    team_id: string;
    is_suspended: boolean;
  }>;
  const teamIds = typedEntries.map((entry) => entry.team_id);

  if (teamIds.length === 0) {
    return [];
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select(
      "id, name, logo_url, team_members(user_id, is_captain, created_at, profiles(id, nickname, mmr, mmr_status))"
    )
    .in("id", teamIds);

  if (teamsError) {
    throw teamsError;
  }

  const typedTeams = (teams ?? []) as unknown as Array<{
    id: string;
    name: string;
    logo_url: string | null;
    team_members: Array<{
      user_id: string;
      is_captain: boolean;
      created_at: string;
      profiles:
        | {
            id: string;
            nickname: string;
            mmr: number | null;
            mmr_status: string | null;
          }
        | Array<{
            id: string;
            nickname: string;
            mmr: number | null;
            mmr_status: string | null;
          }>
        | null;
    }> | null;
  }>;
  const medalsByUserId = await listPlayerMedalsForUsers(
    typedTeams.flatMap((team) =>
      normalizeJoinedRows<TeamMembershipJoin>(team.team_members).map(
        (membership) => membership.user_id
      )
    )
  );

  return teamIds
    .map((teamId) => {
      const team = typedTeams.find((candidate) => candidate.id === teamId);

      if (!team) {
        return null;
      }

      const teamMemberships = normalizeJoinedRows<TeamMembershipJoin>(team.team_members)
        .slice()
        .sort(
        (membershipA, membershipB) =>
          new Date(membershipA.created_at).getTime() -
          new Date(membershipB.created_at).getTime()
        );
      const roster = teamMemberships
        .map((membership) => {
          const profile = Array.isArray(membership.profiles)
            ? membership.profiles[0]
            : membership.profiles;

          if (!profile?.nickname) {
            return null;
          }

          return {
            id: profile.id,
            nickname: profile.nickname,
            mmr: profile.mmr ?? null,
            isMMRVerified: profile.mmr_status === "verified",
            medals: medalsByUserId[profile.id] ?? [],
          };
        })
        .filter(
          (
            player
          ): player is {
            id: string;
            nickname: string;
            mmr: number | null;
            isMMRVerified: boolean;
            medals: PlayerMedalWithTournament[];
          } => Boolean(player)
        );
      const captainMembership = teamMemberships.find((membership) => membership.is_captain);
      const captainProfile = captainMembership
        ? Array.isArray(captainMembership.profiles)
          ? captainMembership.profiles[0]
          : captainMembership.profiles
        : null;

      return {
        id: team.id,
        name: team.name,
        logoUrl: team.logo_url,
        captainName: captainProfile?.nickname ?? "No captain",
        roster,
        isSuspended: false,
      };
    })
    .filter((team): team is EnteredTeam => Boolean(team));
}

export async function getTournamentMatchesForTournament(
  tournamentId: string
): Promise<TournamentMatch[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: matches, error: matchesError } = await supabase
    .from("tournament_matches")
    .select(
      "id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, winner_team_id, is_forfeit, display_order, format, created_at, admin_override, require_lobby_photo, lobby_photo_map1_only, team_a:teams!tournament_matches_team_a_id_fkey(id, name, logo_url), team_b:teams!tournament_matches_team_b_id_fkey(id, name, logo_url)"
    )
    .eq("tournament_id", tournamentId)
    .order("scheduled_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (matchesError) {
    throw matchesError;
  }

  const typedMatches = (matches ?? []) as unknown as Array<{
    id: string;
    team_a_id: string;
    team_b_id: string;
    round_label: string;
    scheduled_at: string | null;
    status: string;
    admin_override?: boolean | null;
    require_lobby_photo?: boolean | null;
    lobby_photo_map1_only?: boolean | null;
    team_a_score: number | null;
    team_b_score: number | null;
    winner_team_id: string | null;
    is_forfeit?: boolean | null;
    display_order: number;
    format: string;
    team_a:
      | {
          id: string;
          name: string;
          logo_url: string | null;
        }
      | Array<{
          id: string;
          name: string;
          logo_url: string | null;
        }>
      | null;
    team_b:
      | {
          id: string;
          name: string;
          logo_url: string | null;
        }
      | Array<{
          id: string;
          name: string;
          logo_url: string | null;
        }>
      | null;
  }>;

  if (typedMatches.length === 0) {
    return [];
  }

  const teamIds = Array.from(
    new Set(typedMatches.flatMap((match) => [match.team_a_id, match.team_b_id]))
  );
  const matchIds = typedMatches.map((match) => match.id);

  const [teamMembershipsResult, checkInsResult] = await Promise.all([
    supabase.from("team_members").select("team_id, user_id").in("team_id", teamIds),
    supabase
      .from("match_check_ins")
      .select("match_id, player_id, is_checked_in, is_ready")
      .in("match_id", matchIds),
  ]);

  if (teamMembershipsResult.error) {
    throw teamMembershipsResult.error;
  }

  if (checkInsResult.error) {
    throw checkInsResult.error;
  }

  const playerTeamIdByUserId = new Map(
    ((teamMembershipsResult.data ?? []) as TeamMembershipRow[]).map((membership) => [
      membership.user_id,
      membership.team_id,
    ])
  );
  const matchById = new Map(typedMatches.map((match) => [match.id, match]));
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

  return typedMatches.map((match) => ({
    id: match.id,
    roundLabel: match.round_label,
    teamAId: match.team_a_id,
    teamBId: match.team_b_id,
    teamAName: (Array.isArray(match.team_a) ? match.team_a[0] : match.team_a)?.name ?? "Team A",
    teamALogoUrl:
      (Array.isArray(match.team_a) ? match.team_a[0] : match.team_a)?.logo_url ?? null,
    teamBName: (Array.isArray(match.team_b) ? match.team_b[0] : match.team_b)?.name ?? "Team B",
    teamBLogoUrl:
      (Array.isArray(match.team_b) ? match.team_b[0] : match.team_b)?.logo_url ?? null,
    scheduledAt: match.scheduled_at,
    status: match.status,
    teamAScore: match.team_a_score,
    teamBScore: match.team_b_score,
    winnerTeamId: match.winner_team_id ?? null,
    isForfeit: match.is_forfeit ?? false,
    displayOrder: match.display_order,
    format: match.format,
    adminOverride: match.admin_override ?? false,
    requireLobbyPhoto: match.require_lobby_photo ?? true,
    lobbyPhotoMap1Only:
      (match.require_lobby_photo ?? true) && (match.lobby_photo_map1_only ?? false),
    teamACheckInCount:
      checkInCountsByMatchId.get(match.id)?.teamAPlayerIds.size ?? 0,
    teamBCheckInCount:
      checkInCountsByMatchId.get(match.id)?.teamBPlayerIds.size ?? 0,
  }));
}

function normalizeMatchPayload(params: {
  tournamentId: string;
  teamAId: string;
  teamBId: string;
  roundLabel: string;
  scheduledAt: string;
  status: string;
  teamAScore: string;
  teamBScore: string;
  format: string;
  requireLobbyPhoto?: boolean;
  lobbyPhotoMap1Only?: boolean;
}) {
  const roundLabel = params.roundLabel.trim();

  if (!roundLabel) {
    throw new Error("Round label is required.");
  }

  if (!params.teamAId || !params.teamBId) {
    throw new Error("Both teams are required.");
  }

  if (params.teamAId === params.teamBId) {
    throw new Error("Team A and Team B must be different teams.");
  }

  const normalizedStatus = params.status === "finished" ? "finished" : "scheduled";
  const normalizedFormat =
    params.format === "BO1" || params.format === "BO2" ? params.format : "BO3";
  const normalizedScheduledAt = params.scheduledAt.trim();

  if (normalizedScheduledAt) {
    const parsedScheduledAt = new Date(normalizedScheduledAt);

    if (Number.isNaN(parsedScheduledAt.getTime())) {
      throw new Error("Scheduled date must be a valid ISO datetime.");
    }
  }

  const parseScore = (value: string) => {
    if (!value.trim()) {
      return null;
    }

    const nextValue = Number(value);

    if (Number.isNaN(nextValue)) {
      throw new Error("Scores must be valid numbers.");
    }

    return nextValue;
  };

  const teamAScore = normalizedStatus === "finished" ? parseScore(params.teamAScore) : null;
  const teamBScore = normalizedStatus === "finished" ? parseScore(params.teamBScore) : null;
  const requireLobbyPhoto = params.requireLobbyPhoto ?? true;

  return {
    tournament_id: params.tournamentId,
    team_a_id: params.teamAId,
    team_b_id: params.teamBId,
    round_label: roundLabel,
    scheduled_at: normalizedScheduledAt || null,
    status: normalizedStatus,
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    display_order: 0,
    format: normalizedFormat,
    require_lobby_photo: requireLobbyPhoto,
    lobby_photo_map1_only: requireLobbyPhoto
      ? params.lobbyPhotoMap1Only ?? false
      : false,
  };
}

export async function createTournamentMatch(params: {
  tournamentId: string;
  teamAId: string;
  teamBId: string;
  roundLabel: string;
  scheduledAt: string;
  format: string;
  requireLobbyPhoto?: boolean;
  lobbyPhotoMap1Only?: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  const payload: TournamentMatchInsert = normalizeMatchPayload({
    ...params,
    status: "scheduled",
    teamAScore: "",
    teamBScore: "",
  });
  const { data, error } = await supabase
    .from("tournament_matches")
    .insert(payload)
    .select(
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, display_order, format, created_at, require_lobby_photo, lobby_photo_map1_only"
    )
    .single();

  if (error) {
    throw error;
  }

  return data as Database["public"]["Tables"]["tournament_matches"]["Row"];
}

export async function updateTournamentMatch(params: {
  matchId: string;
  tournamentId: string;
  teamAId: string;
  teamBId: string;
  roundLabel: string;
  scheduledAt: string;
  status: string;
  teamAScore: string;
  teamBScore: string;
  format: string;
  requireLobbyPhoto?: boolean;
  lobbyPhotoMap1Only?: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  const payload: TournamentMatchUpdate = normalizeMatchPayload(params);
  const { data: existingMatch, error: existingMatchError } = await supabase
    .from("tournament_matches")
    .select("id, scheduled_at")
    .eq("id", params.matchId)
    .maybeSingle();

  if (existingMatchError) {
    throw existingMatchError;
  }

  if (!existingMatch) {
    throw new Error("Match not found.");
  }

  const oldTime = existingMatch.scheduled_at
    ? new Date(existingMatch.scheduled_at).getTime()
    : null;
  const newTime = payload.scheduled_at
    ? new Date(payload.scheduled_at).getTime()
    : null;
  const timeChanged = oldTime !== newTime;

  if (timeChanged) {
    const { error: deleteCheckInsError } = await supabase
      .from("match_check_ins")
      .delete()
      .eq("match_id", params.matchId);

    if (deleteCheckInsError) {
      throw deleteCheckInsError;
    }

    payload.lobby_name = null;
    payload.lobby_password = null;
  }

  const { data, error } = await supabase
    .from("tournament_matches")
    .update(payload)
    .eq("id", params.matchId)
    .select(
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, display_order, format, created_at, require_lobby_photo, lobby_photo_map1_only"
    )
    .single();

  if (error) {
    throw error;
  }

  return data as Database["public"]["Tables"]["tournament_matches"]["Row"];
}

export async function listAdminTournamentEntryTeams(
  tournamentId: string
): Promise<AdminTournamentEntryTeam[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select(
      "id, name, team_members(user_id, is_captain, created_at, profiles(id, nickname))"
    )
    .order("created_at", { ascending: true });

  if (teamsError) {
    throw teamsError;
  }

  const teamRows = (teams ?? []) as unknown as TeamMetaJoinRow[];

  if (teamRows.length === 0) {
    return [];
  }

  const teamIds = teamRows.map((team) => team.id);
  const memberUserIds = Array.from(
    new Set(
      teamRows.flatMap((team) =>
        normalizeJoinedRows<TeamMembershipJoin>(team.team_members).map(
          (membership) => membership.user_id
        )
      )
    )
  );

  let confirmedUserIdSet = new Set<string>();

  if (memberUserIds.length > 0) {
    const { data: confirmations, error: confirmationsError } = await supabase
      .from("tournament_confirmations")
      .select("user_id")
      .eq("tournament_id", tournamentId)
      .in("user_id", memberUserIds);

    if (confirmationsError) {
      throw confirmationsError;
    }

    confirmedUserIdSet = new Set(
      (confirmations ?? []).map((confirmation) => confirmation.user_id as string)
    );
  }

  const { data: entries, error: entriesError } = await supabase
    .from("tournament_team_entries")
    .select("team_id, is_suspended")
    .eq("tournament_id", tournamentId)
    .in("team_id", teamIds);

  if (entriesError) {
    throw entriesError;
  }

  const typedEntries =
    (entries ?? []) as Array<{ team_id: string; is_suspended: boolean }>;
  const enteredTeamIds = new Set(typedEntries.map((entry) => entry.team_id));
  const suspendedTeamIds = new Set(
    typedEntries
      .filter((entry) => entry.is_suspended)
      .map((entry) => entry.team_id)
  );

  return teamRows.map((team) => {
    const teamMemberships = normalizeJoinedRows<TeamMembershipJoin>(team.team_members)
      .slice()
      .sort(
      (membershipA, membershipB) =>
        new Date(membershipA.created_at).getTime() -
        new Date(membershipB.created_at).getTime()
      );
    const confirmedCount = teamMemberships.filter((membership) =>
      confirmedUserIdSet.has(membership.user_id)
    ).length;
    const hasEntered = enteredTeamIds.has(team.id);
    const captainMembership = teamMemberships.find((membership) => membership.is_captain);
    const captainProfile = captainMembership
      ? Array.isArray(captainMembership.profiles)
        ? captainMembership.profiles[0]
        : captainMembership.profiles
      : null;
    const memberCount = teamMemberships.length;
    const canEnter = !hasEntered && memberCount >= 5 && confirmedCount >= 5;

    return {
      id: team.id,
      name: team.name,
      captainName: captainProfile?.nickname ?? "No captain",
      memberCount,
      confirmedCount,
      hasEntered,
      isSuspended: suspendedTeamIds.has(team.id),
      canEnter,
    };
  });
}
