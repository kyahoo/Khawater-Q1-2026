import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_LINK_TOKEN_COOKIE = "khawater_steam_link_token";

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}

function buildErrorResponse(
  message: string,
  status: number,
  cookieResponse?: NextResponse
) {
  const response = NextResponse.json({ error: message }, { status });
  if (cookieResponse) {
    copyCookies(cookieResponse, response);
  }
  response.cookies.delete(STEAM_LINK_TOKEN_COOKIE);
  return response;
}

function buildProfileRedirectResponse(
  request: NextRequest,
  cookieResponse?: NextResponse
) {
  const response = NextResponse.redirect(new URL("/profile", request.url));
  if (cookieResponse) {
    copyCookies(cookieResponse, response);
  }
  response.cookies.delete(STEAM_LINK_TOKEN_COOKIE);
  return response;
}

function extractSteamId(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/steamcommunity\.com\/openid\/id\/(\d+)/i);
  return match?.[1] ?? null;
}

async function validateSteamCallback(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  params.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const text = await response.text();
  return text.includes("is_valid:true");
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const steamApiKey = process.env.STEAM_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !steamApiKey) {
    return buildErrorResponse("Steam callback is missing required environment variables.", 500);
  }

  const isValidSteamResponse = await validateSteamCallback(request);

  if (!isValidSteamResponse) {
    return buildErrorResponse("Steam OpenID validation failed.", 400);
  }

  const steamId = extractSteamId(request.nextUrl.searchParams.get("openid.claimed_id"));

  if (!steamId) {
    return buildErrorResponse("Steam ID was not returned by OpenID.", 400);
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

  const [
    {
      data: { user },
      error: userError,
    },
    {
      data: { session },
      error: sessionError,
    },
  ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

  if (userError || sessionError || !user || !session) {
    return buildErrorResponse("Auth session lost during Steam redirect.", 401, cookieResponse);
  }

  let player:
    | {
        personaname?: string;
        avatarfull?: string;
      }
    | undefined;

  try {
    const steamResponse = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(
        steamApiKey
      )}&steamids=${encodeURIComponent(steamId)}`,
      {
        cache: "no-store",
      }
    );

    if (!steamResponse.ok) {
      return buildErrorResponse(
        `Steam API request failed with status ${steamResponse.status}.`,
        502,
        cookieResponse
      );
    }

    const steamPayload = (await steamResponse.json()) as {
      response?: {
        players?: Array<{
          personaname?: string;
          avatarfull?: string;
        }>;
      };
    };
    player = steamPayload.response?.players?.[0];
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : "Steam API request failed.",
      500,
      cookieResponse
    );
  }

  if (!player?.personaname) {
    return buildErrorResponse(
      "Steam profile data was not returned for this account.",
      404,
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
        steam_id: steamId,
        username: player.personaname,
        avatar_url: player.avatarfull ?? null,
      })
      .eq("id", user.id);

    if (updateError) {
      return buildErrorResponse(updateError.message, 500, cookieResponse);
    }
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : "Steam profile update failed.",
      500,
      cookieResponse
    );
  }

  return buildProfileRedirectResponse(request, cookieResponse);
}
