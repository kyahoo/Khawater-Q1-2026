import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SiteHeaderClient } from "./site-header-client";

export function SiteHeaderSkeleton() {
  return (
    <SiteHeaderClient
      key="header-fallback"
      initialBehaviorScore={null}
      initialCurrentUserId={null}
    />
  );
}

export async function SiteHeaderData() {
  let currentUserId: string | null = null;

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    currentUserId = user?.id ?? null;
  } catch (error) {
    console.error("Site header bootstrap failed:", error);
  }

  return (
    <SiteHeaderClient
      key={currentUserId ?? "anon"}
      initialBehaviorScore={null}
      initialCurrentUserId={currentUserId}
    />
  );
}
