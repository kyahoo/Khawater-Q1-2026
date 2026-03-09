import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const DEFAULT_BEHAVIOR_SCORE = 5;
const MAX_BEHAVIOR_SCORE_UPDATE_ATTEMPTS = 3;

function normalizeNullableMatchId(matchId: string | null) {
  const trimmedMatchId = matchId?.trim();
  return trimmedMatchId ? trimmedMatchId : null;
}

async function findExistingBehaviorLog(
  adminClient: SupabaseClient<Database>,
  userId: string,
  matchId: string | null,
  penalty: number,
  reason: string
) {
  let query = adminClient
    .from("behavior_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("score_change", penalty)
    .eq("reason", reason)
    .limit(1);

  query = matchId ? query.eq("match_id", matchId) : query.is("match_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function logBehaviorPenalty(
  adminClient: SupabaseClient<Database>,
  userId: string,
  matchId: string | null,
  penalty: number,
  reason: string
) {
  const trimmedUserId = userId.trim();
  const normalizedMatchId = normalizeNullableMatchId(matchId);
  const trimmedReason = reason.trim();

  if (!trimmedUserId) {
    throw new Error("Behavior penalty requires a user ID.");
  }

  if (!Number.isInteger(penalty) || penalty === 0) {
    throw new Error("Behavior penalty must be a non-zero integer.");
  }

  if (!trimmedReason) {
    throw new Error("Behavior penalty requires a reason.");
  }

  const existingLog = await findExistingBehaviorLog(
    adminClient,
    trimmedUserId,
    normalizedMatchId,
    penalty,
    trimmedReason
  );

  if (existingLog) {
    return;
  }

  const { data: insertedLog, error: insertError } = await adminClient
    .from("behavior_logs")
    .insert({
      user_id: trimmedUserId,
      match_id: normalizedMatchId,
      score_change: penalty,
      reason: trimmedReason,
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  let lastUpdateError: Error | null = null;

  for (let attempt = 0; attempt < MAX_BEHAVIOR_SCORE_UPDATE_ATTEMPTS; attempt += 1) {
    const { data: profileRow, error: profileError } = await adminClient
      .from("profiles")
      .select("behavior_score")
      .eq("id", trimmedUserId)
      .maybeSingle();

    if (profileError) {
      lastUpdateError = profileError;
      break;
    }

    if (!profileRow) {
      lastUpdateError = new Error("Profile not found for behavior penalty.");
      break;
    }

    const currentBehaviorScore =
      typeof profileRow.behavior_score === "number"
        ? profileRow.behavior_score
        : DEFAULT_BEHAVIOR_SCORE;

    const nextBehaviorScore = currentBehaviorScore + penalty;
    const { data: updatedProfile, error: updateError } = await adminClient
      .from("profiles")
      .update({
        behavior_score: nextBehaviorScore,
      })
      .eq("id", trimmedUserId)
      .eq("behavior_score", currentBehaviorScore)
      .select("id")
      .maybeSingle();

    if (updateError) {
      lastUpdateError = updateError;
      break;
    }

    if (updatedProfile) {
      return;
    }
  }

  const { error: cleanupError } = await adminClient
    .from("behavior_logs")
    .delete()
    .eq("id", insertedLog.id);

  if (cleanupError) {
    console.error("Behavior log cleanup failed:", cleanupError);
  }

  throw lastUpdateError ?? new Error("Could not update behavior score.");
}
