"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  listPlayerMedalsForUsersWithClient,
  type PlayerMedalValue,
  type PlayerMedalWithTournament,
} from "@/lib/supabase/player-medals";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveTaskCountsForUsers } from "@/lib/supabase/tasks";

type CreateAdminPlayerInput = {
  accessToken: string;
  email: string;
  nickname: string;
  password: string;
};

type CreateAdminPlayerResult = {
  error: string | null;
};

export type AdminPlayerMedalItem = PlayerMedalWithTournament;

export type AdminPlayerListItem = {
  id: string;
  nickname: string;
  email: string;
  openTaskCount: number;
  mmr: number | null;
  mmrStatus: "pending" | "verified" | "rejected";
  behaviorScore: number;
  medals: AdminPlayerMedalItem[];
};

export type AdminTournamentResultItem = {
  tournamentId: string;
  teamId: string;
  placement: 1 | 2 | 3;
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

type ListAdminTournamentResultsResult =
  | {
      error: string;
      results: [];
    }
  | {
      error: null;
      results: AdminTournamentResultItem[];
    };

type DeletePlayerResult = {
  error: string | null;
};

type ResetPlayerDeviceBindingResult = {
  error: string | null;
};

type UpdateMMRStatusResult = {
  error: string | null;
};

type UpdateAdminPlayerMMRResult = {
  error: string | null;
};

type ResetPlayerBehaviorScoreResult = {
  error: string | null;
};

type SetPlayerMedalResult = {
  error: string | null;
};

type DeleteTeamResult = {
  error: string | null;
};

type DeleteMatchResult = {
  error: string | null;
};

type EnableTournamentMatchAdminOverrideResult = {
  error: string | null;
};

type ResolveTimedOutTournamentMatchResult = {
  error: string | null;
};

type DeleteMultipleMatchesResult = {
  error: string | null;
};

type DeleteTournamentResult = {
  error: string | null;
};

type RecordTournamentResultResult = {
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
  let mmrByUserId = new Map<string, number | null>();
  let mmrStatusByUserId = new Map<string, "pending" | "verified" | "rejected">();
  let behaviorScoreByUserId = new Map<string, number>();
  let medalsByUserId = {} as Record<string, AdminPlayerMedalItem[]>;
  let openTaskCountByUserId = {} as Record<string, number>;

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, nickname, mmr, mmr_status, behavior_score")
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

    mmrByUserId = new Map(
      (
        (profiles ?? []) as Array<{
          id: string;
          mmr: number | null;
        }>
      ).map((profile) => [profile.id, profile.mmr ?? null])
    );

    mmrStatusByUserId = new Map(
      (
        (profiles ?? []) as Array<{
          id: string;
          mmr_status: "pending" | "verified" | "rejected" | null;
        }>
      ).map((profile) => [profile.id, profile.mmr_status ?? "pending"])
    );

    behaviorScoreByUserId = new Map(
      (
        (profiles ?? []) as Array<{
          id: string;
          behavior_score: number | null;
        }>
      ).map((profile) => [profile.id, profile.behavior_score ?? 5])
    );

    medalsByUserId = await listPlayerMedalsForUsersWithClient(adminClient, userIds);
    openTaskCountByUserId = await getActiveTaskCountsForUsers(adminClient, userIds);
  }

  const players = users
    .map((user) => ({
      id: user.id,
      nickname: nicknameByUserId.get(user.id) ?? user.user_metadata?.nickname ?? "Unknown",
      email: user.email ?? "No email",
      openTaskCount: openTaskCountByUserId[user.id] ?? 0,
      mmr: mmrByUserId.get(user.id) ?? null,
      mmrStatus: mmrStatusByUserId.get(user.id) ?? "pending",
      behaviorScore: behaviorScoreByUserId.get(user.id) ?? 5,
      medals: medalsByUserId[user.id] ?? [],
    }))
    .sort((playerA, playerB) => playerA.nickname.localeCompare(playerB.nickname));

  return {
    error: null,
    players,
  };
}

export async function listAdminTournamentResults(
  accessToken: string
): Promise<ListAdminTournamentResultsResult> {
  const authResult = await verifyAdminAction(accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
      results: [],
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

  const { data, error } = await adminClient
    .from("tournament_results")
    .select("tournament_id, team_id, placement");

  if (error) {
    return {
      error: error.message,
      results: [],
    };
  }

  return {
    error: null,
    results: ((data ?? []) as Array<{
      tournament_id: string;
      team_id: string;
      placement: number;
    }>)
      .filter((result) => [1, 2, 3].includes(result.placement))
      .map((result) => ({
        tournamentId: result.tournament_id,
        teamId: result.team_id,
        placement: result.placement as 1 | 2 | 3,
      })),
  };
}

export async function updateMMRStatus(
  userId: string,
  newStatus: string
): Promise<UpdateMMRStatusResult> {
  const normalizedUserId = userId.trim();
  const normalizedStatus = newStatus.trim();

  if (!normalizedUserId) {
    return {
      error: "Player ID is required.",
    };
  }

  if (!["pending", "verified", "rejected"].includes(normalizedStatus)) {
    return {
      error: "Invalid MMR status.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Could not verify admin session.",
    };
  }

  const { data: actingProfile, error: actingProfileError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfileError || !actingProfile?.is_admin) {
    return {
      error: "You do not have admin access for this action.",
    };
  }

  const adminClient = createClient<Database>(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { error } = await adminClient
    .from("profiles")
    .update({
      mmr_status: normalizedStatus,
    })
    .eq("id", normalizedUserId);

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/admin");

  return {
    error: null,
  };
}

export async function updateAdminPlayerMMR(
  userId: string,
  mmr: number | null
): Promise<UpdateAdminPlayerMMRResult> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return {
      error: "Player ID is required.",
    };
  }

  const normalizedMMR = mmr === null ? null : Number(mmr);

  if (normalizedMMR !== null && (!Number.isInteger(normalizedMMR) || normalizedMMR <= 0)) {
    return {
      error: "Укажите корректный текущий MMR.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Could not verify admin session.",
    };
  }

  const { data: actingProfile, error: actingProfileError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfileError || !actingProfile?.is_admin) {
    return {
      error: "You do not have admin access for this action.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await adminClient
    .from("profiles")
    .update({
      mmr: normalizedMMR,
    })
    .eq("id", normalizedUserId);

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/profile");
  revalidatePath("/join-team");
  revalidatePath("/my-team");

  return {
    error: null,
  };
}

export async function resetPlayerBehaviorScore(
  userId: string
): Promise<ResetPlayerBehaviorScoreResult> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return {
      error: "Player ID is required.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Could not verify admin session.",
    };
  }

  const { data: actingProfile, error: actingProfileError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfileError || !actingProfile?.is_admin) {
    return {
      error: "You do not have admin access for this action.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: playerProfile, error: playerProfileError } = await adminClient
    .from("profiles")
    .select("behavior_score")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (playerProfileError) {
    return {
      error: playerProfileError.message,
    };
  }

  if (!playerProfile) {
    return {
      error: "Player profile not found.",
    };
  }

  const currentBehaviorScore = playerProfile.behavior_score ?? 5;
  const scoreChange = 5 - currentBehaviorScore;

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      behavior_score: 5,
    })
    .eq("id", normalizedUserId);

  if (updateError) {
    return {
      error: updateError.message,
    };
  }

  const { error: logError } = await adminClient.from("behavior_logs").insert({
    user_id: normalizedUserId,
    match_id: null,
    score_change: scoreChange,
    reason: "Ручной сброс баллов администратором",
  });

  if (logError) {
    return {
      error: logError.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/profile");

  return {
    error: null,
  };
}

export async function setPlayerMedal(
  userId: string,
  tournamentId: string,
  medal: PlayerMedalValue | null
): Promise<SetPlayerMedalResult> {
  const normalizedUserId = userId.trim();
  const normalizedTournamentId = tournamentId.trim();

  if (!normalizedUserId) {
    return {
      error: "Player ID is required.",
    };
  }

  if (!normalizedTournamentId) {
    return {
      error: "Tournament is required.",
    };
  }

  if (medal !== null && medal !== "gold" && medal !== "silver" && medal !== "bronze") {
    return {
      error: "Invalid tournament medal.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Could not verify admin session.",
    };
  }

  const { data: actingProfile, error: actingProfileError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfileError || !actingProfile?.is_admin) {
    return {
      error: "You do not have admin access for this action.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: existingMedal, error: existingMedalError } = await adminClient
    .from("player_medals")
    .select("id")
    .eq("user_id", normalizedUserId)
    .eq("tournament_id", normalizedTournamentId)
    .maybeSingle();

  if (existingMedalError) {
    return {
      error: existingMedalError.message,
    };
  }

  if (medal === null) {
    if (existingMedal) {
      const { error: deleteMedalError } = await adminClient
        .from("player_medals")
        .delete()
        .eq("id", existingMedal.id);

      if (deleteMedalError) {
        return {
          error: deleteMedalError.message,
        };
      }
    }
  } else if (existingMedal) {
    const { error: updateMedalError } = await adminClient
      .from("player_medals")
      .update({
        medal,
      })
      .eq("id", existingMedal.id);

    if (updateMedalError) {
      return {
        error: updateMedalError.message,
      };
    }
  } else {
    const { error: insertMedalError } = await adminClient.from("player_medals").insert({
      user_id: normalizedUserId,
      tournament_id: normalizedTournamentId,
      medal,
    });

    if (insertMedalError) {
      return {
        error: insertMedalError.message,
      };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/profile");
  revalidatePath("/tournament");

  return {
    error: null,
  };
}

export async function resetPlayerDeviceBinding(
  userId: string,
  accessToken: string
): Promise<ResetPlayerDeviceBindingResult> {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId) {
    return {
      error: "Player ID is required.",
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

  const { error } = await adminClient
    .from("user_passkeys")
    .delete()
    .eq("user_id", trimmedUserId);

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/profile");

  return {
    error: null,
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

  const { data: activeTournamentEntry, error: activeTournamentEntryError } = await adminClient
    .from("tournament_team_entries")
    .select("id, is_suspended, tournaments!inner(is_active)")
    .eq("team_id", normalizedTeamId)
    .eq("tournaments.is_active", true)
    .maybeSingle();

  if (activeTournamentEntryError) {
    return {
      error: activeTournamentEntryError.message,
    };
  }

  const typedActiveTournamentEntry = activeTournamentEntry as
    | {
        id: string;
        is_suspended: boolean;
        tournaments:
          | {
              is_active: boolean;
            }
          | Array<{
              is_active: boolean;
            }>
          | null;
      }
    | null;

  if (typedActiveTournamentEntry && !typedActiveTournamentEntry.is_suspended) {
    return {
      error: "This team has already entered the active tournament, so its roster is locked.",
    };
  }

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
    const { error: deleteBehaviorLogsError } = await adminClient
      .from("behavior_logs")
      .delete()
      .in("match_id", matchIds);

    if (deleteBehaviorLogsError) {
      return {
        error: deleteBehaviorLogsError.message,
      };
    }

    const { error: deleteLobbyPhotosError } = await adminClient
      .from("match_lobby_photos")
      .delete()
      .in("match_id", matchIds);

    if (deleteLobbyPhotosError) {
      return {
        error: deleteLobbyPhotosError.message,
      };
    }

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

  const { error: deleteTournamentResultsError } = await adminClient
    .from("tournament_results")
    .delete()
    .eq("team_id", normalizedTeamId);

  if (deleteTournamentResultsError) {
    return {
      error: deleteTournamentResultsError.message,
    };
  }

  const { error: deleteTournamentEntriesError } = await adminClient
    .from("tournament_team_entries")
    .delete()
    .eq("team_id", normalizedTeamId);

  if (deleteTournamentEntriesError) {
    return {
      error: deleteTournamentEntriesError.message,
    };
  }

  const { error: deleteTeamMembersError } = await adminClient
    .from("team_members")
    .delete()
    .eq("team_id", normalizedTeamId);

  if (deleteTeamMembersError) {
    return {
      error: deleteTeamMembersError.message,
    };
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

export async function deleteMatch(
  matchId: string,
  accessToken: string
): Promise<DeleteMatchResult> {
  const normalizedMatchId = matchId.trim();

  if (!normalizedMatchId) {
    return {
      error: "Match is required.",
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

  try {
    const { error: deleteBehaviorLogsError } = await adminClient
      .from("behavior_logs")
      .delete()
      .eq("match_id", normalizedMatchId);

    if (deleteBehaviorLogsError) {
      return {
        error: deleteBehaviorLogsError.message,
      };
    }

    const { error: deletePhotosError } = await adminClient
      .from("match_lobby_photos")
      .delete()
      .eq("match_id", normalizedMatchId);

    if (deletePhotosError) {
      return {
        error: deletePhotosError.message,
      };
    }

    const { error: deleteCheckInsError } = await adminClient
      .from("match_check_ins")
      .delete()
      .eq("match_id", normalizedMatchId);

    if (deleteCheckInsError) {
      return {
        error: deleteCheckInsError.message,
      };
    }

    const { error: deleteMatchError } = await adminClient
      .from("tournament_matches")
      .delete()
      .eq("id", normalizedMatchId);

    if (deleteMatchError) {
      return {
        error: deleteMatchError.message,
      };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not delete this match.",
    };
  }

  revalidatePath("/tournament");
  revalidatePath("/matches");
  revalidatePath(`/matches/${normalizedMatchId}`);
  revalidatePath("/admin");

  return {
    error: null,
  };
}

export async function deleteTournament(
  tournamentId: string
): Promise<DeleteTournamentResult> {
  const normalizedTournamentId = tournamentId.trim();

  if (!normalizedTournamentId) {
    return {
      error: "Tournament is required.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Could not verify admin session.",
    };
  }

  const { data: actingProfile, error: actingProfileError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfileError || !actingProfile?.is_admin) {
    return {
      error: "You do not have admin access for this action.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: matches, error: matchesError } = await adminClient
    .from("tournament_matches")
    .select("id")
    .eq("tournament_id", normalizedTournamentId);

  if (matchesError) {
    return {
      error: matchesError.message,
    };
  }

  const matchIds = (matches ?? []).map((match) => match.id as string);

  if (matchIds.length > 0) {
    const { error: deleteBehaviorLogsError } = await adminClient
      .from("behavior_logs")
      .delete()
      .in("match_id", matchIds);

    if (deleteBehaviorLogsError) {
      return {
        error: deleteBehaviorLogsError.message,
      };
    }

    const { error: deleteLobbyPhotosError } = await adminClient
      .from("match_lobby_photos")
      .delete()
      .in("match_id", matchIds);

    if (deleteLobbyPhotosError) {
      return {
        error: deleteLobbyPhotosError.message,
      };
    }

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

  const { error: deleteConfirmationsError } = await adminClient
    .from("tournament_confirmations")
    .delete()
    .eq("tournament_id", normalizedTournamentId);

  if (deleteConfirmationsError) {
    return {
      error: deleteConfirmationsError.message,
    };
  }

  const { error: deleteEntriesError } = await adminClient
    .from("tournament_team_entries")
    .delete()
    .eq("tournament_id", normalizedTournamentId);

  if (deleteEntriesError) {
    return {
      error: deleteEntriesError.message,
    };
  }

  const { error: deletePlayerMedalsError } = await adminClient
    .from("player_medals")
    .delete()
    .eq("tournament_id", normalizedTournamentId);

  if (deletePlayerMedalsError) {
    return {
      error: deletePlayerMedalsError.message,
    };
  }

  const { error: deleteTournamentError } = await adminClient
    .from("tournaments")
    .delete()
    .eq("id", normalizedTournamentId);

  if (deleteTournamentError) {
    return {
      error: deleteTournamentError.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/tournament");
  revalidatePath("/matches");
  revalidatePath("/tasks");
  revalidatePath("/profile");

  return {
    error: null,
  };
}

export async function recordTournamentResult(
  tournamentId: string,
  teamId: string | null,
  placement: number
): Promise<RecordTournamentResultResult> {
  const normalizedTournamentId = tournamentId.trim();
  const normalizedTeamId = teamId?.trim() ?? "";
  const normalizedPlacement = Number(placement);

  if (!normalizedTournamentId) {
    return {
      error: "Tournament is required.",
    };
  }

  if (![1, 2, 3].includes(normalizedPlacement)) {
    return {
      error: "Placement must be 1, 2, or 3.",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Could not verify admin session.",
    };
  }

  const { data: actingProfile, error: actingProfileError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (actingProfileError || !actingProfile?.is_admin) {
    return {
      error: "You do not have admin access for this action.",
    };
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: previousResults, error: previousResultsError } = await adminClient
    .from("tournament_results")
    .select("id, team_id, placement")
    .eq("tournament_id", normalizedTournamentId);

  if (previousResultsError) {
    return {
      error: previousResultsError.message,
    };
  }

  const existingPlacementResult = ((previousResults ?? []) as Array<{
    id: string;
    team_id: string;
    placement: number;
  }>).find((result) => result.placement === normalizedPlacement);

  if (!normalizedTeamId) {
    if (existingPlacementResult) {
      const { error: deleteResultError } = await adminClient
        .from("tournament_results")
        .delete()
        .eq("id", existingPlacementResult.id);

      if (deleteResultError) {
        return {
          error: deleteResultError.message,
        };
      }
    }

    revalidatePath("/admin");
    revalidatePath("/tournament");

    return {
      error: null,
    };
  }

  if (existingPlacementResult) {
    const { error: updateResultError } = await adminClient
      .from("tournament_results")
      .update({
        team_id: normalizedTeamId,
      })
      .eq("id", existingPlacementResult.id);

    if (updateResultError) {
      return {
        error: updateResultError.message,
      };
    }
  } else {
    const { error: insertResultError } = await adminClient
      .from("tournament_results")
      .insert({
        tournament_id: normalizedTournamentId,
        team_id: normalizedTeamId,
        placement: normalizedPlacement,
      });

    if (insertResultError) {
      return {
        error: insertResultError.message,
      };
    }
  }

  const { data: currentResults, error: currentResultsError } = await adminClient
    .from("tournament_results")
    .select("team_id, placement")
    .eq("tournament_id", normalizedTournamentId);

  if (currentResultsError) {
    return {
      error: currentResultsError.message,
    };
  }

  const affectedTeamIds = Array.from(
    new Set([
      ...((previousResults ?? []) as Array<{ team_id: string }>).map((result) => result.team_id),
      ...((currentResults ?? []) as Array<{ team_id: string }>).map((result) => result.team_id),
    ])
  );

  if (affectedTeamIds.length > 0) {
    const { data: memberships, error: membershipsError } = await adminClient
      .from("team_members")
      .select("team_id, user_id")
      .in("team_id", affectedTeamIds);

    if (membershipsError) {
      return {
        error: membershipsError.message,
      };
    }

    const typedMemberships = (memberships ?? []) as Array<{
      team_id: string;
      user_id: string;
    }>;
    const memberUserIds = Array.from(new Set(typedMemberships.map((membership) => membership.user_id)));

    const { data: tournamentConfirmations, error: tournamentConfirmationsError } =
      memberUserIds.length > 0
        ? await adminClient
            .from("tournament_confirmations")
            .select("user_id")
            .eq("tournament_id", normalizedTournamentId)
            .in("user_id", memberUserIds)
        : { data: [], error: null };

    if (tournamentConfirmationsError) {
      return {
        error: tournamentConfirmationsError.message,
      };
    }

    const confirmedUserIdSet = new Set(
      ((tournamentConfirmations ?? []) as Array<{ user_id: string }>).map(
        (confirmation) => confirmation.user_id
      )
    );
    const teamConfirmedUserIds = new Map<string, string[]>();

    for (const membership of typedMemberships) {
      if (!confirmedUserIdSet.has(membership.user_id)) {
        continue;
      }

      const teamUserIds = teamConfirmedUserIds.get(membership.team_id) ?? [];
      teamUserIds.push(membership.user_id);
      teamConfirmedUserIds.set(membership.team_id, teamUserIds);
    }

    const affectedUserIds = Array.from(
      new Set(Array.from(teamConfirmedUserIds.values()).flat())
    );

    if (affectedUserIds.length > 0) {
      const { error: clearMedalsError } = await adminClient
        .from("player_medals")
        .delete()
        .eq("tournament_id", normalizedTournamentId)
        .in("user_id", affectedUserIds);

      if (clearMedalsError) {
        return {
          error: clearMedalsError.message,
        };
      }
    }

    const medalByPlacement: Record<1 | 2 | 3, PlayerMedalValue> = {
      1: "gold",
      2: "silver",
      3: "bronze",
    };
    const medalsToInsert: Database["public"]["Tables"]["player_medals"]["Insert"][] = [];

    for (const result of (currentResults ?? []) as Array<{
      team_id: string;
      placement: number;
    }>) {
      const medal = medalByPlacement[result.placement as 1 | 2 | 3];
      const userIds = teamConfirmedUserIds.get(result.team_id) ?? [];

      if (!medal || userIds.length === 0) {
        continue;
      }

      medalsToInsert.push(
        ...userIds.map((userId) => ({
          user_id: userId,
          tournament_id: normalizedTournamentId,
          medal,
        }))
      );
    }

    if (medalsToInsert.length > 0) {
      const { error: insertMedalsError } = await adminClient
        .from("player_medals")
        .insert(medalsToInsert);

      if (insertMedalsError) {
        return {
          error: insertMedalsError.message,
        };
      }
    }
  }

  revalidatePath("/admin");
  revalidatePath("/profile");
  revalidatePath("/tournament");

  return {
    error: null,
  };
}

export async function deleteMultipleMatches(
  matchIds: string[],
  accessToken: string
): Promise<DeleteMultipleMatchesResult> {
  const normalizedMatchIds = Array.from(
    new Set(matchIds.map((matchId) => matchId.trim()).filter(Boolean))
  );

  if (normalizedMatchIds.length === 0) {
    return {
      error: "At least one match is required.",
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

  try {
    const { error: deleteBehaviorLogsError } = await adminClient
      .from("behavior_logs")
      .delete()
      .in("match_id", normalizedMatchIds);

    if (deleteBehaviorLogsError) {
      return {
        error: deleteBehaviorLogsError.message,
      };
    }

    const { error: deletePhotosError } = await adminClient
      .from("match_lobby_photos")
      .delete()
      .in("match_id", normalizedMatchIds);

    if (deletePhotosError) {
      return {
        error: deletePhotosError.message,
      };
    }

    const { error: deleteCheckInsError } = await adminClient
      .from("match_check_ins")
      .delete()
      .in("match_id", normalizedMatchIds);

    if (deleteCheckInsError) {
      return {
        error: deleteCheckInsError.message,
      };
    }

    const { error: deleteMatchesError } = await adminClient
      .from("tournament_matches")
      .delete()
      .in("id", normalizedMatchIds);

    if (deleteMatchesError) {
      return {
        error: deleteMatchesError.message,
      };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not delete the selected matches.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/tournament");
  revalidatePath("/matches");
  for (const matchId of normalizedMatchIds) {
    revalidatePath(`/matches/${matchId}`);
  }

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

const REQUIRED_TEAM_CHECK_INS = 5;
const MATCH_CHECK_IN_TIMEOUT_MS = 15 * 60 * 1000;

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
    params.format === "BO1" ||
    params.format === "BO2" ||
    params.format === "BO5"
      ? params.format
      : "BO3";
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
  if (teamIds.length < 2) {
    return [];
  }

  const rotatingTeams: Array<string | null> =
    teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const rounds: Array<Array<[string, string]>> = [];
  const roundsToPlay = rotatingTeams.length - 1;
  const matchesPerRound = rotatingTeams.length / 2;

  for (let roundIndex = 0; roundIndex < roundsToPlay; roundIndex += 1) {
    const roundPairings: Array<[string, string]> = [];

    for (let matchIndex = 0; matchIndex < matchesPerRound; matchIndex += 1) {
      const teamAId = rotatingTeams[matchIndex];
      const teamBId = rotatingTeams[rotatingTeams.length - 1 - matchIndex];

      if (!teamAId || !teamBId) {
        continue;
      }

      roundPairings.push(
        matchIndex === 0 && roundIndex % 2 === 1
          ? [teamBId, teamAId]
          : [teamAId, teamBId]
      );
    }

    rounds.push(roundPairings);

    const fixedTeam = rotatingTeams[0];
    const rotatedTeams = rotatingTeams.slice(1);
    const lastRotatingTeam = rotatedTeams.pop() ?? null;

    rotatedTeams.unshift(lastRotatingTeam);
    rotatingTeams.splice(0, rotatingTeams.length, fixedTeam, ...rotatedTeams);
  }

  return rounds.reduce<Array<[string, string]>>((allPairings, roundPairings) => {
    allPairings.push(...roundPairings);
    return allPairings;
  }, []);
}

type ScheduleDateParts = {
  year: number;
  monthIndex: number;
  day: number;
};

const SCHEDULE_TIME_ZONE = "Asia/Almaty";

function parseScheduleDate(value: string): ScheduleDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    year,
    monthIndex: month - 1,
    day,
  };
}

function parseScheduleTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function compareScheduleDates(left: ScheduleDateParts, right: ScheduleDateParts) {
  return (
    Date.UTC(left.year, left.monthIndex, left.day) -
    Date.UTC(right.year, right.monthIndex, right.day)
  );
}

function addDaysToScheduleDate(date: ScheduleDateParts, days: number): ScheduleDateParts {
  const nextDate = new Date(Date.UTC(date.year, date.monthIndex, date.day + days));

  return {
    year: nextDate.getUTCFullYear(),
    monthIndex: nextDate.getUTCMonth(),
    day: nextDate.getUTCDate(),
  };
}

function parseTimeZoneOffsetMinutes(offsetLabel: string) {
  if (offsetLabel === "GMT" || offsetLabel === "UTC") {
    return 0;
  }

  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offsetLabel);

  if (!match) {
    throw new Error(`Unsupported time zone offset: ${offsetLabel}`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(utcTimestampMs: number, timeZone: string) {
  const formattedParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(utcTimestampMs));
  const offsetLabel =
    formattedParts.find((part) => part.type === "timeZoneName")?.value ?? "UTC";

  return parseTimeZoneOffsetMinutes(offsetLabel);
}

function createScheduledAtIso(date: ScheduleDateParts, minutesFromMidnight: number) {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const wallClockUtcMs = Date.UTC(date.year, date.monthIndex, date.day, hours, minutes);
  const initialOffsetMinutes = getTimeZoneOffsetMinutes(wallClockUtcMs, SCHEDULE_TIME_ZONE);
  let scheduledAtMs = wallClockUtcMs - initialOffsetMinutes * 60 * 1000;
  const adjustedOffsetMinutes = getTimeZoneOffsetMinutes(
    scheduledAtMs,
    SCHEDULE_TIME_ZONE
  );

  if (adjustedOffsetMinutes !== initialOffsetMinutes) {
    scheduledAtMs = wallClockUtcMs - adjustedOffsetMinutes * 60 * 1000;
  }

  return new Date(scheduledAtMs).toISOString();
}

function scheduleRoundRobinMatches(params: {
  pairings: Array<[string, string]>;
  startDate: string;
  endDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
  matchIntervalMinutes: number;
}) {
  const startDate = parseScheduleDate(params.startDate);
  const endDate = parseScheduleDate(params.endDate);

  if (!startDate) {
    throw new Error("Start date must be a valid date.");
  }

  if (!endDate) {
    throw new Error("End date must be a valid date.");
  }

  if (compareScheduleDates(startDate, endDate) > 0) {
    throw new Error("Start date must be on or before the end date.");
  }

  const dailyStartMinutes = parseScheduleTime(params.dailyStartTime);
  const dailyEndMinutes = parseScheduleTime(params.dailyEndTime);

  if (dailyStartMinutes === null) {
    throw new Error("Daily start time must be a valid time.");
  }

  if (dailyEndMinutes === null) {
    throw new Error("Daily end time must be a valid time.");
  }

  if (dailyStartMinutes >= dailyEndMinutes) {
    throw new Error("Daily start time must be earlier than the daily end time.");
  }

  const matchIntervalMinutes = Number(params.matchIntervalMinutes);

  if (!Number.isInteger(matchIntervalMinutes) || matchIntervalMinutes <= 0) {
    throw new Error("Match interval must be a positive whole number of minutes.");
  }

  const totalMatches = params.pairings.length;
  const totalDays =
    Math.floor(compareScheduleDates(endDate, startDate) / (24 * 60 * 60 * 1000)) + 1;
  const maxMatchesPerDay = Math.floor(
    (dailyEndMinutes - dailyStartMinutes) / matchIntervalMinutes
  );

  if (maxMatchesPerDay <= 0 || maxMatchesPerDay * totalDays < totalMatches) {
    throw new Error(
      "Not enough time slots to schedule all matches. Please extend the dates or adjust the times."
    );
  }

  const baseMatchesPerDay = Math.floor(totalMatches / totalDays);
  const extraMatchesDays = totalMatches % totalDays;
  const scheduledMatches: Array<{
    teamAId: string;
    teamBId: string;
    scheduledAt: string;
  }> = [];
  let pairingIndex = 0;
  let currentDate = startDate;

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
    const dailyQuota =
      baseMatchesPerDay + (dayIndex < extraMatchesDays ? 1 : 0);

    if (dailyQuota > maxMatchesPerDay) {
      throw new Error(
        "Not enough time slots to schedule all matches. Please extend the dates or adjust the times."
      );
    }

    for (let dayMatchIndex = 0; dayMatchIndex < dailyQuota; dayMatchIndex += 1) {
      const pairing = params.pairings[pairingIndex];

      if (!pairing) {
        break;
      }

      const [teamAId, teamBId] = pairing;
      const matchStartMinutes = dailyStartMinutes + dayMatchIndex * matchIntervalMinutes;

      if (matchStartMinutes + matchIntervalMinutes > dailyEndMinutes) {
        throw new Error(
          "Not enough time slots to schedule all matches. Please extend the dates or adjust the times."
        );
      }

      scheduledMatches.push({
        teamAId,
        teamBId,
        scheduledAt: createScheduledAtIso(currentDate, matchStartMinutes),
      });
      pairingIndex += 1;
    }

    currentDate = addDaysToScheduleDate(currentDate, 1);
  }

  if (pairingIndex < totalMatches) {
    throw new Error(
      "Not enough time slots to schedule all matches. Please extend the dates or adjust the times."
    );
  }

  return scheduledMatches;
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

export async function enableTournamentMatchAdminOverride(
  matchId: string,
  accessToken: string
): Promise<EnableTournamentMatchAdminOverrideResult> {
  const normalizedMatchId = matchId.trim();

  if (!normalizedMatchId) {
    return {
      error: "Match is required.",
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

  const { error } = await adminClient
    .from("tournament_matches")
    .update({
      admin_override: true,
    } as Database["public"]["Tables"]["tournament_matches"]["Update"] & {
      admin_override: boolean;
    })
    .eq("id", normalizedMatchId);

  if (error) {
    return {
      error: error.message,
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
}

export async function resolveTimedOutTournamentMatch(
  matchId: string,
  accessToken: string
): Promise<ResolveTimedOutTournamentMatchResult> {
  const normalizedMatchId = matchId.trim();

  if (!normalizedMatchId) {
    return {
      error: "Match is required.",
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

  const { data: match, error: matchError } = await adminClient
    .from("tournament_matches")
    .select("id, team_a_id, team_b_id, scheduled_at, status, admin_override")
    .eq("id", normalizedMatchId)
    .maybeSingle();

  if (matchError) {
    return {
      error: matchError.message,
    };
  }

  const typedMatch = match as
    | {
        id: string;
        team_a_id: string;
        team_b_id: string;
        scheduled_at: string | null;
        status: string;
        admin_override?: boolean | null;
      }
    | null;

  if (!typedMatch) {
    return {
      error: "Match not found.",
    };
  }

  const normalizedStatus = typedMatch.status.trim().toLowerCase();

  if (normalizedStatus === "finished" || normalizedStatus === "completed") {
    return {
      error: "This match has already been completed.",
    };
  }

  if (typedMatch.admin_override ?? false) {
    return {
      error: "Disable or avoid admin override before applying a technical result.",
    };
  }

  const scheduledTimeMs = typedMatch.scheduled_at
    ? new Date(typedMatch.scheduled_at).getTime()
    : Number.NaN;

  if (
    !Number.isFinite(scheduledTimeMs) ||
    Date.now() <= scheduledTimeMs + MATCH_CHECK_IN_TIMEOUT_MS
  ) {
    return {
      error: "This match has not reached the 15-minute check-in timeout yet.",
    };
  }

  const [teamMembershipsResult, checkInsResult] = await Promise.all([
    adminClient
      .from("team_members")
      .select("team_id, user_id")
      .in("team_id", [typedMatch.team_a_id, typedMatch.team_b_id]),
    adminClient
      .from("match_check_ins")
      .select("player_id, is_checked_in, is_ready")
      .eq("match_id", normalizedMatchId),
  ]);

  if (teamMembershipsResult.error) {
    return {
      error: teamMembershipsResult.error.message,
    };
  }

  if (checkInsResult.error) {
    return {
      error: checkInsResult.error.message,
    };
  }

  const playerTeamIdByUserId = new Map(
    (teamMembershipsResult.data ?? []).map((membership) => [
      membership.user_id,
      membership.team_id,
    ])
  );
  const teamAPlayerIds = new Set<string>();
  const teamBPlayerIds = new Set<string>();

  for (const row of checkInsResult.data ?? []) {
    if (!(row.is_ready || row.is_checked_in)) {
      continue;
    }

    const playerTeamId = playerTeamIdByUserId.get(row.player_id);

    if (playerTeamId === typedMatch.team_a_id) {
      teamAPlayerIds.add(row.player_id);
      continue;
    }

    if (playerTeamId === typedMatch.team_b_id) {
      teamBPlayerIds.add(row.player_id);
    }
  }

  const teamACheckInCount = teamAPlayerIds.size;
  const teamBCheckInCount = teamBPlayerIds.size;
  const teamAMissingPlayers = teamACheckInCount < REQUIRED_TEAM_CHECK_INS;
  const teamBMissingPlayers = teamBCheckInCount < REQUIRED_TEAM_CHECK_INS;

  if (!teamAMissingPlayers && !teamBMissingPlayers) {
    return {
      error: "Both teams already have all required check-ins.",
    };
  }

  let teamAScore = 0;
  let teamBScore = 0;
  let winnerTeamId: string | null = null;

  if (teamAMissingPlayers && !teamBMissingPlayers) {
    teamBScore = 1;
    winnerTeamId = typedMatch.team_b_id;
  } else if (!teamAMissingPlayers && teamBMissingPlayers) {
    teamAScore = 1;
    winnerTeamId = typedMatch.team_a_id;
  }

  const { error: updateError } = await adminClient
    .from("tournament_matches")
    .update({
      status: "finished",
      team_a_score: teamAScore,
      team_b_score: teamBScore,
      winner_team_id: winnerTeamId,
      is_forfeit: true,
    })
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
}

export async function generateGroupStageMatches(
  tournamentId: string,
  teamIds: string[],
  startDate: string,
  endDate: string,
  dailyStartTime: string,
  dailyEndTime: string,
  matchIntervalMinutes: number,
  format: string
): Promise<GenerateGroupStageMatchesResult> {
  const normalizedTournamentId = tournamentId.trim();
  const normalizedStartDate = startDate.trim();
  const normalizedEndDate = endDate.trim();
  const normalizedDailyStartTime = dailyStartTime.trim();
  const normalizedDailyEndTime = dailyEndTime.trim();
  const normalizedFormat =
    format.trim() === "BO1" ||
    format.trim() === "BO2" ||
    format.trim() === "BO5"
      ? format.trim()
      : "BO3";
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

  if (!normalizedStartDate || !normalizedEndDate) {
    return {
      error: "Start and end dates are required.",
      matchCount: 0,
    };
  }

  if (!normalizedDailyStartTime || !normalizedDailyEndTime) {
    return {
      error: "Daily start and end times are required.",
      matchCount: 0,
    };
  }

  const normalizedInterval = Number(matchIntervalMinutes);

  if (!Number.isInteger(normalizedInterval) || normalizedInterval <= 0) {
    return {
      error: "Match interval must be a positive whole number of minutes.",
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
    const scheduledMatches = scheduleRoundRobinMatches({
      pairings,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      dailyStartTime: normalizedDailyStartTime,
      dailyEndTime: normalizedDailyEndTime,
      matchIntervalMinutes: normalizedInterval,
    });
    const matchRows: TournamentMatchInsert[] = scheduledMatches.map(
      ({ teamAId, teamBId, scheduledAt }, matchIndex) => ({
        ...normalizeAdminMatchPayload({
          tournamentId: normalizedTournamentId,
          teamAId,
          teamBId,
          roundLabel: "Group Stage",
          scheduledAt,
          status: "scheduled",
          teamAScore: "",
          teamBScore: "",
          format: normalizedFormat,
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
