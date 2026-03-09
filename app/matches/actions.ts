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
  is_host_found: boolean;
  is_uploader_found: boolean;
};

type AnalyzeLobbyScreenshotResult = {
  data: LobbyScreenshotVerificationData | null;
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

type AuthorizedLobbyHostMatchActionContext = MatchActionContext & {
  match: MatchActionMatchRow;
  hostTeamId: string;
  hostCaptainUserId: string;
};

const CHECK_IN_WINDOW_MS = 30 * 60 * 1000;

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

function getUploadFileExtension(file: File) {
  const extensionByType: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };

  const extension =
    extensionByType[file.type] ??
    file.name.split(".").pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, "") ??
    "jpg";

  return extension || "jpg";
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

  const { is_host_found: isHostFound, is_uploader_found: isUploaderFound } = data as {
    is_host_found?: unknown;
    is_uploader_found?: unknown;
  };

  if (
    typeof isHostFound !== "boolean" ||
    typeof isUploaderFound !== "boolean"
  ) {
    return null;
  }

  return {
    is_host_found: isHostFound,
    is_uploader_found: isUploaderFound,
  };
}

function buildLobbyVerificationPrompt(
  expectedHostName: string,
  expectedPlayerName: string
) {
  return `You are an OCR assistant for a Dota 2 tournament. Look at the provided screenshot of the lobby.
Your only job is to find two specific names:
1. The host name: '${expectedHostName}'
2. The player name: '${expectedPlayerName}'
Respond ONLY with a JSON object containing two boolean values indicating if you found them.

Return this exact JSON structure:
{
  "is_host_found": boolean,
  "is_uploader_found": boolean
}`;
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

async function getExpectedLobbyVerificationNames(params: {
  adminClient: SupabaseClient<Database>;
  match: MatchActionMatchRow;
  userId: string;
}) {
  const { adminClient, match, userId } = params;
  const lobbyHostResult = await getLobbyHostForMatch({
    adminClient,
    match,
  });

  if (lobbyHostResult.error || !lobbyHostResult.hostCaptainUserId) {
    return {
      error: lobbyHostResult.error ?? "Не удалось определить ожидаемого хоста лобби.",
      expectedHostName: null,
      expectedPlayerName: null,
    };
  }

  const profileIds = Array.from(
    new Set([lobbyHostResult.hostCaptainUserId, userId])
  );
  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, nickname")
    .in("id", profileIds);

  if (profilesError) {
    return {
      error: "Не удалось загрузить ожидаемые никнеймы для проверки.",
      expectedHostName: null,
      expectedPlayerName: null,
    };
  }

  const nicknameById = new Map(
    ((profiles ?? []) as Array<{ id: string; nickname: string | null }>).map(
      (profile) => [profile.id, profile.nickname?.trim() ?? ""]
    )
  );

  const expectedHostName =
    nicknameById.get(lobbyHostResult.hostCaptainUserId) ?? "";
  const expectedPlayerName = nicknameById.get(userId) ?? "";

  if (!expectedHostName || !expectedPlayerName) {
    return {
      error: "Не удалось определить ожидаемые имена для OCR-проверки.",
      expectedHostName: null,
      expectedPlayerName: null,
    };
  }

  return {
    error: null,
    expectedHostName,
    expectedPlayerName,
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

  const { data: matchScheduleRow, error: matchScheduleError } = await adminClient
    .from("tournament_matches")
    .select("scheduled_at")
    .eq("id", trimmedMatchId)
    .maybeSingle();

  if (matchScheduleError) {
    return {
      error: matchScheduleError.message,
    };
  }

  const scheduledAt = matchScheduleRow?.scheduled_at;

  if (scheduledAt) {
    const scheduledAtTime = new Date(scheduledAt).getTime();

    if (Number.isFinite(scheduledAtTime)) {
      const uploadDeadline = scheduledAtTime + 30 * 60 * 1000;

      if (Date.now() > uploadDeadline) {
        return {
          error:
            "Время загрузки истекло. Скриншоты лобби принимаются только в течение 30 минут после старта.",
        };
      }
    }
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

export async function uploadMatchResultGameScreenshot(
  matchId: string,
  formData: FormData
): Promise<UploadMatchResultGameScreenshotResult> {
  let slotIndex: number | null = null;

  try {
    const trimmedMatchId = matchId.trim();
    const accessTokenEntry = formData.get("accessToken");
    const imageFileEntry = formData.get("resultScreenshot");
    const accessToken =
      typeof accessTokenEntry === "string" ? accessTokenEntry.trim() : "";

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

    if (!(imageFileEntry instanceof File) || imageFileEntry.size === 0) {
      return {
        error: "Выберите скриншот игры.",
        publicUrl: null,
        slotIndex,
      };
    }

    if (!imageFileEntry.type.startsWith("image/")) {
      return {
        error: "Файл результата должен быть изображением.",
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

    const filePath = `${trimmedMatchId}/game-${slotIndex}/${Date.now()}-result.${getUploadFileExtension(
      imageFileEntry
    )}`;
    const imageBytes = new Uint8Array(await imageFileEntry.arrayBuffer());
    const { error: uploadError } = await authResult.context.adminClient.storage
      .from("match-results")
      .upload(filePath, imageBytes, {
        cacheControl: "3600",
        upsert: false,
        contentType: imageFileEntry.type || undefined,
      });

    if (uploadError) {
      return {
        error: uploadError.message,
        publicUrl: null,
        slotIndex,
      };
    }

    const {
      data: { publicUrl },
    } = authResult.context.adminClient.storage
      .from("match-results")
      .getPublicUrl(filePath);

    if (!publicUrl) {
      return {
        error: "Не удалось получить публичную ссылку на скриншот игры.",
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
      publicUrl,
    });

    let { error: updateError } = await authResult.context.adminClient
      .from("tournament_matches")
      .update({
        result_screenshot_urls: nextScreenshotUrls,
      })
      .eq("id", trimmedMatchId);

    if (updateError) {
      return {
        error: updateError.message,
        publicUrl: null,
        slotIndex,
      };
    }

    revalidateMatchPaths(trimmedMatchId);

    return {
      error: null,
      publicUrl,
      slotIndex,
    };
  } catch (error) {
    console.error("Match result screenshot upload failed:", error);

    return {
      error: getActionErrorMessage(
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

  let { error: updateError } = await authResult.context.adminClient
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
  accessToken = ""
): Promise<AnalyzeLobbyScreenshotResult> {
  const trimmedMatchId = matchId.trim();
  const trimmedToken = accessToken.trim();
  const mistralApiKey = process.env.MISTRAL_API_KEY;

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

  const expectedNamesResult = await getExpectedLobbyVerificationNames({
    adminClient: authResult.context.adminClient,
    match: authResult.context.match,
    userId: authResult.context.user.id,
  });

  if (
    expectedNamesResult.error ||
    !expectedNamesResult.expectedHostName ||
    !expectedNamesResult.expectedPlayerName
  ) {
    return {
      data: null,
      error: expectedNamesResult.error ?? "Не удалось подготовить OCR-проверку.",
    };
  }

  const lobbyScreenshotUrl =
    authResult.context.checkInRow?.lobby_screenshot_url?.trim();

  if (!lobbyScreenshotUrl) {
    return {
      data: null,
      error: "Сначала загрузите фото лобби.",
    };
  }

  try {
    new URL(lobbyScreenshotUrl);
  } catch {
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
            content: buildLobbyVerificationPrompt(
              expectedNamesResult.expectedHostName,
              expectedNamesResult.expectedPlayerName
            ),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Check whether the expected host and uploader names are visible anywhere in the screenshot.",
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
