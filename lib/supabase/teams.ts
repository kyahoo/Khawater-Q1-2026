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
  const { data: memberships, error: membershipError } = await supabase
    .from("team_members")
    .select("team_id, user_id, is_captain, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw membershipError;
  }

  const memberRows = (memberships ?? []) as TeamMembership[];

  if (memberRows.length === 0) {
    return [] as TeamMember[];
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, nickname")
    .in(
      "id",
      memberRows.map((membership) => membership.user_id)
    );

  if (profileError) {
    throw profileError;
  }

  const nicknameById = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile.nickname as string])
  );

  return memberRows.map((membership) => ({
    userId: membership.user_id,
    nickname: nicknameById.get(membership.user_id) ?? "Player",
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
    .select("id, name, logo_url, tagline, created_by, created_at")
    .order("created_at", { ascending: true });

  if (teamsError) {
    throw teamsError;
  }

  const teamRows = (teams ?? []) as Team[];

  const { data: memberships, error: membershipError } = await supabase
    .from("team_members")
    .select("team_id, user_id, is_captain, created_at");

  if (membershipError) {
    throw membershipError;
  }

  const memberRows = (memberships ?? []) as TeamMembership[];
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

  if (memberRows.length === 0) {
    return teamRows.map((team) => ({
      id: team.id,
      name: team.name,
      logoUrl: team.logo_url,
      captainName: "No captain",
      memberCount: 0,
      isLockedForActiveTournament: lockedTeamIds.has(team.id),
    })) as TeamListItem[];
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, nickname")
    .in(
      "id",
      memberRows.map((membership) => membership.user_id)
    );

  if (profileError) {
    throw profileError;
  }

  const nicknameById = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile.nickname as string])
  );

  return teamRows.map((team) => {
    const teamMemberships = memberRows.filter(
      (membership) => membership.team_id === team.id
    );
    const captainMembership = teamMemberships.find(
      (membership) => membership.is_captain
    );

    return {
      id: team.id,
      name: team.name,
      logoUrl: team.logo_url,
      captainName: captainMembership
        ? nicknameById.get(captainMembership.user_id) ?? "Captain"
        : "No captain",
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
