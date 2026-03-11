import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type Team = {
  id: string;
  name: string;
  logo_url: string | null;
  tagline: string | null;
  created_by: string;
  created_at: string;
};

export type TeamMembership = {
  team_id: string;
  user_id: string;
  is_captain: boolean;
  created_at: string;
};

export type TeamMember = {
  userId: string;
  nickname: string;
  isCaptain: boolean;
};

export type TeamListItem = {
  id: string;
  name: string;
  logoUrl: string | null;
  captainName: string;
  memberCount: number;
  isLockedForActiveTournament: boolean;
};

type TeamMembershipProfileRow = {
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
};

type TeamWithMembersRow = {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
  team_members: TeamMembershipProfileRow[] | null;
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

function toTeamMutationError(error: unknown, fallbackMessage: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("team_locked_after_tournament_entry")
  ) {
    return new Error(
      "This team has already entered the active tournament, so its roster is locked."
    );
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

export async function getCurrentMembership(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id, user_id, is_captain, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TeamMembership | null;
}

export async function getTeamById(teamId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, logo_url, tagline, created_by, created_at")
    .eq("id", teamId)
    .single();

  if (error) {
    throw error;
  }

  return data as Team;
}

export async function getTeamMembers(teamId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: memberships, error: membershipsError } = await supabase
    .from("team_members")
    .select("user_id, is_captain, created_at, profiles(id, nickname)")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    throw membershipsError;
  }

  const memberRows = normalizeJoinedRows<TeamMembershipProfileRow>(memberships);

  if (memberRows.length === 0) {
    return [] as TeamMember[];
  }

  return memberRows.map((membership) => ({
    userId: membership.user_id,
    nickname:
      (Array.isArray(membership.profiles)
        ? membership.profiles[0]?.nickname
        : membership.profiles?.nickname) ?? "Player",
    isCaptain: membership.is_captain,
  }));
}

export async function getCurrentTeamDetails(userId: string) {
  const membership = await getCurrentMembership(userId);

  if (!membership) {
    return null;
  }

  const team = await getTeamById(membership.team_id);
  const members = await getTeamMembers(membership.team_id);
  const captain = members.find((member) => member.isCaptain) ?? null;

  return {
    team,
    membership,
    members,
    captain,
  };
}

export async function listTeamsWithMeta() {
  const supabase = getSupabaseBrowserClient();
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select(
      "id, name, logo_url, created_at, team_members(user_id, is_captain, created_at, profiles(id, nickname))"
    )
    .order("created_at", { ascending: true });

  if (teamsError) {
    throw teamsError;
  }

  const teamRows = (teams ?? []) as unknown as TeamWithMembersRow[];
  const { data: activeTournament, error: activeTournamentError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (activeTournamentError) {
    throw activeTournamentError;
  }

  let lockedTeamIds = new Set<string>();

  if (activeTournament?.id) {
    const { data: tournamentEntries, error: tournamentEntriesError } = await supabase
      .from("tournament_team_entries")
      .select("team_id")
      .eq("tournament_id", activeTournament.id);

    if (tournamentEntriesError) {
      throw tournamentEntriesError;
    }

    lockedTeamIds = new Set(
      (tournamentEntries ?? []).map((entry) => entry.team_id as string)
    );
  }

  if (teamRows.every((team) => normalizeJoinedRows<TeamMembershipProfileRow>(team.team_members).length === 0)) {
    return teamRows.map((team) => ({
      id: team.id,
      name: team.name,
      logoUrl: team.logo_url,
      captainName: "No captain",
      memberCount: 0,
      isLockedForActiveTournament: lockedTeamIds.has(team.id),
    })) as TeamListItem[];
  }

  return teamRows.map((team) => {
    const teamMemberships = normalizeJoinedRows<TeamMembershipProfileRow>(
      team.team_members
    )
      .slice()
      .sort(
      (membershipA, membershipB) =>
        new Date(membershipA.created_at).getTime() -
        new Date(membershipB.created_at).getTime()
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
      memberCount: teamMemberships.length,
      isLockedForActiveTournament: lockedTeamIds.has(team.id),
    };
  }) as TeamListItem[];
}

export async function createTeamWithCaptain(params: {
  userId: string;
  name: string;
  tagline: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({
      name: params.name,
      tagline: params.tagline || null,
      created_by: params.userId,
    })
    .select("id, name, logo_url, tagline, created_by, created_at")
    .single();

  if (teamError) {
    throw teamError;
  }

  const { error: membershipError } = await supabase.from("team_members").insert({
    team_id: team.id,
    user_id: params.userId,
    is_captain: true,
  });

  if (membershipError) {
    throw membershipError;
  }

  return team as Team;
}

export async function createTeamForAdmin(params: {
  userId: string;
  name: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("teams")
    .insert({
      name: params.name,
      created_by: params.userId,
    })
    .select("id, name, logo_url, tagline, created_by, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data as Team;
}

export async function joinTeam(params: { teamId: string; userId: string }) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("team_members").insert({
    team_id: params.teamId,
    user_id: params.userId,
    is_captain: false,
  });

  if (error) {
    throw toTeamMutationError(error, "Could not join team.");
  }
}

export async function addMemberToTeamAsAdmin(params: {
  teamId: string;
  userId: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("team_members").insert({
    team_id: params.teamId,
    user_id: params.userId,
    is_captain: false,
  });

  if (error) {
    throw toTeamMutationError(error, "Could not add player to team.");
  }
}

export async function setTeamCaptainAsAdmin(params: {
  teamId: string;
  userId: string;
}) {
  const supabase = getSupabaseBrowserClient();

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("team_id, user_id, is_captain, created_at")
    .eq("team_id", params.teamId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }

  if (!membership) {
    throw new Error("Selected player is not a member of this team.");
  }

  const { error: promoteError } = await supabase
    .from("team_members")
    .update({ is_captain: true })
    .eq("team_id", params.teamId)
    .eq("user_id", params.userId);

  if (promoteError) {
    throw toTeamMutationError(promoteError, "Could not update team captain.");
  }

  const { error: demoteError } = await supabase
    .from("team_members")
    .update({ is_captain: false })
    .eq("team_id", params.teamId)
    .neq("user_id", params.userId);

  if (demoteError) {
    throw toTeamMutationError(demoteError, "Could not update team captain.");
  }
}

export async function leaveCurrentTeam(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("leave_current_team", {
    p_user_id: userId,
  });

  if (error) {
    throw toTeamMutationError(error, "Could not leave team.");
  }

  return data as string;
}

export async function deleteTeamIfLastCaptain(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("delete_team_if_last_captain", {
    p_user_id: userId,
  });

  if (error) {
    throw toTeamMutationError(error, "Could not delete team.");
  }

  return data as string;
}
