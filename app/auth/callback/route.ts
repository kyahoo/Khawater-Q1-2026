import { NextRequest, NextResponse } from "next/server";

const DEFAULT_REDIRECT_PATH = "/tournament";

function getSafeRedirectPath(next: string | null) {
  if (!next || !next.startsWith("/")) {
    return DEFAULT_REDIRECT_PATH;
  }

  if (next.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  return next;
}

export async function GET(request: NextRequest) {
  const redirectPath = getSafeRedirectPath(
    request.nextUrl.searchParams.get("next")
  );
  const redirectUrl = new URL(redirectPath, request.url);

  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== "next") {
      redirectUrl.searchParams.set(key, value);
    }
  });

  return NextResponse.redirect(redirectUrl);
}
