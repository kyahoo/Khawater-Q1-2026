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

type MatchActionContext = {
  user: User;
  adminClient: SupabaseClient<Database>;
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

export async function checkInToMatch(
  matchId: string,
  accessToken: string
): Promise<CheckInResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();

  if (!trimmedMatchId || !trimmedToken) {
    return { error: "Match and session are required." };
  }

  const authResult = await getMatchActionContext(trimmedToken);

  if (authResult.error || !authResult.context) {
    return { error: authResult.error };
  }

  const { adminClient, user } = authResult.context;
  const userId = user.id;

  const { data: matchRow, error: matchError } = await adminClient
    .from("tournament_matches")
    .select("id, team_a_id, team_b_id, scheduled_at, lobby_name, lobby_password")
    .eq("id", trimmedMatchId)
    .maybeSingle();

  if (matchError || !matchRow) {
    return { error: "Match not found." };
  }

  const typedMatch = matchRow as Database["public"]["Tables"]["tournament_matches"]["Row"];
  const teamAId = typedMatch.team_a_id;
  const teamBId = typedMatch.team_b_id;

  if (typedMatch.scheduled_at) {
    const scheduledTimeMs = new Date(typedMatch.scheduled_at).getTime();

    if (!Number.isNaN(scheduledTimeMs)) {
      const checkInOpensAtMs = scheduledTimeMs - CHECK_IN_WINDOW_MS;

      if (Date.now() < checkInOpensAtMs) {
        return {
          error: "Чекин откроется за 30 минут до начала матча.",
        };
      }
    }
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .in("team_id", [teamAId, teamBId])
    .maybeSingle();

  if (membershipError || !membership) {
    return { error: "You are not on either team in this match." };
  }

  const { data: existingCheckIn, error: existingError } = await adminClient
    .from("match_check_ins")
    .select("player_id")
    .eq("match_id", trimmedMatchId)
    .eq("player_id", userId)
    .maybeSingle();

  if (existingError) {
    return { error: "Could not verify check-in status." };
  }

  if (existingCheckIn) {
    return { error: "You have already checked in." };
  }

  const { error: insertError } = await adminClient.from("match_check_ins").insert({
    match_id: trimmedMatchId,
    player_id: userId,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return { error: insertError.message };
  }

  const { data: checkIns, error: countError } = await adminClient
    .from("match_check_ins")
    .select("player_id")
    .eq("match_id", trimmedMatchId);

  if (countError || !checkIns || checkIns.length < 10) {
    revalidatePath(`/matches/${trimmedMatchId}`);
    revalidatePath("/matches");
    revalidatePath("/tournament");
    return { error: null };
  }

  let lobbyName = typedMatch.lobby_name;
  let lobbyPassword = typedMatch.lobby_password;

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
      revalidatePath(`/matches/${trimmedMatchId}`);
      revalidatePath("/matches");
      revalidatePath("/tournament");
      return { error: null };
    }
  }

  revalidatePath(`/matches/${trimmedMatchId}`);
  revalidatePath("/matches");
  revalidatePath("/tournament");

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

  const authResult = await getMatchActionContext(trimmedToken);

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

  const authResult = await getMatchActionContext(trimmedToken);

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
      revalidatePath(`/matches/${trimmedMatchId}`);
      revalidatePath("/matches");
      revalidatePath("/tournament");
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

  const authResult = await getMatchActionContext(trimmedToken);

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
      revalidatePath(`/matches/${trimmedMatchId}`);
      revalidatePath("/matches");
      revalidatePath("/tournament");
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
