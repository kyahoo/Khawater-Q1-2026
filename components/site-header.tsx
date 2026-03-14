import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getHasLiveMatchForUserWithClient } from "@/lib/supabase/matches";
import { SiteHeaderClient } from "./site-header-client";

export function SiteHeaderSkeleton() {
  return (
    <SiteHeaderClient
      key="header-fallback"
      initialBehaviorScore={null}
      initialCurrentUserId={null}
      initialHasLiveMatch={false}
    />
  );
}

export async function SiteHeaderData() {
  let currentUserId: string | null = null;
  let hasLiveMatch = false;

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    currentUserId = user?.id ?? null;

    if (currentUserId) {
      try {
        hasLiveMatch = await getHasLiveMatchForUserWithClient(supabase, currentUserId);
      } catch (queryError) {
        console.error("Site header live match load failed:", queryError);
      }
    }
  } catch (error) {
    console.error("Site header bootstrap failed:", error);
  }

  return (
    <SiteHeaderClient
      key={`${currentUserId ?? "anon"}:${hasLiveMatch ? "live" : "idle"}`}
      initialBehaviorScore={null}
      initialCurrentUserId={currentUserId}
      initialHasLiveMatch={hasLiveMatch}
    />
  );
}
