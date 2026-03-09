import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SiteHeaderClient } from "./site-header-client";

export async function SiteHeader() {
  let currentUserId: string | null = null;
  let behaviorScore: number | null = null;

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    currentUserId = user?.id ?? null;

    if (currentUserId) {
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("behavior_score")
        .eq("id", currentUserId)
        .maybeSingle();

      if (profileError) {
        console.error("Site header behavior score load failed:", profileError);
      } else {
        behaviorScore =
          typeof profileRow?.behavior_score === "number" ? profileRow.behavior_score : null;
      }
    }
  } catch (error) {
    console.error("Site header bootstrap failed:", error);
  }

  return (
    <SiteHeaderClient
      key={`${currentUserId ?? "anon"}:${behaviorScore ?? "na"}`}
      initialBehaviorScore={behaviorScore}
      initialCurrentUserId={currentUserId}
    />
  );
}
