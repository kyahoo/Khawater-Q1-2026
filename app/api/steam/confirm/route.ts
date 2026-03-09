import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STEAM_PENDING_DATA_COOKIE = "steam_pending_data";

type PendingSteamData = {
  steamId: string;
  username: string;
  avatar_url: string | null;
};

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}

function buildProfileRedirectResponse(
  request: NextRequest,
  errorMessage?: string,
  cookieResponse?: NextResponse
) {
  const profileUrl = new URL("/profile", request.url);

  if (errorMessage) {
    profileUrl.searchParams.set("error", errorMessage);
  }

  const response = NextResponse.redirect(profileUrl);

  if (cookieResponse) {
    copyCookies(cookieResponse, response);
  }

  response.cookies.delete(STEAM_PENDING_DATA_COOKIE);

  return response;
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

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return buildProfileRedirectResponse(
      request,
      "Steam confirm is missing required environment variables."
    );
  }

  const cookieResponse = NextResponse.next();
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const pendingSteamData = parsePendingSteamData(
    request.cookies.get(STEAM_PENDING_DATA_COOKIE)?.value
  );

  if (!pendingSteamData) {
    return buildProfileRedirectResponse(
      request,
      "Steam link data is missing or invalid.",
      cookieResponse
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return buildProfileRedirectResponse(
      request,
      "Could not verify your session. Please log in again.",
      cookieResponse
    );
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        steam_id: pendingSteamData.steamId,
        username: pendingSteamData.username,
        avatar_url: pendingSteamData.avatar_url,
      })
      .eq("id", user.id);

    if (updateError) {
      return buildProfileRedirectResponse(request, updateError.message, cookieResponse);
    }
  } catch (error) {
    return buildProfileRedirectResponse(
      request,
      error instanceof Error ? error.message : "Steam profile update failed.",
      cookieResponse
    );
  }

  return buildProfileRedirectResponse(request, undefined, cookieResponse);
}
