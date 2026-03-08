import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { listTeamsWithMeta } from "@/lib/supabase/teams";

type TournamentConfirmationInsert =
  Database["public"]["Tables"]["tournament_confirmations"]["Insert"];
type TournamentTeamEntryInsert =
  Database["public"]["Tables"]["tournament_team_entries"]["Insert"];
type TournamentMatchInsert =
  Database["public"]["Tables"]["tournament_matches"]["Insert"];
type TournamentMatchUpdate =
  Database["public"]["Tables"]["tournament_matches"]["Update"];

export type Tournament = {
  id: string;
  name: string;
  is_active: boolean;
  number_of_groups: number;
  teams_eliminated_per_group: number;
  playoff_format: string;
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
  roster: string[];
  isSuspended: boolean;
};

export type TournamentMatch = {
  id: string;
  roundLabel: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  scheduledAt: string | null;
  status: string;
  teamAScore: number | null;
  teamBScore: number | null;
  displayOrder: number;
  format: string;
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

export async function getActiveTournament() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, is_active, number_of_groups, teams_eliminated_per_group, playoff_format, created_at"
    )
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  if (data.length > 1) {
    throw new Error("Multiple active tournaments detected.");
  }

  return data[0] as Tournament;
}

export async function listTournaments() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, is_active, number_of_groups, teams_eliminated_per_group, playoff_format, created_at"
    )
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Tournament[];
}

export async function createTournament(params: {
  name: string;
  numberOfGroups: number;
  teamsEliminatedPerGroup: number;
  playoffFormat: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const payload: TournamentInsert = {
    name: params.name,
    is_active: false,
    number_of_groups: params.numberOfGroups,
    teams_eliminated_per_group: params.teamsEliminatedPerGroup,
    playoff_format: params.playoffFormat,
  };
  const { data, error } = await supabase
    .from("tournaments")
    .insert(payload)
    .select(
      "id, name, is_active, number_of_groups, teams_eliminated_per_group, playoff_format, created_at"
    )
    .single();

  if (error) {
    throw error;
  }

  return data as Tournament;
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

  const { data, error: activateError } = await supabase
    .from("tournaments")
    .update({ is_active: true })
    .eq("id", tournamentId)
    .select(
      "id, name, is_active, number_of_groups, teams_eliminated_per_group, playoff_format, created_at"
    )
    .single();

  if (activateError) {
    throw activateError;
  }

  return data as Tournament;
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
    .eq("tournament_id", tournamentId);

  if (entriesError) {
    throw entriesError;
  }

  const typedEntries = (entries ?? []) as Array<{
    team_id: string;
    is_suspended: boolean;
  }>;
  const teamIds = typedEntries.map((entry) => entry.team_id);
  const suspensionByTeamId = new Map(
    typedEntries.map((entry) => [entry.team_id, entry.is_suspended])
  );

  if (teamIds.length === 0) {
    return [];
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select(
      "id, name, logo_url, team_members(user_id, is_captain, created_at, profiles(id, nickname))"
    )
    .in("id", teamIds);

  if (teamsError) {
    throw teamsError;
  }

  return teamIds
    .map((teamId) => {
      const team = ((teams ?? []) as unknown as Array<{
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
              }
            | Array<{
                id: string;
                nickname: string;
              }>
            | null;
        }> | null;
      }>).find((candidate) => candidate.id === teamId);

      if (!team) {
        return null;
      }

      const teamMemberships = (team.team_members ?? []).slice().sort(
        (membershipA, membershipB) =>
          new Date(membershipA.created_at).getTime() -
          new Date(membershipB.created_at).getTime()
      );
      const roster = teamMemberships
        .map((membership) => {
          const profile = Array.isArray(membership.profiles)
            ? membership.profiles[0]
            : membership.profiles;

          return profile?.nickname ?? null;
        })
        .filter((nickname): nickname is string => Boolean(nickname));
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
        isSuspended: suspensionByTeamId.get(team.id) ?? false,
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
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, display_order, format, created_at"
    )
    .eq("tournament_id", tournamentId)
    .order("scheduled_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (matchesError) {
    throw matchesError;
  }

  const typedMatches =
    (matches ?? []) as Database["public"]["Tables"]["tournament_matches"]["Row"][];

  if (typedMatches.length === 0) {
    return [];
  }

  const teamIds = Array.from(
    new Set(
      typedMatches.flatMap((match) => [match.team_a_id, match.team_b_id])
    )
  );
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", teamIds);

  if (teamsError) {
    throw teamsError;
  }

  const teamNameById = new Map(
    ((teams ?? []) as Array<{ id: string; name: string }>).map((team) => [
      team.id,
      team.name,
    ])
  );

  return typedMatches.map((match) => ({
    id: match.id,
    roundLabel: match.round_label,
    teamAId: match.team_a_id,
    teamBId: match.team_b_id,
    teamAName: teamNameById.get(match.team_a_id) ?? "Team A",
    teamBName: teamNameById.get(match.team_b_id) ?? "Team B",
    scheduledAt: match.scheduled_at,
    status: match.status,
    teamAScore: match.team_a_score,
    teamBScore: match.team_b_score,
    displayOrder: match.display_order,
    format: match.format,
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
  };
}

export async function createTournamentMatch(params: {
  tournamentId: string;
  teamAId: string;
  teamBId: string;
  roundLabel: string;
  scheduledAt: string;
  format: string;
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
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, display_order, format, created_at"
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
      "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, display_order, format, created_at"
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
  const teams = await listTeamsWithMeta();

  if (teams.length === 0) {
    return [];
  }

  const teamIds = teams.map((team) => team.id);
  const { data: memberships, error: membershipsError } = await supabase
    .from("team_members")
    .select("team_id, user_id, is_captain, created_at")
    .in("team_id", teamIds);

  if (membershipsError) {
    throw membershipsError;
  }

  const typedMemberships =
    (memberships ?? []) as Database["public"]["Tables"]["team_members"]["Row"][];
  const memberUserIds = Array.from(
    new Set(typedMemberships.map((membership) => membership.user_id))
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

  return teams.map((team) => {
    const teamMemberships = typedMemberships.filter(
      (membership) => membership.team_id === team.id
    );
    const confirmedCount = teamMemberships.filter((membership) =>
      confirmedUserIdSet.has(membership.user_id)
    ).length;
    const hasEntered = enteredTeamIds.has(team.id);
    const canEnter = !hasEntered && team.memberCount >= 5 && confirmedCount >= 5;

    return {
      id: team.id,
      name: team.name,
      captainName: team.captainName,
      memberCount: team.memberCount,
      confirmedCount,
      hasEntered,
      isSuspended: suspendedTeamIds.has(team.id),
      canEnter,
    };
  });
}