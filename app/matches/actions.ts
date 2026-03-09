"use server";

import { revalidatePath } from "next/cache";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  beginMatchBiometricVerification,
  completeMatchBiometricAuthentication,
  completeMatchBiometricRegistration,
  type BeginMatchBiometricVerificationResult,
  type CompleteMatchBiometricVerificationResult,
} from "@/lib/webauthn/server";

type CheckInResult = {
  error: string | null;
};

type SaveLobbyScreenshotResult = {
  error: string | null;
};

type MatchActionContext = {
  user: User;
  adminClient: SupabaseClient<Database>;
};

type MatchActionMatchRow = Database["public"]["Tables"]["tournament_matches"]["Row"];
type MatchCheckInRow = Database["public"]["Tables"]["match_check_ins"]["Row"];

type AuthorizedMatchActionContext = MatchActionContext & {
  match: MatchActionMatchRow;
  checkInRow: MatchCheckInRow | null;
};

const CHECK_IN_WINDOW_MS = 30 * 60 * 1000;

function random4DigitPassword(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getMatchActionEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
  };
}

async function getMatchActionContext(
  accessToken: string
): Promise<{ error: string | null; context: MatchActionContext | null }> {
  const env = getMatchActionEnv();

  if (!env) {
    return {
      error: "Missing Supabase server environment configuration.",
      context: null,
    };
  }

  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      error: "Could not verify your session. Please log in again.",
      context: null,
    };
  }

  const adminClient = createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    error: null,
    context: {
      user,
      adminClient,
    },
  };
}

async function getAuthorizedMatchActionContext(
  matchId: string,
  accessToken: string
): Promise<{
  error: string | null;
  context: AuthorizedMatchActionContext | null;
}> {
  const authResult = await getMatchActionContext(accessToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error,
      context: null,
    };
  }

  const { adminClient, user } = authResult.context;
  const { data: matchRow, error: matchError } = await adminClient
    .from("tournament_matches")
    .select("id, team_a_id, team_b_id, scheduled_at, lobby_name, lobby_password")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError || !matchRow) {
    return {
      error: "Матч не найден.",
      context: null,
    };
  }

  const typedMatch = matchRow as MatchActionMatchRow;
  const { data: membership, error: membershipError } = await adminClient
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .in("team_id", [typedMatch.team_a_id, typedMatch.team_b_id])
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      error: "Вы не входите в состав этого матча.",
      context: null,
    };
  }

  const { data: checkInRow, error: checkInError } = await adminClient
    .from("match_check_ins")
    .select("*")
    .eq("match_id", matchId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (checkInError) {
    return {
      error: "Не удалось загрузить статус чекина.",
      context: null,
    };
  }

  return {
    error: null,
    context: {
      user,
      adminClient,
      match: typedMatch,
      checkInRow: (checkInRow ?? null) as MatchCheckInRow | null,
    },
  };
}

function revalidateMatchPaths(matchId: string) {
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/matches");
  revalidatePath("/tournament");
}

export async function checkInToMatch(
  matchId: string,
  accessToken: string
): Promise<CheckInResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();

  if (!trimmedMatchId || !trimmedToken) {
    return { error: "Match and session are required." };
  }

  const authResult = await getAuthorizedMatchActionContext(
    trimmedMatchId,
    trimmedToken
  );

  if (authResult.error || !authResult.context) {
    return { error: authResult.error };
  }

  const { adminClient, checkInRow, match, user } = authResult.context;

  if (match.scheduled_at) {
    const scheduledTimeMs = new Date(match.scheduled_at).getTime();

    if (!Number.isNaN(scheduledTimeMs)) {
      const checkInOpensAtMs = scheduledTimeMs - CHECK_IN_WINDOW_MS;

      if (Date.now() < checkInOpensAtMs) {
        return {
          error: "Чекин откроется за 30 минут до начала матча.",
        };
      }
    }
  }

  if (!checkInRow?.biometric_verified) {
    return {
      error: "Сначала подтвердите личность через passkey.",
    };
  }

  if (checkInRow.is_checked_in) {
    return {
      error: "Вы уже прошли чек-ин.",
    };
  }

  const { error: updateError } = await adminClient
    .from("match_check_ins")
    .update({
      is_checked_in: true,
    })
    .eq("match_id", trimmedMatchId)
    .eq("player_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  const { count, error: countError } = await adminClient
    .from("match_check_ins")
    .select("player_id", {
      count: "exact",
      head: true,
    })
    .eq("match_id", trimmedMatchId)
    .eq("is_checked_in", true);

  if (countError || (count ?? 0) < 1) {
    revalidateMatchPaths(trimmedMatchId);
    return { error: null };
  }

  let lobbyName = match.lobby_name;
  let lobbyPassword = match.lobby_password;

  if (!lobbyName || !lobbyPassword) {
    lobbyName = `KHW_${trimmedMatchId}`;
    lobbyPassword = random4DigitPassword();

    const { error: updateError } = await adminClient
      .from("tournament_matches")
      .update({
        lobby_name: lobbyName,
        lobby_password: lobbyPassword,
      })
      .eq("id", trimmedMatchId);

    if (updateError) {
      revalidateMatchPaths(trimmedMatchId);
      return { error: null };
    }
  }

  revalidateMatchPaths(trimmedMatchId);

  return { error: null };
}

export async function getMatchBiometricVerificationOptions(
  matchId: string,
  accessToken: string
): Promise<BeginMatchBiometricVerificationResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();

  if (!trimmedMatchId || !trimmedToken) {
    return {
      error: "Матч и сессия обязательны.",
    };
  }

  const authResult = await getAuthorizedMatchActionContext(
    trimmedMatchId,
    trimmedToken
  );

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Не удалось проверить сессию.",
    };
  }

  try {
    return await beginMatchBiometricVerification({
      adminClient: authResult.context.adminClient,
      matchId: trimmedMatchId,
      user: authResult.context.user,
    });
  } catch (error) {
    console.error("Match biometric ceremony start failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось запустить биометрическую проверку.",
    };
  }
}

export async function verifyMatchBiometricRegistration(
  matchId: string,
  accessToken: string,
  response: RegistrationResponseJSON
): Promise<CompleteMatchBiometricVerificationResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();

  if (!trimmedMatchId || !trimmedToken) {
    return {
      error: "Матч и сессия обязательны.",
    };
  }

  const authResult = await getAuthorizedMatchActionContext(
    trimmedMatchId,
    trimmedToken
  );

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Не удалось проверить сессию.",
    };
  }

  try {
    const result = await completeMatchBiometricRegistration({
      adminClient: authResult.context.adminClient,
      matchId: trimmedMatchId,
      userId: authResult.context.user.id,
      response,
    });

    if (!result.error) {
      revalidateMatchPaths(trimmedMatchId);
    }

    return result;
  } catch (error) {
    console.error("Match biometric registration failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось завершить регистрацию passkey.",
    };
  }
}

export async function verifyMatchBiometricAuthentication(
  matchId: string,
  accessToken: string,
  response: AuthenticationResponseJSON
): Promise<CompleteMatchBiometricVerificationResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();

  if (!trimmedMatchId || !trimmedToken) {
    return {
      error: "Матч и сессия обязательны.",
    };
  }

  const authResult = await getAuthorizedMatchActionContext(
    trimmedMatchId,
    trimmedToken
  );

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Не удалось проверить сессию.",
    };
  }

  try {
    const result = await completeMatchBiometricAuthentication({
      adminClient: authResult.context.adminClient,
      matchId: trimmedMatchId,
      userId: authResult.context.user.id,
      response,
    });

    if (!result.error) {
      revalidateMatchPaths(trimmedMatchId);
    }

    return result;
  } catch (error) {
    console.error("Match biometric authentication failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось завершить биометрическую проверку.",
    };
  }
}

export async function saveMatchLobbyScreenshot(
  matchId: string,
  accessToken: string,
  lobbyScreenshotUrl: string
): Promise<SaveLobbyScreenshotResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();
  const trimmedLobbyScreenshotUrl = lobbyScreenshotUrl.trim();

  if (!trimmedMatchId || !trimmedToken || !trimmedLobbyScreenshotUrl) {
    return {
      error: "Матч, сессия и URL скриншота обязательны.",
    };
  }

  try {
    new URL(trimmedLobbyScreenshotUrl);
  } catch {
    return {
      error: "Некорректный URL скриншота.",
    };
  }

  const authResult = await getAuthorizedMatchActionContext(
    trimmedMatchId,
    trimmedToken
  );

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Не удалось проверить сессию.",
    };
  }

  const { adminClient, checkInRow, user } = authResult.context;

  if (!checkInRow?.is_checked_in) {
    return {
      error: "Сначала пройдите чек-ин на матч.",
    };
  }

  const { count, error: countError } = await adminClient
    .from("match_check_ins")
    .select("player_id", {
      count: "exact",
      head: true,
    })
    .eq("match_id", trimmedMatchId)
    .eq("is_checked_in", true);

  if (countError || (count ?? 0) < 1) {
    return {
      error: "Подтверждение лобби откроется после чек-ина всех 10 игроков.",
    };
  }

  const { error: updateError } = await adminClient
    .from("match_check_ins")
    .update({
      lobby_screenshot_url: trimmedLobbyScreenshotUrl,
    })
    .eq("match_id", trimmedMatchId)
    .eq("player_id", user.id);

  if (updateError) {
    return {
      error: updateError.message,
    };
  }

  revalidateMatchPaths(trimmedMatchId);

  return {
    error: null,
  };
}
