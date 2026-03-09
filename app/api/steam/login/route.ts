import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_LINK_TOKEN_COOKIE = "khawater_steam_link_token";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get("accessToken")?.trim();

  if (!accessToken) {
    return NextResponse.redirect(new URL("/profile", getAppUrl()));
  }

  const appUrl = getAppUrl();
  const callbackUrl = `${appUrl}/api/steam/callback`;
  const steamUrl = new URL(STEAM_OPENID_ENDPOINT);

  steamUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  steamUrl.searchParams.set("openid.mode", "checkid_setup");
  steamUrl.searchParams.set(
    "openid.identity",
    "http://specs.openid.net/auth/2.0/identifier_select"
  );
  steamUrl.searchParams.set(
    "openid.claimed_id",
    "http://specs.openid.net/auth/2.0/identifier_select"
  );
  steamUrl.searchParams.set("openid.return_to", callbackUrl);
  steamUrl.searchParams.set("openid.realm", appUrl);

  const response = NextResponse.redirect(steamUrl);

  response.cookies.set({
    name: STEAM_LINK_TOKEN_COOKIE,
    value: accessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
