import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STEAM_PENDING_DATA_COOKIE = "steam_pending_data";

type PendingSteamData = {
  steamId: string;
  username: string;
  avatar_url: string | null;
};

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
  const cookieStore = await cookies();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    cookieStore.delete(STEAM_PENDING_DATA_COOKIE);
    return NextResponse.redirect(
      new URL("/profile?error=Steam+confirm+is+missing+required+environment+variables.", request.url)
    );
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignore cookie writes when the runtime disallows mutation here.
        }
      },
    },
  });

  const pendingSteamData = parsePendingSteamData(
    cookieStore.get(STEAM_PENDING_DATA_COOKIE)?.value
  );

  if (!pendingSteamData) {
    cookieStore.delete(STEAM_PENDING_DATA_COOKIE);
    return NextResponse.redirect(
      new URL("/profile?error=Steam+link+data+is+missing+or+invalid.", request.url)
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    cookieStore.delete(STEAM_PENDING_DATA_COOKIE);
    return NextResponse.redirect(
      new URL("/profile?error=Could+not+verify+your+session.+Please+log+in+again.", request.url)
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
      cookieStore.delete(STEAM_PENDING_DATA_COOKIE);
      return NextResponse.redirect(
        new URL(`/profile?error=${encodeURIComponent(updateError.message)}`, request.url)
      );
    }
  } catch (error) {
    cookieStore.delete(STEAM_PENDING_DATA_COOKIE);
    return NextResponse.redirect(
      new URL(
        `/profile?error=${encodeURIComponent(
          error instanceof Error ? error.message : "Steam profile update failed."
        )}`,
        request.url
      )
    );
  }

  cookieStore.delete(STEAM_PENDING_DATA_COOKIE);
  return NextResponse.redirect(new URL("/profile", request.url));
}
