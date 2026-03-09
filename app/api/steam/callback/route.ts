import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_LINK_TOKEN_COOKIE = "khawater_steam_link_token";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function buildProfileRedirect() {
  return new URL("/profile", getAppUrl());
}

function buildRedirectResponse() {
  const response = NextResponse.redirect(buildProfileRedirect());
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
  const accessToken = request.cookies.get(STEAM_LINK_TOKEN_COOKIE)?.value?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !steamApiKey || !accessToken) {
    return buildRedirectResponse();
  }

  const isValidSteamResponse = await validateSteamCallback(request);

  if (!isValidSteamResponse) {
    return buildRedirectResponse();
  }

  const steamId = extractSteamId(request.nextUrl.searchParams.get("openid.claimed_id"));

  if (!steamId) {
    return buildRedirectResponse();
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
    return buildRedirectResponse();
  }

  const steamResponse = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(
      steamApiKey
    )}&steamids=${encodeURIComponent(steamId)}`,
    {
      cache: "no-store",
    }
  );

  if (!steamResponse.ok) {
    return buildRedirectResponse();
  }

  const steamPayload = (await steamResponse.json()) as {
    response?: {
      players?: Array<{
        personaname?: string;
        avatarfull?: string;
      }>;
    };
  };
  const player = steamPayload.response?.players?.[0];

  if (!player?.personaname) {
    return buildRedirectResponse();
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await adminClient
    .from("profiles")
    .update({
      steam_id: steamId,
      username: player.personaname,
      avatar_url: player.avatarfull ?? null,
    })
    .eq("id", user.id);

  return buildRedirectResponse();
}
