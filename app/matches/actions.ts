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

type UploadMatchResultScreenshotResult = {
  publicUrl: string;
};

type LobbyScreenshotOcrData = {
  lobby_host: string;
  players_in_lobby: string[];
};

type AnalyzeLobbyScreenshotResult = {
  data: LobbyScreenshotOcrData | null;
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
const MISTRAL_LOBBY_OCR_SYSTEM_PROMPT =
  "You are an OCR assistant analyzing a photo of a monitor displaying a Dota 2 custom lobby. Focus strictly on extracting two things: 1. The 'Lobby Host' (located in the top right of the lobby UI panel, e.g., 'Lobby Host: [Name]'). 2. The exact in-game nicknames of any players currently assigned to 'The Radiant' or 'The Dire' team slots. Return ONLY a valid JSON object in this exact format: { \"lobby_host\": \"Name\", \"players_in_lobby\": [\"Player1\", \"Player2\"] }. Do not include any markdown formatting, backticks, or conversational text.";

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

function parseLobbyScreenshotOcrData(data: unknown): LobbyScreenshotOcrData | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const { lobby_host: lobbyHost, players_in_lobby: playersInLobby } = data as {
    lobby_host?: unknown;
    players_in_lobby?: unknown;
  };

  if (typeof lobbyHost !== "string" || !Array.isArray(playersInLobby)) {
    return null;
  }

  const parsedPlayers = playersInLobby.filter(
    (player): player is string => typeof player === "string"
  );

  if (parsedPlayers.length !== playersInLobby.length) {
    return null;
  }

  return {
    lobby_host: lobbyHost.trim(),
    players_in_lobby: parsedPlayers.map((player) => player.trim()),
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

export async function uploadMatchResultScreenshot(
  matchId: string,
  formData: FormData
): Promise<UploadMatchResultScreenshotResult> {
  const trimmedMatchId = matchId.trim();
  const accessTokenEntry = formData.get("accessToken");
  const imageFileEntry = formData.get("resultScreenshot");
  const accessToken =
    typeof accessTokenEntry === "string" ? accessTokenEntry.trim() : "";

  if (!trimmedMatchId) {
    throw new Error("Матч обязателен.");
  }

  if (!accessToken) {
    throw new Error("Сессия истекла. Войдите в аккаунт заново.");
  }

  if (!(imageFileEntry instanceof File) || imageFileEntry.size === 0) {
    throw new Error("Выберите скриншот финального результата.");
  }

  if (!imageFileEntry.type.startsWith("image/")) {
    throw new Error("Файл результата должен быть изображением.");
  }

  const authResult = await getMatchActionContext(accessToken);

  if (authResult.error || !authResult.context) {
    throw new Error(authResult.error ?? "Не удалось проверить сессию.");
  }

  const { adminClient, user } = authResult.context;
  const { data: matchRow, error: matchError } = await adminClient
    .from("tournament_matches")
    .select("id, team_a_id, team_b_id")
    .eq("id", trimmedMatchId)
    .maybeSingle();

  if (matchError || !matchRow) {
    throw new Error("Матч не найден.");
  }

  const typedMatch = matchRow as Pick<
    MatchActionMatchRow,
    "id" | "team_a_id" | "team_b_id"
  >;
  const { data: captainMembership, error: captainError } = await adminClient
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .eq("is_captain", true)
    .in("team_id", [typedMatch.team_a_id, typedMatch.team_b_id])
    .maybeSingle();

  if (captainError || !captainMembership) {
    throw new Error(
      "Только капитан одной из команд этого матча может загрузить итоговый скриншот."
    );
  }

  const filePath = `${trimmedMatchId}/${Date.now()}-result.${getUploadFileExtension(
    imageFileEntry
  )}`;
  const imageBytes = new Uint8Array(await imageFileEntry.arrayBuffer());
  const { error: uploadError } = await adminClient.storage
    .from("match-results")
    .upload(filePath, imageBytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: imageFileEntry.type || undefined,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = adminClient.storage.from("match-results").getPublicUrl(filePath);

  if (!publicUrl) {
    throw new Error("Не удалось получить публичную ссылку на результат матча.");
  }

  const { error: updateError } = await adminClient
    .from("tournament_matches")
    .update({
      result_screenshot_url: publicUrl,
    })
    .eq("id", trimmedMatchId);

  if (updateError) {
    await adminClient.storage.from("match-results").remove([filePath]);
    throw new Error(updateError.message);
  }

  revalidateMatchPaths(trimmedMatchId);

  return {
    publicUrl,
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

  const lobbyScreenshotUrl = authResult.context.checkInRow?.lobby_screenshot_url?.trim();

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
            content: MISTRAL_LOBBY_OCR_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the lobby host and all player nicknames currently visible in The Radiant and The Dire slots.",
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
    const parsedData = parseLobbyScreenshotOcrData(parsedContent);

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
