"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  beginProfilePasskeyRegistration,
  completeProfilePasskeyRegistration,
  type BeginProfilePasskeyRegistrationResult,
  type CompleteProfilePasskeyRegistrationResult,
  getProfilePasskeyBindingStatus as getProfilePasskeyBindingStatusFromServer,
  type ProfilePasskeyBindingStatusResult,
} from "@/lib/webauthn/server";

type ProfileActionContext = {
  user: User;
  adminClient: SupabaseClient<Database>;
};

type PendingSteamData = {
  steamId: string;
  username: string;
  avatar_url: string | null;
};

function getProfileActionEnv() {
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

function parsePendingSteamData(cookieValue: string | undefined): PendingSteamData | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf8")
    ) as Partial<PendingSteamData>;

    if (
      typeof parsedValue.steamId !== "string" ||
      typeof parsedValue.username !== "string" ||
      (parsedValue.avatar_url !== null && typeof parsedValue.avatar_url !== "string")
    ) {
      return null;
    }

    return {
      steamId: parsedValue.steamId,
      username: parsedValue.username,
      avatar_url: parsedValue.avatar_url,
    };
  } catch {
    return null;
  }
}

async function getProfileActionContext(
  accessToken: string
): Promise<{ error: string | null; context: ProfileActionContext | null }> {
  const env = getProfileActionEnv();

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

export async function finalizeSteamLink(
  accessToken: string
): Promise<{ error: string | null }> {
  const trimmedToken = accessToken.trim();
  const cookieStore = await cookies();
  const pendingSteamData = parsePendingSteamData(
    cookieStore.get("steam_pending_data")?.value
  );

  if (!pendingSteamData) {
    cookieStore.delete("steam_pending_data");
    return {
      error: "Steam link data is missing or invalid.",
    };
  }

  const authResult = await getProfileActionContext(trimmedToken);

  if (authResult.error || !authResult.context) {
    cookieStore.delete("steam_pending_data");
    return {
      error: authResult.error ?? "Could not verify your session.",
    };
  }
  const { user, adminClient } = authResult.context;

  try {
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        steam_id: pendingSteamData.steamId,
        username: pendingSteamData.username,
        avatar_url: pendingSteamData.avatar_url,
      })
      .eq("id", user.id);

    cookieStore.delete("steam_pending_data");

    if (updateError) {
      return {
        error: updateError.message,
      };
    }

    revalidatePath("/profile");

    return {
      error: null,
    };
  } catch (error) {
    cookieStore.delete("steam_pending_data");
    return {
      error:
        error instanceof Error ? error.message : "Steam profile update failed.",
    };
  }
}

export async function updateProfileName(
  accessToken: string,
  newName: string
): Promise<{ error: string | null }> {
  const trimmedToken = accessToken.trim();
  const trimmedName = newName.trim();

  if (!trimmedToken) {
    return {
      error: "Session is required.",
    };
  }

  if (!trimmedName) {
    return {
      error: "Имя не может быть пустым.",
    };
  }

  const authResult = await getProfileActionContext(trimmedToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Could not verify your session.",
    };
  }

  const { user, adminClient } = authResult.context;

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      username: trimmedName,
    })
    .eq("id", user.id);

  if (updateError) {
    return {
      error: updateError.message,
    };
  }

  revalidatePath("/profile");

  return {
    error: null,
  };
}

export async function getProfilePasskeyRegistrationOptions(
  accessToken: string
): Promise<BeginProfilePasskeyRegistrationResult> {
  const trimmedToken = accessToken.trim();

  if (!trimmedToken) {
    return {
      error: "Session is required.",
    };
  }

  const authResult = await getProfileActionContext(trimmedToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Could not verify your session.",
    };
  }

  return beginProfilePasskeyRegistration({
    adminClient: authResult.context.adminClient,
    user: authResult.context.user,
  });
}

export async function getProfilePasskeyBindingStatus(
  accessToken: string
): Promise<ProfilePasskeyBindingStatusResult> {
  const trimmedToken = accessToken.trim();

  if (!trimmedToken) {
    return {
      error: "Session is required.",
      isDeviceBound: false,
    };
  }

  const authResult = await getProfileActionContext(trimmedToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Could not verify your session.",
      isDeviceBound: false,
    };
  }

  return getProfilePasskeyBindingStatusFromServer({
    adminClient: authResult.context.adminClient,
    userId: authResult.context.user.id,
  });
}

export async function verifyProfilePasskeyRegistration(
  accessToken: string,
  response: RegistrationResponseJSON
): Promise<CompleteProfilePasskeyRegistrationResult> {
  const trimmedToken = accessToken.trim();

  if (!trimmedToken) {
    return {
      error: "Session is required.",
    };
  }

  const authResult = await getProfileActionContext(trimmedToken);

  if (authResult.error || !authResult.context) {
    return {
      error: authResult.error ?? "Could not verify your session.",
    };
  }

  try {
    const result = await completeProfilePasskeyRegistration({
      adminClient: authResult.context.adminClient,
      userId: authResult.context.user.id,
      response,
    });

    if (!result.error) {
      revalidatePath("/profile");
    }

    return result;
  } catch (error) {
    console.error("Profile passkey registration failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not register this device.",
    };
  }
}
