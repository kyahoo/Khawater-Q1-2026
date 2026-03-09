import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function GET(request: NextRequest) {
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

  return NextResponse.redirect(steamUrl);
}
