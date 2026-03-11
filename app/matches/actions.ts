"use server";

import { revalidatePath } from "next/cache";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { sendNotificationToUsers } from "@/lib/notifications/push";
import { logBehaviorPenalty } from "@/lib/supabase/behavior";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

type UploadMatchResultGameScreenshotResult = {
  error: string | null;
  publicUrl: string | null;
  slotIndex: number | null;
};

type ConfirmMatchResultResult = {
  screenshotUrls: string[];
  status: string;
  winnerTeamId: string;
};

type LobbyScreenshotVerificationData = {
  extracted_players: string[];
};

type AnalyzeLobbyScreenshotResult = {
  data: LobbyScreenshotVerificationData | null;
  error: string | null;
};

type NotifyOpponentLobbyReadyResult = {
  error: string | null;
};

type ClaimDefaultWinResult = {
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
  participantTeamId: string;
};

type AuthorizedLobbyHostMatchActionContext = MatchActionContext & {
  match: MatchActionMatchRow;
  hostTeamId: string;
  hostCaptainUserId: string;
};

const CHECK_IN_WINDOW_MS = 30 * 60 * 1000;
const MAX_LOBBY_MAP_NUMBER = 3;
const LATE_CHECK_IN_PENALTY = -1;
const LATE_CHECK_IN_REASON = "Опоздание на чек-ин матча";
const LATE_MATCH_ACTION_PENALTY = -1;
const LATE_LOBBY_SCREENSHOT_REASON =
  "Загрузка скриншота лобби позже 12 часов после старта";
const LATE_MATCH_RESULT_CONFIRMATION_REASON =
  "Подтверждение результата матча позже 12 часов после старта";
const LATE_MATCH_RESULT_SCREENSHOT_REASON =
  "Загрузка скриншота с результатом позже 12 часов после старта";
const INVALID_LOBBY_SCREENSHOT_PENALTY = -1;
const INVALID_LOBBY_SCREENSHOT_REASON =
  "Отсутствие или недействительный скриншот лобби";
const MISSING_MATCH_RESULT_SCREENSHOTS_REASON =
  "Отсутствие скриншотов с результатами матча";
const FORFEIT_BEHAVIOR_PENALTY = -1;
const FORFEIT_BEHAVIOR_REASON = "Техническое поражение в матче";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getActionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallbackMessage;
}

function normalizeStoredResultScreenshotUrls(
  resultScreenshotUrls: string[] | null | undefined
) {
  if (Array.isArray(resultScreenshotUrls)) {
    return resultScreenshotUrls.filter(isNonEmptyString);
  }

  return [];
}

function appendOrReplaceResultScreenshotUrl(params: {
  existingUrls: string[];
  slotIndex: number;
  publicUrl: string;
}) {
  const nextUrls = [...params.existingUrls];
  const targetIndex = params.slotIndex - 1;

  if (targetIndex < 0) {
    return nextUrls;
  }

  if (targetIndex <= nextUrls.length) {
    nextUrls[targetIndex] = params.publicUrl;
    return nextUrls.filter(isNonEmptyString);
  }

  while (nextUrls.length < targetIndex) {
    nextUrls.push("");
  }

  nextUrls.push(params.publicUrl);

  return nextUrls.filter(isNonEmptyString);
}

function generateLobbyPassword(): string {
  const useFourDigits = Math.random() >= 0.5;
  const min = useFourDigits ? 1000 : 100;
  const max = useFourDigits ? 9000 : 900;

  return `khawater${Math.floor(min + Math.random() * max)}`;
}

function isKnownLobbyTeamName(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return false;
  }

  return !/^(tbd|team a|team b)$/i.test(trimmedValue);
}

function generateLobbyName(params: {
  matchId: string;
  roundLabel: string | null | undefined;
  teamAName: string | null | undefined;
  teamBName: string | null | undefined;
}) {
  const teamAName = params.teamAName?.trim();
  const teamBName = params.teamBName?.trim();

  if (isKnownLobbyTeamName(teamAName) && isKnownLobbyTeamName(teamBName)) {
    return `${teamAName} vs ${teamBName}`;
  }

  const fallbackLabel = params.roundLabel?.trim() || params.matchId;
  return `Match ${fallbackLabel}`;
}

function getSeriesLength(format: string | null | undefined) {
  const normalizedFormat = format?.trim().toUpperCase() ?? "";
  const match = normalizedFormat.match(/^BO(\d+)$/);

  if (!match) {
    return null;
  }

  const parsedLength = Number(match[1]);
  return Number.isInteger(parsedLength) && parsedLength > 0 ? parsedLength : null;
}

function getSeriesMaxWins(format: string | null | undefined) {
  const seriesLength = getSeriesLength(format);

  return seriesLength ? Math.floor(seriesLength / 2) + 1 : null;
}

function parseNonNegativeInteger(
  value: FormDataEntryValue | null,
  fallbackMessage: string
) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(fallbackMessage);
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(fallbackMessage);
  }

  return parsedValue;
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
    .select("id, team_a_id, team_b_id, round_label, scheduled_at, lobby_name, lobby_password")
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
      participantTeamId: membership.team_id as string,
    },
  };
}

async function getAuthorizedLobbyHostMatchActionContext(
  matchId: string,
  accessToken: string
): Promise<{
  error: string | null;
  context: AuthorizedLobbyHostMatchActionContext | null;
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
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError || !matchRow) {
    return {
      error: "Матч не найден.",
      context: null,
    };
  }

  const typedMatch = matchRow as MatchActionMatchRow;
  const lobbyHostResult = await getLobbyHostForMatch({
    adminClient,
    match: typedMatch,
  });

  if (
    lobbyHostResult.error ||
    !lobbyHostResult.hostCaptainUserId ||
    !lobbyHostResult.hostTeamId
  ) {
    return {
      error: lobbyHostResult.error ?? "Не удалось определить хоста лобби.",
      context: null,
    };
  }

  if (lobbyHostResult.hostCaptainUserId !== user.id) {
    return {
      error: "Только хост лобби может отправлять результат матча.",
      context: null,
    };
  }

  return {
    error: null,
    context: {
      user,
      adminClient,
      match: typedMatch,
      hostTeamId: lobbyHostResult.hostTeamId,
      hostCaptainUserId: lobbyHostResult.hostCaptainUserId,
    },
  };
}

function revalidateMatchPaths(matchId: string) {
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/matches");
  revalidatePath("/tournament");
}

async function applyBehaviorPenalty(params: {
  adminClient: SupabaseClient<Database>;
  userId: string;
  matchId: string | null;
  penalty: number;
  reason: string;
}) {
  try {
    await logBehaviorPenalty(
      params.adminClient,
      params.userId,
      params.matchId,
      params.penalty,
      params.reason
    );
    revalidatePath("/", "layout");
  } catch (error) {
    console.error("Behavior penalty logging failed:", error);
  }
}

function isPastScheduledActionPenaltyWindow(
  scheduledAt: string | null | undefined
) {
  if (!scheduledAt) {
    return false;
  }

  const scheduledAtMs = new Date(scheduledAt).getTime();

  if (!Number.isFinite(scheduledAtMs)) {
    return false;
  }

  return Date.now() > scheduledAtMs + 12 * 60 * 60 * 1000;
}

function getMistralMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");

    if (objectStart === -1 || objectEnd === -1 || objectEnd <= objectStart) {
      throw new Error("Mistral did not return a valid JSON object.");
    }

    return JSON.parse(text.slice(objectStart, objectEnd + 1));
  }
}

function parseLobbyScreenshotVerificationData(
  data: unknown
): LobbyScreenshotVerificationData | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const { extracted_players: extractedPlayers } = data as {
    extracted_players?: unknown;
  };

  if (
    !Array.isArray(extractedPlayers) ||
    !extractedPlayers.every((player) => typeof player === "string")
  ) {
    return null;
  }

  return {
    extracted_players: extractedPlayers
      .map((player) => player.trim())
      .filter((player) => player.length > 0),
  };
}

function buildLobbyVerificationPrompt() {
  return `You are an OCR extraction assistant for a Dota 2 tournament lobby screenshot.
Extract only the player nicknames visible in the Radiant and Dire team slots.
Do not evaluate whether the lobby is valid.
Do not return booleans.
Do not infer or guess unreadable names.
Ignore all other text, including chat, headers, MMR, medals, spectators, timers, and lobby metadata.
Respond ONLY with valid JSON using this exact structure:
{
  "extracted_players": ["player1", "player2"]
}`;
}

function normalizeLobbyMapNumber(mapNumber: number) {
  if (!Number.isInteger(mapNumber) || mapNumber < 1 || mapNumber > MAX_LOBBY_MAP_NUMBER) {
    return null;
  }

  return mapNumber;
}

async function getLobbyHostForMatch(params: {
  adminClient: SupabaseClient<Database>;
  match: MatchActionMatchRow;
}) {
  const { adminClient, match } = params;
  const teamIds = [match.team_a_id, match.team_b_id];

  const { data: teams, error: teamsError } = await adminClient
    .from("teams")
    .select("id, name")
    .in("id", teamIds);

  if (teamsError) {
    return {
      error: "Не удалось определить команду-хоста.",
      hostCaptainUserId: null,
      hostTeamId: null,
    };
  }

  const teamNameById = new Map(
    ((teams ?? []) as Array<{ id: string; name: string | null }>).map((team) => [
      team.id,
      team.name?.trim() ?? "",
    ])
  );

  const teamAName = teamNameById.get(match.team_a_id) ?? "";
  const teamBName = teamNameById.get(match.team_b_id) ?? "";
  const hostTeamId =
    !teamBName || teamAName.localeCompare(teamBName) <= 0
      ? match.team_a_id
      : match.team_b_id;

  const { data: memberships, error: membershipsError } = await adminClient
    .from("team_members")
    .select("team_id, user_id, is_captain")
    .in("team_id", teamIds);

  if (membershipsError) {
    return {
      error: "Не удалось определить капитана команды-хоста.",
      hostCaptainUserId: null,
      hostTeamId: null,
    };
  }

  const hostCaptainUserId =
    (
      (memberships ?? []) as Array<{
        team_id: string;
        user_id: string;
        is_captain: boolean;
      }>
    ).find(
      (membership) =>
        membership.team_id === hostTeamId && membership.is_captain
    )?.user_id ?? null;

  if (!hostCaptainUserId) {
    return {
      error: "Не удалось определить ожидаемого хоста лобби.",
      hostCaptainUserId: null,
      hostTeamId: null,
    };
  }

  return {
    error: null,
    hostCaptainUserId,
    hostTeamId,
  };
}

function normalizeLobbyPlayerName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

async function getLobbyVerificationRosters(params: {
  adminClient: SupabaseClient<Database>;
  match: MatchActionMatchRow;
  userId: string;
  participantTeamId: string;
}) {
  const { adminClient, match, userId, participantTeamId } = params;
  const teamIds = [match.team_a_id, match.team_b_id];
  const opponentTeamId =
    participantTeamId === match.team_a_id
      ? match.team_b_id
      : participantTeamId === match.team_b_id
        ? match.team_a_id
        : null;

  if (!opponentTeamId) {
    return {
      error: "Не удалось определить команду соперника для OCR-проверки.",
      currentUserNickname: null,
      opponentRosterNicknames: null,
    };
  }

  const { data: memberships, error: membershipsError } = await adminClient
    .from("team_members")
    .select("team_id, user_id")
    .in("team_id", teamIds);

  if (membershipsError) {
    return {
      error: "Не удалось загрузить составы команд для OCR-проверки.",
      currentUserNickname: null,
      opponentRosterNicknames: null,
    };
  }

  if (!memberships || memberships.length === 0) {
    return {
      error: "Составы команд для OCR-проверки не найдены.",
      currentUserNickname: null,
      opponentRosterNicknames: null,
    };
  }

  const profileIds = Array.from(
    new Set(
      ((memberships ?? []) as Array<{ team_id: string; user_id: string }>).map(
        (membership) => membership.user_id
      )
    )
  );
  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, nickname")
    .in("id", profileIds);

  if (profilesError) {
    return {
      error: "Не удалось загрузить никнеймы игроков для OCR-проверки.",
      currentUserNickname: null,
      opponentRosterNicknames: null,
    };
  }

  const nicknameById = new Map(
    ((profiles ?? []) as Array<{ id: string; nickname: string | null }>).map(
      (profile) => [profile.id, profile.nickname?.trim() ?? ""]
    )
  );

  const rosterNicknamesByTeamId = new Map<string, string[]>(
    teamIds.map((teamId) => [teamId, []])
  );

  for (const membership of (memberships ?? []) as Array<{
    team_id: string;
    user_id: string;
  }>) {
    const nickname = nicknameById.get(membership.user_id)?.trim() ?? "";

    if (!nickname) {
      continue;
    }

    rosterNicknamesByTeamId.get(membership.team_id)?.push(nickname);
  }

  const currentUserNickname = nicknameById.get(userId)?.trim() ?? "";
  const opponentRosterNicknames =
    rosterNicknamesByTeamId.get(opponentTeamId)?.filter(isNonEmptyString) ?? [];

  if (!currentUserNickname) {
    return {
      error: "Не удалось определить ваш никнейм для OCR-проверки.",
      currentUserNickname: null,
      opponentRosterNicknames: null,
    };
  }

  if (opponentRosterNicknames.length === 0) {
    return {
      error: "Не удалось определить состав соперника для OCR-проверки.",
      currentUserNickname: null,
      opponentRosterNicknames: null,
    };
  }

  return {
    error: null,
    currentUserNickname,
    opponentRosterNicknames,
  };
}

function validateExtractedLobbyPlayers(params: {
  extractedPlayers: string[];
  currentUserNickname: string;
  opponentRosterNicknames: string[];
}) {
  const normalizedCurrentUserNickname = normalizeLobbyPlayerName(
    params.currentUserNickname
  );
  const extractedPlayerCounts = params.extractedPlayers
    .map(normalizeLobbyPlayerName)
    .filter(Boolean)
    .reduce<Map<string, number>>((counts, playerName) => {
      counts.set(playerName, (counts.get(playerName) ?? 0) + 1);
      return counts;
    }, new Map());
  const isCurrentUserFound =
    (extractedPlayerCounts.get(normalizedCurrentUserNickname) ?? 0) > 0;
  const isOpponentFound = params.opponentRosterNicknames.some((nickname) =>
    (extractedPlayerCounts.get(normalizeLobbyPlayerName(nickname)) ?? 0) >=
    (normalizeLobbyPlayerName(nickname) === normalizedCurrentUserNickname ? 2 : 1)
  );

  if (!isCurrentUserFound && !isOpponentFound) {
    return {
      error: "Ваш никнейм и игрок противника не найдены в лобби.",
    };
  }

  if (!isCurrentUserFound) {
    return {
      error: "Ваш никнейм не найден в лобби.",
    };
  }

  if (!isOpponentFound) {
    return {
      error: "Игрок противника не найден в лобби.",
    };
  }

  return {
    error: null,
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

  const authResult = await getAuthorizedMatchActionContext(
    trimmedMatchId,
    trimmedToken
  );

  if (authResult.error || !authResult.context) {
    return { error: authResult.error };
  }

  const { adminClient, checkInRow, match, user, participantTeamId } =
    authResult.context;
  let isLateCheckIn = false;

  if (match.scheduled_at) {
    const scheduledTimeMs = new Date(match.scheduled_at).getTime();

    if (!Number.isNaN(scheduledTimeMs)) {
      const checkInOpensAtMs = scheduledTimeMs - CHECK_IN_WINDOW_MS;

      if (Date.now() < checkInOpensAtMs) {
        return {
          error: "Чекин откроется за 30 минут до начала матча.",
        };
      }

      isLateCheckIn = Date.now() > scheduledTimeMs;
    }
  }

  if (match.scheduled_at) {
    const { count: unfinishedOlderMatchesCount, error: unfinishedOlderMatchesError } =
      await adminClient
        .from("tournament_matches")
        .select("id", {
          count: "exact",
          head: true,
        })
        .or(`team_a_id.eq.${participantTeamId},team_b_id.eq.${participantTeamId}`)
        .lt("scheduled_at", match.scheduled_at)
        .neq("status", "finished");

    if (unfinishedOlderMatchesError) {
      return {
        error: unfinishedOlderMatchesError.message,
      };
    }

    if ((unfinishedOlderMatchesCount ?? 0) > 0) {
      return {
        error:
          "ОШИБКА: У вас есть незавершенные прошлые матчи. Капитаны должны загрузить результаты и скриншоты старых игр перед чек-ином на новые.",
      };
    }
  }

  if (checkInRow?.is_ready || checkInRow?.is_checked_in) {
    return {
      error: "Вы уже прошли чек-ин.",
    };
  }

  if (checkInRow) {
    const { error: updateError } = await adminClient
      .from("match_check_ins")
      .update({
        is_checked_in: true,
        is_ready: true,
      })
      .eq("match_id", trimmedMatchId)
      .eq("player_id", user.id);

    if (updateError) {
      return { error: updateError.message };
    }
  } else {
    const { error: insertError } = await adminClient
      .from("match_check_ins")
      .insert({
        match_id: trimmedMatchId,
        player_id: user.id,
        biometric_verified: false,
        is_checked_in: true,
        is_ready: true,
        lobby_screenshot_url: null,
      });

    if (insertError) {
      return { error: insertError.message };
    }
  }

  if (isLateCheckIn) {
    await applyBehaviorPenalty({
      adminClient,
      userId: user.id,
      matchId: trimmedMatchId,
      penalty: LATE_CHECK_IN_PENALTY,
      reason: LATE_CHECK_IN_REASON,
    });
  }

  const { count, error: countError } = await adminClient
    .from("match_check_ins")
    .select("player_id", {
      count: "exact",
      head: true,
    })
    .eq("match_id", trimmedMatchId)
    .eq("is_ready", true);

  if (countError || (count ?? 0) < 1) {
    revalidateMatchPaths(trimmedMatchId);
    return { error: null };
  }

  let lobbyName = match.lobby_name;
  let lobbyPassword = match.lobby_password;

  if (!lobbyName || !lobbyPassword) {
    const { data: teams } = await adminClient
      .from("teams")
      .select("id, name")
      .in("id", [match.team_a_id, match.team_b_id]);
    const teamNameById = new Map(
      ((teams ?? []) as Array<{ id: string; name: string | null }>).map((team) => [
        team.id,
        team.name,
      ])
    );

    lobbyName = generateLobbyName({
      matchId: trimmedMatchId,
      roundLabel: match.round_label,
      teamAName: teamNameById.get(match.team_a_id),
      teamBName: teamNameById.get(match.team_b_id),
    });
    lobbyPassword = generateLobbyPassword();

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
): Promise<SaveLobbyScreenshotResult>;
export async function saveMatchLobbyScreenshot(
  matchId: string,
  accessToken: string,
  lobbyScreenshotUrl: string,
  mapNumber: number
): Promise<SaveLobbyScreenshotResult>;
export async function saveMatchLobbyScreenshot(
  matchId: string,
  accessToken: string,
  lobbyScreenshotUrl: string,
  mapNumber = 1
): Promise<SaveLobbyScreenshotResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();
  const trimmedLobbyScreenshotUrl = lobbyScreenshotUrl.trim();
  const normalizedMapNumber = normalizeLobbyMapNumber(mapNumber);

  if (
    !trimmedMatchId ||
    !trimmedToken ||
    !trimmedLobbyScreenshotUrl ||
    !normalizedMapNumber
  ) {
    return {
      error: "Матч, сессия, карта и URL скриншота обязательны.",
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

  const { adminClient, checkInRow, user, match } = authResult.context;

  if (!checkInRow?.is_ready && !checkInRow?.is_checked_in) {
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
    .eq("is_ready", true);

  if (countError || (count ?? 0) < 1) {
    return {
      error: "Подтверждение лобби откроется после чек-ина всех 10 игроков.",
    };
  }

  const { error: lobbyPhotoError } = await adminClient
    .from("match_lobby_photos")
    .upsert(
      {
        match_id: trimmedMatchId,
        player_id: user.id,
        map_number: normalizedMapNumber,
        photo_url: trimmedLobbyScreenshotUrl,
      },
      {
        onConflict: "match_id,player_id,map_number",
      }
    );

  if (lobbyPhotoError) {
    return {
      error: lobbyPhotoError.message,
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

  if (isPastScheduledActionPenaltyWindow(match.scheduled_at)) {
    await applyBehaviorPenalty({
      adminClient,
      userId: user.id,
      matchId: trimmedMatchId,
      penalty: LATE_MATCH_ACTION_PENALTY,
      reason: LATE_LOBBY_SCREENSHOT_REASON,
    });
  }

  revalidateMatchPaths(trimmedMatchId);

  return {
    error: null,
  };
}

export async function uploadMatchResultGameScreenshot(
  matchId: string,
  formData: FormData
): Promise<UploadMatchResultGameScreenshotResult> {
  let slotIndex: number | null = null;

  try {
    const trimmedMatchId = matchId.trim();
    const accessTokenEntry = formData.get("accessToken");
    const resultScreenshotUrlEntry = formData.get("resultScreenshotUrl");
    const accessToken =
      typeof accessTokenEntry === "string" ? accessTokenEntry.trim() : "";
    const resultScreenshotUrl =
      typeof resultScreenshotUrlEntry === "string" ? resultScreenshotUrlEntry.trim() : "";

    slotIndex = parseNonNegativeInteger(
      formData.get("slotIndex"),
      "Не удалось определить номер игры для скриншота."
    );

    if (!trimmedMatchId) {
      return {
        error: "Матч обязателен.",
        publicUrl: null,
        slotIndex,
      };
    }

    if (slotIndex < 1) {
      return {
        error: "Не удалось определить номер игры для скриншота.",
        publicUrl: null,
        slotIndex,
      };
    }

    if (!accessToken) {
      return {
        error: "Сессия истекла. Войдите в аккаунт заново.",
        publicUrl: null,
        slotIndex,
      };
    }

    if (!resultScreenshotUrl) {
      return {
        error: "Не удалось получить ссылку на скриншот игры.",
        publicUrl: null,
        slotIndex,
      };
    }

    const authResult = await getAuthorizedLobbyHostMatchActionContext(
      trimmedMatchId,
      accessToken
    );

    if (authResult.error || !authResult.context) {
      return {
        error: authResult.error ?? "Не удалось проверить сессию.",
        publicUrl: null,
        slotIndex,
      };
    }

    const existingScreenshotUrls = normalizeStoredResultScreenshotUrls(
      authResult.context.match.result_screenshot_urls
    );
    const nextScreenshotUrls = appendOrReplaceResultScreenshotUrl({
      existingUrls: existingScreenshotUrls,
      slotIndex,
      publicUrl: resultScreenshotUrl,
    });

    try {
      const { error: updateError } = await authResult.context.adminClient
        .from("tournament_matches")
        .update({
          result_screenshot_urls: nextScreenshotUrls,
        })
        .eq("id", trimmedMatchId);

      if (updateError) {
        console.error(updateError);
        return {
          error: updateError.message,
          publicUrl: null,
          slotIndex,
        };
      }
    } catch (error) {
      console.error(error);
      return {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось сохранить ссылку на скриншот игры.",
        publicUrl: null,
        slotIndex,
      };
    }

    if (isPastScheduledActionPenaltyWindow(authResult.context.match.scheduled_at)) {
      await applyBehaviorPenalty({
        adminClient: authResult.context.adminClient,
        userId: authResult.context.user.id,
        matchId: trimmedMatchId,
        penalty: LATE_MATCH_ACTION_PENALTY,
        reason: LATE_MATCH_RESULT_SCREENSHOT_REASON,
      });
    }

    revalidateMatchPaths(trimmedMatchId);

    return {
      error: null,
      publicUrl: resultScreenshotUrl,
      slotIndex,
    };
  } catch (error) {
    console.error(error);
    console.error("Match result screenshot upload failed:", error);

    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : getActionErrorMessage(
              error,
              "Не удалось загрузить скриншот результата матча."
            ),
      publicUrl: null,
      slotIndex,
    };
  }
}

export async function confirmMatchResult(
  matchId: string,
  formData: FormData
): Promise<ConfirmMatchResultResult> {
  const trimmedMatchId = matchId.trim();
  const accessTokenEntry = formData.get("accessToken");
  const accessToken =
    typeof accessTokenEntry === "string" ? accessTokenEntry.trim() : "";

  if (!trimmedMatchId) {
    throw new Error("Матч обязателен.");
  }

  if (!accessToken) {
    throw new Error("Сессия истекла. Войдите в аккаунт заново.");
  }

  const authResult = await getAuthorizedLobbyHostMatchActionContext(
    trimmedMatchId,
    accessToken
  );

  if (authResult.error || !authResult.context) {
    throw new Error(authResult.error ?? "Не удалось проверить сессию.");
  }

  const teamAScore = parseNonNegativeInteger(
    formData.get("teamAScore"),
    "Укажите корректный счет команды A."
  );
  const teamBScore = parseNonNegativeInteger(
    formData.get("teamBScore"),
    "Укажите корректный счет команды B."
  );

  if (teamAScore === teamBScore) {
    throw new Error("Итоговый счет серии не может быть ничейным.");
  }

  const totalGames = teamAScore + teamBScore;

  if (totalGames <= 0) {
    throw new Error("Укажите итоговый счет серии.");
  }

  const seriesLength = getSeriesLength(authResult.context.match.format);
  const seriesMaxWins = getSeriesMaxWins(authResult.context.match.format);

  if (
    seriesLength !== null &&
    (totalGames > seriesLength ||
      teamAScore > seriesLength ||
      teamBScore > seriesLength)
  ) {
    throw new Error(
      `Счет не может превышать лимит серии ${authResult.context.match.format}.`
    );
  }

  if (
    seriesMaxWins !== null &&
    (teamAScore > seriesMaxWins ||
      teamBScore > seriesMaxWins ||
      Math.max(teamAScore, teamBScore) !== seriesMaxWins)
  ) {
    throw new Error(
      `Победитель должен набрать ${seriesMaxWins} карт(ы) в формате ${authResult.context.match.format}.`
    );
  }

  const screenshotUrls = formData
    .getAll("screenshotUrls")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value): value is string => Boolean(value));
  const existingResultScreenshotUrls = normalizeStoredResultScreenshotUrls(
    authResult.context.match.result_screenshot_urls
  );

  if (existingResultScreenshotUrls.length === 0 && screenshotUrls.length === 0) {
    await applyBehaviorPenalty({
      adminClient: authResult.context.adminClient,
      userId: authResult.context.user.id,
      matchId: trimmedMatchId,
      penalty: INVALID_LOBBY_SCREENSHOT_PENALTY,
      reason: MISSING_MATCH_RESULT_SCREENSHOTS_REASON,
    });
  }

  if (screenshotUrls.length !== totalGames) {
    throw new Error("Количество скриншотов должно совпадать с числом сыгранных карт.");
  }

  for (const screenshotUrl of screenshotUrls) {
    try {
      new URL(screenshotUrl);
    } catch {
      throw new Error("Один из URL скриншотов результата некорректен.");
    }
  }

  const winnerTeamId =
    teamAScore > teamBScore
      ? authResult.context.match.team_a_id
      : authResult.context.match.team_b_id;

  const { error: updateError } = await authResult.context.adminClient
    .from("tournament_matches")
    .update({
      status: "finished",
      team_a_score: teamAScore,
      team_b_score: teamBScore,
      winner_team_id: winnerTeamId,
      result_screenshot_urls: screenshotUrls,
    })
    .eq("id", trimmedMatchId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (isPastScheduledActionPenaltyWindow(authResult.context.match.scheduled_at)) {
    await applyBehaviorPenalty({
      adminClient: authResult.context.adminClient,
      userId: authResult.context.user.id,
      matchId: trimmedMatchId,
      penalty: LATE_MATCH_ACTION_PENALTY,
      reason: LATE_MATCH_RESULT_CONFIRMATION_REASON,
    });
  }

  revalidateMatchPaths(trimmedMatchId);

  return {
    screenshotUrls,
    status: "finished",
    winnerTeamId,
  };
}

export async function analyzeLobbyScreenshot(
  matchId: string
): Promise<AnalyzeLobbyScreenshotResult>;
export async function analyzeLobbyScreenshot(
  matchId: string,
  accessToken: string
): Promise<AnalyzeLobbyScreenshotResult>;
export async function analyzeLobbyScreenshot(
  matchId: string,
  accessToken: string,
  mapNumber: number
): Promise<AnalyzeLobbyScreenshotResult>;
export async function analyzeLobbyScreenshot(
  matchId: string,
  accessToken = "",
  mapNumber = 1
): Promise<AnalyzeLobbyScreenshotResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  const normalizedMapNumber = normalizeLobbyMapNumber(mapNumber);

  if (!trimmedMatchId) {
    return {
      data: null,
      error: "Матч обязателен.",
    };
  }

  if (!trimmedToken) {
    return {
      data: null,
      error: "Сессия обязательна.",
    };
  }

  if (!normalizedMapNumber) {
    return {
      data: null,
      error: "Некорректный номер карты.",
    };
  }

  if (!mistralApiKey) {
    return {
      data: null,
      error: "MISTRAL_API_KEY is not configured.",
    };
  }

  const authResult = await getAuthorizedMatchActionContext(
    trimmedMatchId,
    trimmedToken
  );

  if (authResult.error || !authResult.context) {
    return {
      data: null,
      error: authResult.error ?? "Не удалось проверить сессию.",
    };
  }

  const rosterValidationResult = await getLobbyVerificationRosters({
    adminClient: authResult.context.adminClient,
    match: authResult.context.match,
    userId: authResult.context.user.id,
    participantTeamId: authResult.context.participantTeamId,
  });

  if (
    rosterValidationResult.error ||
    !rosterValidationResult.currentUserNickname ||
    !rosterValidationResult.opponentRosterNicknames
  ) {
    return {
      data: null,
      error: rosterValidationResult.error ?? "Не удалось подготовить OCR-проверку.",
    };
  }

  let lobbyScreenshotUrl = authResult.context.checkInRow?.lobby_screenshot_url?.trim() ?? "";

  const { data: lobbyPhotoRow, error: lobbyPhotoError } = await authResult.context.adminClient
    .from("match_lobby_photos")
    .select("photo_url")
    .eq("match_id", trimmedMatchId)
    .eq("player_id", authResult.context.user.id)
    .eq("map_number", normalizedMapNumber)
    .maybeSingle();

  if (lobbyPhotoError) {
    return {
      data: null,
      error: "Не удалось загрузить фото лобби для выбранной карты.",
    };
  }

  if (typeof lobbyPhotoRow?.photo_url === "string" && lobbyPhotoRow.photo_url.trim()) {
    lobbyScreenshotUrl = lobbyPhotoRow.photo_url.trim();
  }

  if (!lobbyScreenshotUrl) {
    await applyBehaviorPenalty({
      adminClient: authResult.context.adminClient,
      userId: authResult.context.user.id,
      matchId: trimmedMatchId,
      penalty: INVALID_LOBBY_SCREENSHOT_PENALTY,
      reason: INVALID_LOBBY_SCREENSHOT_REASON,
    });

    return {
      data: null,
      error: "Сначала загрузите фото лобби.",
    };
  }

  try {
    new URL(lobbyScreenshotUrl);
  } catch {
    await applyBehaviorPenalty({
      adminClient: authResult.context.adminClient,
      userId: authResult.context.user.id,
      matchId: trimmedMatchId,
      penalty: INVALID_LOBBY_SCREENSHOT_PENALTY,
      reason: INVALID_LOBBY_SCREENSHOT_REASON,
    });

    return {
      data: null,
      error: "URL скриншота лобби некорректен.",
    };
  }

  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "pixtral-12b-2409",
        response_format: {
          type: "json_object",
        },
        temperature: 0,
        messages: [
          {
            role: "system",
            content: buildLobbyVerificationPrompt(),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all player nicknames that are visible in the Radiant and Dire team slots.",
              },
              {
                type: "image_url",
                image_url: lobbyScreenshotUrl,
              },
            ],
          },
        ],
      }),
      cache: "no-store",
    });

    const responseText = await response.text();
    let payload:
      | {
          choices?: Array<{
            message?: {
              content?: unknown;
            };
          }>;
          error?: {
            message?: string;
          };
        }
      | null = null;

    if (responseText) {
      try {
        payload = JSON.parse(responseText) as {
          choices?: Array<{
            message?: {
              content?: unknown;
            };
          }>;
          error?: {
            message?: string;
          };
        };
      } catch {
        if (!response.ok) {
          return {
            data: null,
            error: responseText,
          };
        }
      }
    }

    if (!response.ok) {
      return {
        data: null,
        error:
          payload?.error?.message ??
          `Mistral OCR request failed with status ${response.status}.`,
      };
    }

    const rawContent = getMistralMessageText(payload?.choices?.[0]?.message?.content);

    if (!rawContent) {
      return {
        data: null,
        error: "Mistral OCR returned an empty response.",
      };
    }

    const parsedContent = parseJsonObject(rawContent);
    const parsedData = parseLobbyScreenshotVerificationData(parsedContent);

    if (!parsedData) {
      return {
        data: null,
        error: "Mistral OCR returned an invalid JSON structure.",
      };
    }

    const validationResult = validateExtractedLobbyPlayers({
      extractedPlayers: parsedData.extracted_players,
      currentUserNickname: rosterValidationResult.currentUserNickname,
      opponentRosterNicknames: rosterValidationResult.opponentRosterNicknames,
    });

    if (validationResult.error) {
      await applyBehaviorPenalty({
        adminClient: authResult.context.adminClient,
        userId: authResult.context.user.id,
        matchId: trimmedMatchId,
        penalty: INVALID_LOBBY_SCREENSHOT_PENALTY,
        reason: INVALID_LOBBY_SCREENSHOT_REASON,
      });

      return {
        data: null,
        error: validationResult.error,
      };
    }

    return {
      data: parsedData,
      error: null,
    };
  } catch (error) {
    console.error("Lobby screenshot OCR failed:", error);
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Не удалось проанализировать скриншот лобби.",
    };
  }
}

export async function notifyOpponentLobbyReady(
  matchId: string,
  currentTeamId: string
): Promise<NotifyOpponentLobbyReadyResult> {
  console.log("SERVER ACTION RECEIVED ID:", matchId);
  const trimmedMatchId = String(matchId ?? "").trim();
  const trimmedCurrentTeamId = String(currentTeamId ?? "").trim();
  const env = getMatchActionEnv();

  if (!trimmedMatchId || !trimmedCurrentTeamId) {
    return {
      error: "Матч и команда обязательны.",
    };
  }

  if (!env) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error: userError?.message ?? "Не удалось проверить текущую сессию.",
      };
    }

    const adminClient = createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: membership, error: membershipError } = await adminClient
      .from("team_members")
      .select("team_id, is_captain")
      .eq("user_id", user.id)
      .eq("team_id", trimmedCurrentTeamId)
      .maybeSingle();

    if (membershipError || !membership?.is_captain) {
      return {
        error: "Только капитан команды может отправить это уведомление.",
      };
    }

    const { data: matchRow, error: matchError } = await adminClient
      .from("tournament_matches")
      .select("id, team_a_id, team_b_id, opponent_notified")
      .eq("id", trimmedMatchId)
      .maybeSingle();

    if (matchError || !matchRow) {
      console.error("Notify opponent match lookup failed:", {
        matchId: trimmedMatchId,
        currentTeamId: trimmedCurrentTeamId,
        matchError,
      });
      return {
        error: "Матч не найден.",
      };
    }

    if (matchRow.opponent_notified) {
      return {
        error: "Уведомление уже было отправлено.",
      };
    }

    if (
      trimmedCurrentTeamId !== matchRow.team_a_id &&
      trimmedCurrentTeamId !== matchRow.team_b_id
    ) {
      return {
        error: "Ваша команда не участвует в этом матче.",
      };
    }

    if (trimmedCurrentTeamId !== matchRow.team_a_id) {
      return {
        error: "Уведомление о готовности лобби может отправить только капитан команды-хоста.",
      };
    }

    const opponentTeamId =
      trimmedCurrentTeamId === matchRow.team_a_id ? matchRow.team_b_id : matchRow.team_a_id;

    const { data: opponentMemberships, error: opponentMembershipsError } = await adminClient
      .from("team_members")
      .select("user_id")
      .eq("team_id", opponentTeamId);

    if (opponentMembershipsError) {
      return {
        error: opponentMembershipsError.message,
      };
    }

    const opponentUserIds = Array.from(
      new Set((opponentMemberships ?? []).map((row) => row.user_id))
    );

    if (opponentUserIds.length > 0) {
      await sendNotificationToUsers({
        adminClient,
        userIds: opponentUserIds,
        payload: {
          title: "ЛОББИ ГОТОВО!",
          body: "Капитан противника создал лобби. Заходите в игру!",
          linkUrl: `/matches/${trimmedMatchId}`,
        },
      });
    }

    const { error: updateError } = await adminClient
      .from("tournament_matches")
      .update({
        opponent_notified: true,
      })
      .eq("id", trimmedMatchId)
      .eq("opponent_notified", false);

    if (updateError) {
      return {
        error: updateError.message,
      };
    }

    revalidatePath(`/matches/${trimmedMatchId}`);
    revalidatePath("/tournament");

    return {
      error: null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось уведомить соперника о готовности лобби.",
    };
  }
}

export async function claimDefaultWin(
  matchId: string,
  claimingTeamId: string,
  opponentTeamId: string
): Promise<ClaimDefaultWinResult> {
  const trimmedMatchId = String(matchId ?? "").trim();
  const trimmedClaimingTeamId = String(claimingTeamId ?? "").trim();
  const trimmedOpponentTeamId = String(opponentTeamId ?? "").trim();
  const env = getMatchActionEnv();

  if (!trimmedMatchId || !trimmedClaimingTeamId || !trimmedOpponentTeamId) {
    return {
      error: "Матч и команды обязательны.",
    };
  }

  if (!env) {
    return {
      error: "Missing Supabase server environment configuration.",
    };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error: userError?.message ?? "Не удалось проверить текущую сессию.",
      };
    }

    const adminClient = createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: claimingMembership, error: claimingMembershipError } = await adminClient
      .from("team_members")
      .select("team_id, is_captain")
      .eq("user_id", user.id)
      .eq("team_id", trimmedClaimingTeamId)
      .maybeSingle();

    if (claimingMembershipError || !claimingMembership?.is_captain) {
      return {
        error: "Только капитан команды может запросить техническую победу.",
      };
    }

    const { data: matchRow, error: matchError } = await adminClient
      .from("tournament_matches")
      .select("id, status, team_a_id, team_b_id, is_forfeit, winner_team_id")
      .eq("id", trimmedMatchId)
      .maybeSingle();

    if (matchError || !matchRow) {
      return {
        error: "Матч не найден.",
      };
    }

    if (matchRow.status === "finished" || matchRow.is_forfeit) {
      return {
        error: "Матч уже завершен.",
      };
    }

    if (
      trimmedClaimingTeamId !== matchRow.team_a_id &&
      trimmedClaimingTeamId !== matchRow.team_b_id
    ) {
      return {
        error: "Ваша команда не участвует в этом матче.",
      };
    }

    const actualOpponentTeamId =
      trimmedClaimingTeamId === matchRow.team_a_id ? matchRow.team_b_id : matchRow.team_a_id;

    if (trimmedOpponentTeamId !== actualOpponentTeamId) {
      return {
        error: "Команда соперника указана неверно.",
      };
    }

    const { data: opponentMembers, error: opponentMembersError } = await adminClient
      .from("team_members")
      .select("user_id")
      .eq("team_id", actualOpponentTeamId);

    if (opponentMembersError) {
      return {
        error: opponentMembersError.message,
      };
    }

    const { error: updateError } = await adminClient
      .from("tournament_matches")
      .update({
        is_forfeit: true,
        winner_team_id: trimmedClaimingTeamId,
        status: "finished",
      })
      .eq("id", trimmedMatchId);

    if (updateError) {
      return {
        error: updateError.message,
      };
    }

    for (const opponentMember of opponentMembers ?? []) {
      await applyBehaviorPenalty({
        adminClient,
        userId: opponentMember.user_id,
        matchId: trimmedMatchId,
        penalty: FORFEIT_BEHAVIOR_PENALTY,
        reason: FORFEIT_BEHAVIOR_REASON,
      });
    }

    revalidatePath(`/matches/${trimmedMatchId}`);
    revalidatePath("/matches");
    revalidatePath("/tournament");

    return {
      error: null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось запросить техническую победу.",
    };
  }
}
