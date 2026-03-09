import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_PENDING_DATA_COOKIE = "steam_pending_data";

function buildErrorResponse(
  message: string,
  status: number
) {
  const response = NextResponse.json({ error: message }, { status });
  response.cookies.delete(STEAM_PENDING_DATA_COOKIE);
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
  const steamApiKey = process.env.STEAM_API_KEY;

  if (!supabaseUrl || !steamApiKey) {
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
        502
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
      500
    );
  }

  if (!player?.personaname) {
    return buildErrorResponse(
      "Steam profile data was not returned for this account.",
      404
    );
  }

  const pendingSteamData = Buffer.from(
    JSON.stringify({
      steamId,
      username: player.personaname,
      avatar_url: player.avatarfull ?? null,
    })
  ).toString("base64url");

  const response = NextResponse.redirect(
    new URL("/profile?steam_pending=true", request.url)
  );
  response.cookies.set(STEAM_PENDING_DATA_COOKIE, pendingSteamData, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 5,
  });

  return response;
}
