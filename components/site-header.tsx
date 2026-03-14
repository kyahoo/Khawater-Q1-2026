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
    const userPromise = supabase.auth.getUser();
    const liveMatchBootstrapPromise = supabase.auth
      .getClaims()
      .then(async ({ data, error }) => {
        const claimsUserId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

        if (error || !claimsUserId) {
          if (error) {
            console.error("Site header claims load failed:", error);
          }

          return {
            claimsUserId: null,
            hasLiveMatch: false,
          };
        }

        try {
          return {
            claimsUserId,
            hasLiveMatch: await getHasLiveMatchForUserWithClient(supabase, claimsUserId),
          };
        } catch (queryError) {
          console.error("Site header live match load failed:", queryError);

          return {
            claimsUserId,
            hasLiveMatch: false,
          };
        }
      })
      .catch((claimsError) => {
        console.error("Site header claims bootstrap failed:", claimsError);

        return {
          claimsUserId: null,
          hasLiveMatch: false,
        };
      });

    const [
      {
        data: { user },
      },
      liveMatchBootstrap,
    ] = await Promise.all([userPromise, liveMatchBootstrapPromise]);

    currentUserId = user?.id ?? null;
    hasLiveMatch =
      currentUserId !== null &&
      liveMatchBootstrap.claimsUserId === currentUserId &&
      liveMatchBootstrap.hasLiveMatch;
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
