import "server-only";

import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const CEREMONY_TIMEOUT_MS = 5 * 60 * 1000;
const REGISTRATION_COOKIE_NAME = "khawater_webauthn_registration";
const AUTHENTICATION_COOKIE_NAME = "khawater_webauthn_authentication";
const PROFILE_REGISTRATION_SCOPE = "__profile_registration__";
const SUPPORTED_TRANSPORTS = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

type AdminClient = SupabaseClient<Database>;
type CeremonyKind = "registration" | "authentication";
type PasskeyRow = Database["public"]["Tables"]["user_passkeys"]["Row"];
type CheckInRow = Database["public"]["Tables"]["match_check_ins"]["Row"];

type ChallengeCookiePayload = {
  challenge: string;
  userId: string;
  matchId: string;
  createdAt: number;
};

export type BeginMatchBiometricVerificationResult =
  | {
      error: string;
      ceremony?: never;
      options?: never;
    }
  | {
      error: null;
      ceremony: "registration";
      options: PublicKeyCredentialCreationOptionsJSON;
    }
  | {
      error: null;
      ceremony: "authentication";
      options: PublicKeyCredentialRequestOptionsJSON;
    };

export type CompleteMatchBiometricVerificationResult = {
  error: string | null;
};

export type BeginProfilePasskeyRegistrationResult = {
  error: string | null;
  options?: PublicKeyCredentialCreationOptionsJSON;
};

export type CompleteProfilePasskeyRegistrationResult = {
  error: string | null;
};

export type ProfilePasskeyBindingStatusResult = {
  error: string | null;
  isDeviceBound: boolean;
};

function normalizeDelimitedValues(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

async function getWebAuthnRequestConfig() {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host");
  const rawHost = (forwardedHost ?? headerStore.get("host"))?.split(",")[0]?.trim();

  if (!rawHost) {
    throw new Error("Missing request host for WebAuthn.");
  }

  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const inferredProtocol =
    forwardedProto ??
    (rawHost.startsWith("localhost") || rawHost.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const requestUrl = new URL(`${inferredProtocol}://${rawHost}`);
  const configuredOrigins = [
    ...normalizeDelimitedValues(process.env.WEBAUTHN_EXPECTED_ORIGIN),
    ...normalizeDelimitedValues(process.env.WEBAUTHN_EXPECTED_ORIGINS),
  ];

  return {
    rpID: process.env.WEBAUTHN_RP_ID?.trim() || requestUrl.hostname,
    rpName: process.env.WEBAUTHN_RP_NAME?.trim() || "Khawater",
    expectedOrigin:
      configuredOrigins.length > 0
        ? configuredOrigins
        : requestUrl.origin.replace(/\/+$/, ""),
    secureCookie: requestUrl.protocol === "https:",
  };
}

function getCookieName(ceremony: CeremonyKind) {
  return ceremony === "registration"
    ? REGISTRATION_COOKIE_NAME
    : AUTHENTICATION_COOKIE_NAME;
}

function encodeChallengeCookie(payload: ChallengeCookiePayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeChallengeCookie(value: string): ChallengeCookiePayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<ChallengeCookiePayload>;

    if (
      typeof parsed.challenge !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.matchId !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    return {
      challenge: parsed.challenge,
      userId: parsed.userId,
      matchId: parsed.matchId,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

async function storeChallengeCookie(
  ceremony: CeremonyKind,
  payload: ChallengeCookiePayload,
  secure: boolean
) {
  const cookieStore = await cookies();
  cookieStore.set(getCookieName(ceremony), encodeChallengeCookie(payload), {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: CEREMONY_TIMEOUT_MS / 1000,
  });
}

async function consumeChallengeCookie(ceremony: CeremonyKind) {
  const cookieStore = await cookies();
  const cookieName = getCookieName(ceremony);
  const value = cookieStore.get(cookieName)?.value;
  cookieStore.delete(cookieName);

  if (!value) {
    return null;
  }

  const payload = decodeChallengeCookie(value);

  if (!payload) {
    return null;
  }

  if (Date.now() - payload.createdAt > CEREMONY_TIMEOUT_MS) {
    return null;
  }

  return payload;
}

function filterAuthenticatorTransports(
  transports: string[] | undefined
): AuthenticatorTransportFuture[] | undefined {
  const normalized = (transports ?? []).filter(
    (transport): transport is AuthenticatorTransportFuture =>
      SUPPORTED_TRANSPORTS.has(transport as AuthenticatorTransportFuture)
  );

  return normalized.length > 0 ? normalized : undefined;
}

function mapPasskeyToCredential(passkey: PasskeyRow): WebAuthnCredential {
  return {
    id: passkey.credential_id,
    publicKey: isoBase64URL.toBuffer(passkey.public_key),
    counter: passkey.counter,
    transports: filterAuthenticatorTransports(passkey.transports),
  };
}

async function getUserPasskeys(adminClient: AdminClient, userId: string) {
  const { data, error } = await adminClient
    .from("user_passkeys")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Не удалось загрузить passkey пользователя.");
  }

  return (data ?? []) as PasskeyRow[];
}

async function getUserPasskeyCount(adminClient: AdminClient, userId: string) {
  const { count, error } = await adminClient
    .from("user_passkeys")
    .select("credential_id", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error("Не удалось проверить привязку устройства.");
  }

  return count ?? 0;
}

export async function getProfilePasskeyBindingStatus(params: {
  adminClient: AdminClient;
  userId: string;
}): Promise<ProfilePasskeyBindingStatusResult> {
  try {
    return {
      error: null,
      isDeviceBound: (await getUserPasskeyCount(params.adminClient, params.userId)) > 0,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось проверить привязку устройства.",
      isDeviceBound: false,
    };
  }
}

async function getCheckedInRow(
  adminClient: AdminClient,
  matchId: string,
  userId: string
) {
  const { data, error } = await adminClient
    .from("match_check_ins")
    .select("*")
    .eq("match_id", matchId)
    .eq("player_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Не удалось проверить статус матча.");
  }

  return (data ?? null) as CheckInRow | null;
}

async function markBiometricVerified(
  adminClient: AdminClient,
  matchId: string,
  userId: string
) {
  const existingRow = await getCheckedInRow(adminClient, matchId, userId);

  if (existingRow) {
    const { error } = await adminClient
      .from("match_check_ins")
      .update({
        biometric_verified: true,
      })
      .eq("match_id", matchId)
      .eq("player_id", userId);

    if (error) {
      throw new Error("Не удалось обновить биометрическую проверку.");
    }

    return;
  }

  const { error } = await adminClient.from("match_check_ins").insert({
    match_id: matchId,
    player_id: userId,
    created_at: new Date().toISOString(),
    biometric_verified: true,
    is_checked_in: false,
    lobby_screenshot_url: null,
  });

  if (error) {
    throw new Error("Не удалось сохранить биометрическую проверку.");
  }
}

async function createOrUpdatePasskey(params: {
  adminClient: AdminClient;
  userId: string;
  response: RegistrationResponseJSON;
  passkey: WebAuthnCredential;
  deviceType: string;
  backedUp: boolean;
}) {
  const now = new Date().toISOString();
  const transports = filterAuthenticatorTransports(params.response.response.transports) ?? [];
  const { data: existingCredential, error: existingCredentialError } = await params.adminClient
    .from("user_passkeys")
    .select("credential_id, user_id")
    .eq("credential_id", params.passkey.id)
    .maybeSingle();

  if (existingCredentialError) {
    throw new Error("Не удалось проверить существующий passkey.");
  }

  if (existingCredential && existingCredential.user_id !== params.userId) {
    throw new Error("Этот passkey уже привязан к другому аккаунту.");
  }

  const payload: Database["public"]["Tables"]["user_passkeys"]["Insert"] = {
    credential_id: params.passkey.id,
    user_id: params.userId,
    public_key: isoBase64URL.fromBuffer(params.passkey.publicKey),
    counter: params.passkey.counter,
    device_type: params.deviceType,
    backed_up: params.backedUp,
    transports,
    updated_at: now,
  };

  if (existingCredential) {
    const { error: updateError } = await params.adminClient
      .from("user_passkeys")
      .update(payload)
      .eq("credential_id", params.passkey.id)
      .eq("user_id", params.userId);

    if (updateError) {
      throw new Error("Не удалось обновить passkey.");
    }

    return;
  }

  const { error: insertError } = await params.adminClient
    .from("user_passkeys")
    .insert({
      ...payload,
      created_at: now,
    });

  if (insertError) {
    throw new Error("Не удалось сохранить passkey.");
  }
}

async function updatePasskeyAfterAuthentication(params: {
  adminClient: AdminClient;
  passkey: PasskeyRow;
  newCounter: number;
  deviceType: string;
  backedUp: boolean;
}) {
  const { error } = await params.adminClient
    .from("user_passkeys")
    .update({
      counter: params.newCounter,
      device_type: params.deviceType,
      backed_up: params.backedUp,
      updated_at: new Date().toISOString(),
    })
    .eq("credential_id", params.passkey.credential_id)
    .eq("user_id", params.passkey.user_id);

  if (error) {
    throw new Error("Не удалось обновить счетчик passkey.");
  }
}

async function getPasskeyProfileName(adminClient: AdminClient, userId: string) {
  const { data } = await adminClient
    .from("profiles")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle();

  return data?.nickname?.trim() || null;
}

async function buildRegistrationOptionsForUser(params: {
  adminClient: AdminClient;
  user: User;
}) {
  const webAuthnConfig = await getWebAuthnRequestConfig();
  const passkeys = await getUserPasskeys(params.adminClient, params.user.id);
  const profileName = await getPasskeyProfileName(params.adminClient, params.user.id);
  const userName = params.user.email?.trim() || params.user.id;
  const userDisplayName = profileName ?? params.user.email?.trim() ?? params.user.id;
  const options = await generateRegistrationOptions({
    rpName: webAuthnConfig.rpName,
    rpID: webAuthnConfig.rpID,
    userID: new TextEncoder().encode(params.user.id),
    userName,
    userDisplayName,
    timeout: CEREMONY_TIMEOUT_MS,
    attestationType: "none",
    excludeCredentials: passkeys.map((passkey) => ({
      id: passkey.credential_id,
      transports: filterAuthenticatorTransports(passkey.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    preferredAuthenticatorType: "localDevice",
  });

  return {
    webAuthnConfig,
    options,
  };
}

export async function beginProfilePasskeyRegistration(params: {
  adminClient: AdminClient;
  user: User;
}): Promise<BeginProfilePasskeyRegistrationResult> {
  const { adminClient, user } = params;

  try {
    if ((await getUserPasskeyCount(adminClient, user.id)) > 0) {
      return {
        error: "К этому аккаунту уже привязана биометрия.",
      };
    }

    const { webAuthnConfig, options } = await buildRegistrationOptionsForUser({
      adminClient,
      user,
    });

    await storeChallengeCookie(
      "registration",
      {
        challenge: options.challenge,
        userId: user.id,
        matchId: PROFILE_REGISTRATION_SCOPE,
        createdAt: Date.now(),
      },
      webAuthnConfig.secureCookie
    );

    return {
      error: null,
      options,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось начать регистрацию устройства.",
    };
  }
}

export async function completeProfilePasskeyRegistration(params: {
  adminClient: AdminClient;
  userId: string;
  response: RegistrationResponseJSON;
}): Promise<CompleteProfilePasskeyRegistrationResult> {
  if ((await getUserPasskeyCount(params.adminClient, params.userId)) > 0) {
    return {
      error: "К этому аккаунту уже привязана биометрия.",
    };
  }

  const challengePayload = await consumeChallengeCookie("registration");

  if (
    !challengePayload ||
    challengePayload.matchId !== PROFILE_REGISTRATION_SCOPE ||
    challengePayload.userId !== params.userId
  ) {
    return {
      error: "Сессия регистрации устройства истекла. Попробуйте еще раз.",
    };
  }

  const webAuthnConfig = await getWebAuthnRequestConfig();
  const verification = await verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: challengePayload.challenge,
    expectedOrigin: webAuthnConfig.expectedOrigin,
    expectedRPID: webAuthnConfig.rpID,
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return {
      error: "Не удалось подтвердить устройство.",
    };
  }

  await createOrUpdatePasskey({
    adminClient: params.adminClient,
    userId: params.userId,
    response: params.response,
    passkey: verification.registrationInfo.credential,
    deviceType: verification.registrationInfo.credentialDeviceType,
    backedUp: verification.registrationInfo.credentialBackedUp,
  });

  return {
    error: null,
  };
}

export async function beginMatchBiometricVerification(params: {
  adminClient: AdminClient;
  matchId: string;
  user: User;
}): Promise<BeginMatchBiometricVerificationResult> {
  const { adminClient, matchId, user } = params;
  const webAuthnConfig = await getWebAuthnRequestConfig();
  const passkeys = await getUserPasskeys(adminClient, user.id);

  if (passkeys.length === 0) {
    const { options } = await buildRegistrationOptionsForUser({
      adminClient,
      user,
    });

    await storeChallengeCookie(
      "registration",
      {
        challenge: options.challenge,
        userId: user.id,
        matchId,
        createdAt: Date.now(),
      },
      webAuthnConfig.secureCookie
    );

    return {
      error: null,
      ceremony: "registration",
      options,
    };
  }

  const options = await generateAuthenticationOptions({
    rpID: webAuthnConfig.rpID,
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credential_id,
      transports: filterAuthenticatorTransports(passkey.transports),
    })),
    timeout: CEREMONY_TIMEOUT_MS,
    userVerification: "required",
  });

  await storeChallengeCookie(
    "authentication",
    {
      challenge: options.challenge,
      userId: user.id,
      matchId,
      createdAt: Date.now(),
    },
    webAuthnConfig.secureCookie
  );

  return {
    error: null,
    ceremony: "authentication",
    options,
  };
}

export async function completeMatchBiometricRegistration(params: {
  adminClient: AdminClient;
  matchId: string;
  userId: string;
  response: RegistrationResponseJSON;
}): Promise<CompleteMatchBiometricVerificationResult> {
  const { adminClient, matchId, userId, response } = params;
  const challengePayload = await consumeChallengeCookie("registration");

  if (
    !challengePayload ||
    challengePayload.matchId !== matchId ||
    challengePayload.userId !== userId
  ) {
    return {
      error: "Сессия подтверждения истекла. Попробуйте еще раз.",
    };
  }

  const webAuthnConfig = await getWebAuthnRequestConfig();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengePayload.challenge,
    expectedOrigin: webAuthnConfig.expectedOrigin,
    expectedRPID: webAuthnConfig.rpID,
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return {
      error: "Не удалось подтвердить passkey.",
    };
  }

  await createOrUpdatePasskey({
    adminClient,
    userId,
    response,
    passkey: verification.registrationInfo.credential,
    deviceType: verification.registrationInfo.credentialDeviceType,
    backedUp: verification.registrationInfo.credentialBackedUp,
  });

  await markBiometricVerified(adminClient, matchId, userId);

  return {
    error: null,
  };
}

export async function completeMatchBiometricAuthentication(params: {
  adminClient: AdminClient;
  matchId: string;
  userId: string;
  response: AuthenticationResponseJSON;
}): Promise<CompleteMatchBiometricVerificationResult> {
  const { adminClient, matchId, userId, response } = params;
  const challengePayload = await consumeChallengeCookie("authentication");

  if (
    !challengePayload ||
    challengePayload.matchId !== matchId ||
    challengePayload.userId !== userId
  ) {
    return {
      error: "Сессия подтверждения истекла. Попробуйте еще раз.",
    };
  }

  const { data: storedPasskey, error: storedPasskeyError } = await adminClient
    .from("user_passkeys")
    .select("*")
    .eq("credential_id", response.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (storedPasskeyError) {
    throw new Error("Не удалось загрузить сохраненный passkey.");
  }

  if (!storedPasskey) {
    return {
      error: "Для этого аккаунта не найден passkey на устройстве.",
    };
  }

  const webAuthnConfig = await getWebAuthnRequestConfig();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengePayload.challenge,
    expectedOrigin: webAuthnConfig.expectedOrigin,
    expectedRPID: webAuthnConfig.rpID,
    credential: mapPasskeyToCredential(storedPasskey as PasskeyRow),
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return {
      error: "Биометрическая проверка не пройдена.",
    };
  }

  await updatePasskeyAfterAuthentication({
    adminClient,
    passkey: storedPasskey as PasskeyRow,
    newCounter: verification.authenticationInfo.newCounter,
    deviceType: verification.authenticationInfo.credentialDeviceType,
    backedUp: verification.authenticationInfo.credentialBackedUp,
  });

  await markBiometricVerified(adminClient, matchId, userId);

  return {
    error: null,
  };
}
