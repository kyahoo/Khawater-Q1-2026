"use server";

import { revalidatePath } from "next/cache";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  beginProfilePasskeyRegistration,
  completeProfilePasskeyRegistration,
  type BeginProfilePasskeyRegistrationResult,
  type CompleteProfilePasskeyRegistrationResult,
} from "@/lib/webauthn/server";

type ProfileActionContext = {
  user: User;
  adminClient: SupabaseClient<Database>;
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
