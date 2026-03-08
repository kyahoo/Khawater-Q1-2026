"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type CreateAdminPlayerInput = {
  accessToken: string;
  email: string;
  nickname: string;
  password: string;
};

type CreateAdminPlayerResult = {
  error: string | null;
};

export type AdminPlayerListItem = {
  id: string;
  nickname: string;
  email: string;
};

type ListAdminPlayersResult =
  | {
      error: string;
      players: [];
    }
  | {
      error: null;
      players: AdminPlayerListItem[];
    };

type DeletePlayerResult = {
  error: string | null;
};

type DeleteTeamResult = {
  error: string | null;
};

type AdminActionContext = {
  supabaseUrl: string;
  serviceRoleKey: string;
  supabase: ReturnType<typeof createClient<Database>>;
  actingUserId: string;
};

type AdminActionAuthResult =
  | { error: string; context: null }
  | { error: null; context: AdminActionContext };

async function verifyAdminAction(accessToken: string): Promise<AdminActionAuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const trimmedAccessToken = accessToken.trim();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
      context: null,
    };
  }

  if (!trimmedAccessToken) {
    return {
      error: "Could not verify admin session.",
      context: null,
    };
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user: actingUser },
    error: actingUserError,
  } = await supabase.auth.getUser(trimmedAccessToken);

  if (actingUserError || !actingUser) {
    return {
      error: "Could not verify admin session.",
      context: null,
    };
  }

  const { data: actingProfile, error: actingProfileError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", actingUser.id)
    .maybeSingle();

  if (actingProfileError || !actingProfile?.is_admin) {
    return {
      error: "You do not have admin access for this action.",
      context: null,
    };
  }

  return {
    error: null,
    context: {
      supabaseUrl,
      serviceRoleKey,
      supabase,
      actingUserId: actingUser.id,
    },
  };
}

export async function createAdminPlayerAction(
  input: CreateAdminPlayerInput
): Promise<CreateAdminPlayerResult> {
  const email = input.email.trim();
  const nickname = input.nickname.trim();
  const password = input.password;

  if (!email || !nickname || !password) {
    return {
      error: "Email, nickname, and password are required.",
    };
  }

  const authResult = await verifyAdminAction(input.accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
    };
  }

  const adminClient = createClient<Database>(
    authResult.context.supabaseUrl,
    authResult.context.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: createdUserData, error: createUserError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nickname,
      },
    });

  if (createUserError || !createdUserData.user) {
    return {
      error: createUserError?.message ?? "Could not create player account.",
    };
  }

  const { error: profileInsertError } = await adminClient.from("profiles").insert({
    id: createdUserData.user.id,
    nickname,
  });

  if (profileInsertError) {
    return {
      error: profileInsertError.message,
    };
  }

  revalidatePath("/admin");

  return {
    error: null,
  };
}

export async function listAdminPlayers(
  accessToken: string
): Promise<ListAdminPlayersResult> {
  const authResult = await verifyAdminAction(accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
      players: [],
    };
  }

  const adminClient = createClient<Database>(
    authResult.context.supabaseUrl,
    authResult.context.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers();

  if (usersError) {
    return {
      error: usersError.message,
      players: [],
    };
  }

  const users = usersData.users;
  const userIds = users.map((user) => user.id);
  let nicknameByUserId = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, nickname")
      .in("id", userIds);

    if (profilesError) {
      return {
        error: profilesError.message,
        players: [],
      };
    }

    nicknameByUserId = new Map(
      ((profiles ?? []) as Array<{ id: string; nickname: string }>).map((profile) => [
        profile.id,
        profile.nickname,
      ])
    );
  }

  const players = users
    .map((user) => ({
      id: user.id,
      nickname: nicknameByUserId.get(user.id) ?? user.user_metadata?.nickname ?? "Unknown",
      email: user.email ?? "No email",
    }))
    .sort((playerA, playerB) => playerA.nickname.localeCompare(playerB.nickname));

  return {
    error: null,
    players,
  };
}

export async function deletePlayer(
  userId: string,
  accessToken: string
): Promise<DeletePlayerResult> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return {
      error: "Player is required.",
    };
  }

  const authResult = await verifyAdminAction(accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
    };
  }

  const adminClient = createClient<Database>(
    authResult.context.supabaseUrl,
    authResult.context.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { error } = await adminClient.auth.admin.deleteUser(normalizedUserId);

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/profile");
  revalidatePath("/my-team");
  revalidatePath("/matches");
  revalidatePath("/tournament");

  return {
    error: null,
  };
}

export async function deleteTeam(
  teamId: string,
  accessToken: string
): Promise<DeleteTeamResult> {
  const normalizedTeamId = teamId.trim();

  if (!normalizedTeamId) {
    return {
      error: "Team is required.",
    };
  }

  const authResult = await verifyAdminAction(accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
    };
  }

  const adminClient = createClient<Database>(
    authResult.context.supabaseUrl,
    authResult.context.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: matches, error: matchesError } = await adminClient
    .from("tournament_matches")
    .select("id")
    .or(`team_a_id.eq.${normalizedTeamId},team_b_id.eq.${normalizedTeamId}`);

  if (matchesError) {
    return {
      error: matchesError.message,
    };
  }

  const matchIds = (matches ?? []).map((match) => match.id);

  if (matchIds.length > 0) {
    const { error: deleteCheckInsError } = await adminClient
      .from("match_check_ins")
      .delete()
      .in("match_id", matchIds);

    if (deleteCheckInsError) {
      return {
        error: deleteCheckInsError.message,
      };
    }

    const { error: deleteMatchesError } = await adminClient
      .from("tournament_matches")
      .delete()
      .in("id", matchIds);

    if (deleteMatchesError) {
      return {
        error: deleteMatchesError.message,
      };
    }
  }

  const { error: deleteTeamError } = await adminClient
    .from("teams")
    .delete()
    .eq("id", normalizedTeamId);

  if (deleteTeamError) {
    return {
      error: deleteTeamError.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/my-team");
  revalidatePath("/profile");
  revalidatePath("/matches");
  revalidatePath("/tournament");

  return {
    error: null,
  };
}

type AdminForceConfirmTeamResult = {
  error: string | null;
};

type AdminRemovePlayerFromTeamResult = {
  error: string | null;
};

type AdminForceAddPlayerToTeamResult = {
  error: string | null;
};

type ToggleTeamSuspensionResult = {
  error: string | null;
};

type UpdateTournamentMatchActionInput = {
  accessToken: string;
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
};

type UpdateTournamentMatchActionResult = {
  error: string | null;
};

type TournamentConfirmationInsert =
  Database["public"]["Tables"]["tournament_confirmations"]["Insert"];
type TournamentMatchInsert =
  Database["public"]["Tables"]["tournament_matches"]["Insert"];

type GenerateGroupStageMatchesResult = {
  error: string | null;
  matchCount: number;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAdminMatchPayload(params: {
  tournamentId: string;
  teamAId: string;
  teamBId: string;
  roundLabel: string;
  scheduledAt: string;
  status: string;
  teamAScore: string;
  teamBScore: string;
  format: string;
}): TournamentMatchInsert {
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

  return {
    tournament_id: params.tournamentId,
    team_a_id: params.teamAId,
    team_b_id: params.teamBId,
    round_label: roundLabel,
    scheduled_at: normalizedScheduledAt || null,
    status: normalizedStatus,
    team_a_score: normalizedStatus === "finished" ? parseScore(params.teamAScore) : null,
    team_b_score: normalizedStatus === "finished" ? parseScore(params.teamBScore) : null,
    display_order: 0,
    format: normalizedFormat,
  };
}

function generateRoundRobinPairings(teamIds: string[]): Array<[string, string]> {
  const pairings: Array<[string, string]> = [];

  for (let teamAIndex = 0; teamAIndex < teamIds.length - 1; teamAIndex += 1) {
    for (
      let teamBIndex = teamAIndex + 1;
      teamBIndex < teamIds.length;
      teamBIndex += 1
    ) {
      pairings.push([teamIds[teamAIndex], teamIds[teamBIndex]]);
    }
  }

  return pairings;
}

export async function adminForceConfirmTeam(
  teamId: string,
  tournamentId: string,
  accessToken: string
): Promise<AdminForceConfirmTeamResult> {
  const normalizedTeamId = teamId.trim();
  const normalizedTournamentId = tournamentId.trim();

  if (!normalizedTeamId || !normalizedTournamentId) {
    return {
      error: "Team and tournament are required.",
    };
  }

  const authResult = await verifyAdminAction(accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
    };
  }

  const adminClient = createClient<Database>(
    authResult.context.supabaseUrl,
    authResult.context.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: teamMembers, error: teamMembersError } = await adminClient
    .from("team_members")
    .select("user_id")
    .eq("team_id", normalizedTeamId);

  if (teamMembersError) {
    return {
      error: teamMembersError.message,
    };
  }

  if (!teamMembers || teamMembers.length === 0) {
    return {
      error: "This team does not have any members to confirm.",
    };
  }

  const confirmationRows: TournamentConfirmationInsert[] = teamMembers.map(
    (member) => ({
      tournament_id: normalizedTournamentId,
      user_id: member.user_id,
    })
  );

  const { error: confirmationsError } = await adminClient
    .from("tournament_confirmations")
    .upsert(confirmationRows, {
      onConflict: "tournament_id,user_id",
      ignoreDuplicates: true,
    });

  if (confirmationsError) {
    return {
      error: confirmationsError.message,
    };
  }

  revalidatePath("/admin");

  return {
    error: null,
  };
}

export async function updateTournamentMatchAction(
  input: UpdateTournamentMatchActionInput
): Promise<UpdateTournamentMatchActionResult> {
  const normalizedMatchId = input.matchId.trim();

  if (!normalizedMatchId) {
    return {
      error: "Match is required.",
    };
  }

  const authResult = await verifyAdminAction(input.accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
    };
  }

  try {
    const payload = normalizeAdminMatchPayload(input);
    const adminClient = createClient<Database>(
      authResult.context.supabaseUrl,
      authResult.context.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: oldMatch, error: existingMatchError } = await adminClient
      .from("tournament_matches")
      .select("scheduled_at")
      .eq("id", normalizedMatchId)
      .single();

    if (existingMatchError) {
      return {
        error: existingMatchError.message,
      };
    }

    const oldTime = oldMatch.scheduled_at
      ? new Date(oldMatch.scheduled_at).getTime()
      : null;
    const newTime = payload.scheduled_at
      ? new Date(payload.scheduled_at).getTime()
      : null;
    const timeChanged = oldTime !== newTime;

    if (timeChanged) {
      const { error: deleteCheckInsError } = await adminClient
        .from("match_check_ins")
        .delete()
        .eq("match_id", normalizedMatchId);

      if (deleteCheckInsError) {
        return {
          error: deleteCheckInsError.message,
        };
      }

      payload.lobby_name = null;
      payload.lobby_password = null;
    }

    const { error: updateError } = await adminClient
      .from("tournament_matches")
      .update(payload)
      .eq("id", normalizedMatchId);

    if (updateError) {
      return {
        error: updateError.message,
      };
    }

    revalidatePath("/admin");
    revalidatePath("/tournament");
    revalidatePath("/matches");
    revalidatePath(`/matches/${normalizedMatchId}`);
    revalidatePath("/", "layout");

    return {
      error: null,
    };
  } catch (error) {
    console.error("Match Update Failed:", error);
    return {
      error: error instanceof Error ? error.message : "Could not update match.",
    };
  }
}

export async function generateGroupStageMatches(
  tournamentId: string,
  teamIds: string[],
  startDateTime: string,
  matchIntervalMinutes: number
): Promise<GenerateGroupStageMatchesResult> {
  const normalizedTournamentId = tournamentId.trim();
  const normalizedStartDateTime = startDateTime.trim();
  const trimmedTeamIds = teamIds.map((teamId) => teamId.trim()).filter(Boolean);
  const normalizedTeamIds = Array.from(new Set(trimmedTeamIds));

  if (!normalizedTournamentId) {
    return {
      error: "Tournament is required.",
      matchCount: 0,
    };
  }

  if (trimmedTeamIds.length !== normalizedTeamIds.length) {
    return {
      error: "Selected teams must be unique.",
      matchCount: 0,
    };
  }

  if (normalizedTeamIds.length < 2) {
    return {
      error: "Select at least two teams to generate group stage matches.",
      matchCount: 0,
    };
  }

  if (!normalizedStartDateTime) {
    return {
      error: "Start date and time are required.",
      matchCount: 0,
    };
  }

  const parsedStartDateTime = new Date(normalizedStartDateTime);

  if (Number.isNaN(parsedStartDateTime.getTime())) {
    return {
      error: "Start date must be a valid ISO datetime.",
      matchCount: 0,
    };
  }

  const normalizedInterval = Number(matchIntervalMinutes);

  if (!Number.isInteger(normalizedInterval) || normalizedInterval < 0) {
    return {
      error: "Match interval must be a non-negative whole number of minutes.",
      matchCount: 0,
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
      matchCount: 0,
    };
  }

  try {
    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: tournament, error: tournamentError } = await adminClient
      .from("tournaments")
      .select("id")
      .eq("id", normalizedTournamentId)
      .maybeSingle();

    if (tournamentError) {
      return {
        error: tournamentError.message,
        matchCount: 0,
      };
    }

    if (!tournament) {
      return {
        error: "Tournament not found.",
        matchCount: 0,
      };
    }

    const { data: tournamentEntries, error: tournamentEntriesError } = await adminClient
      .from("tournament_team_entries")
      .select("team_id")
      .eq("tournament_id", normalizedTournamentId)
      .in("team_id", normalizedTeamIds);

    if (tournamentEntriesError) {
      return {
        error: tournamentEntriesError.message,
        matchCount: 0,
      };
    }

    const enteredTeamIds = new Set(
      ((tournamentEntries ?? []) as Array<{ team_id: string }>).map(
        (entry) => entry.team_id
      )
    );

    const invalidTeamIds = normalizedTeamIds.filter((teamId) => !enteredTeamIds.has(teamId));

    if (invalidTeamIds.length > 0) {
      return {
        error: "All selected teams must already be entered into the tournament.",
        matchCount: 0,
      };
    }

    const pairings = generateRoundRobinPairings(normalizedTeamIds);
    const matchIntervalInMs = normalizedInterval * 60 * 1000;
    const firstMatchTimeMs = parsedStartDateTime.getTime();
    const matchRows: TournamentMatchInsert[] = pairings.map(
      ([teamAId, teamBId], matchIndex) => ({
        ...normalizeAdminMatchPayload({
          tournamentId: normalizedTournamentId,
          teamAId,
          teamBId,
          roundLabel: "Group Stage",
          scheduledAt: new Date(
            firstMatchTimeMs + matchIndex * matchIntervalInMs
          ).toISOString(),
          status: "scheduled",
          teamAScore: "",
          teamBScore: "",
          format: "BO3",
        }),
        display_order: matchIndex,
      })
    );

    const { error: insertError } = await adminClient
      .from("tournament_matches")
      .insert(matchRows);

    if (insertError) {
      return {
        error: insertError.message,
        matchCount: 0,
      };
    }

    revalidatePath("/admin");
    revalidatePath("/tournament");
    revalidatePath("/matches");
    revalidatePath("/", "layout");

    return {
      error: null,
      matchCount: matchRows.length,
    };
  } catch (error) {
    console.error("Generate Group Stage Matches Failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not generate group stage matches.",
      matchCount: 0,
    };
  }
}

export async function adminRemovePlayerFromTeam(
  teamId: string,
  playerId: string
): Promise<AdminRemovePlayerFromTeamResult> {
  const normalizedTeamId = teamId.trim();
  const normalizedPlayerId = playerId.trim();

  if (!normalizedTeamId || !normalizedPlayerId) {
    return {
      error: "Team and player are required.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await adminClient
    .from("team_members")
    .delete()
    .eq("team_id", normalizedTeamId)
    .eq("user_id", normalizedPlayerId);

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/my-team");
  revalidatePath("/profile");

  return {
    error: null,
  };
}

export async function adminForceAddPlayerToTeam(
  teamId: string,
  playerIdentifier: string
): Promise<AdminForceAddPlayerToTeamResult> {
  const normalizedTeamId = teamId.trim();
  const normalizedPlayerIdentifier = playerIdentifier.trim();

  if (!normalizedTeamId || !normalizedPlayerIdentifier) {
    return {
      error: "Team and player identifier are required.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let resolvedUserId: string | null = null;

  if (!resolvedUserId) {
    const { data: profileByNickname, error: profileByNicknameError } =
      await adminClient
        .from("profiles")
        .select("id")
        .ilike("nickname", normalizedPlayerIdentifier)
        .maybeSingle();

    if (profileByNicknameError) {
      return {
        error: profileByNicknameError.message,
      };
    }

    if (profileByNickname) {
      resolvedUserId = profileByNickname.id;
    }
  }

  if (!resolvedUserId && isValidEmail(normalizedPlayerIdentifier)) {
    const { data: usersData, error: usersError } =
      await adminClient.auth.admin.listUsers();

    if (usersError) {
      return {
        error: usersError.message,
      };
    }

    const matchedUser =
      usersData.users.find(
        (user) =>
          user.email?.toLowerCase() === normalizedPlayerIdentifier.toLowerCase()
      ) ?? null;

    if (matchedUser) {
      const { data: profileByResolvedId, error: profileByResolvedIdError } =
        await adminClient
          .from("profiles")
          .select("id")
          .eq("id", matchedUser.id)
          .maybeSingle();

      if (profileByResolvedIdError) {
        return {
          error: profileByResolvedIdError.message,
        };
      }

      if (profileByResolvedId) {
        resolvedUserId = profileByResolvedId.id;
      }
    }
  }

  if (!resolvedUserId) {
    return {
      error: "Could not find a player for that ID, email, or username.",
    };
  }

  const { data: existingMembership, error: existingMembershipError } = await adminClient
    .from("team_members")
    .select("team_id")
    .eq("user_id", resolvedUserId)
    .maybeSingle();

  if (existingMembershipError) {
    return {
      error: existingMembershipError.message,
    };
  }

  if (existingMembership) {
    return {
      error: "This player is already assigned to a team.",
    };
  }

  const { error: insertError } = await adminClient.from("team_members").insert({
    team_id: normalizedTeamId,
    user_id: resolvedUserId,
    is_captain: false,
  });

  if (insertError) {
    return {
      error: insertError.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/my-team");
  revalidatePath("/profile");

  return {
    error: null,
  };
}

export async function toggleTeamSuspension(
  tournamentId: string,
  teamId: string,
  isSuspended: boolean
): Promise<ToggleTeamSuspensionResult> {
  const normalizedTournamentId = tournamentId.trim();
  const normalizedTeamId = teamId.trim();

  if (!normalizedTournamentId || !normalizedTeamId) {
    return {
      error: "Tournament and team are required.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await adminClient
    .from("tournament_team_entries")
    .update({ is_suspended: isSuspended })
    .eq("tournament_id", normalizedTournamentId)
    .eq("team_id", normalizedTeamId);

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/tournament");

  return {
    error: null,
  };
}
