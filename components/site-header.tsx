import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getHasLiveMatchForUserWithClient } from "@/lib/supabase/matches";
import { SiteHeaderClient } from "./site-header-client";

export function SiteHeaderSkeleton() {
  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-[#061726] bg-gradient-to-r from-[#0B3A4A] via-[#0B3A4A] via-70% to-[#061726]">
      <div className="mx-auto w-full max-w-6xl">
        <nav className="flex w-full flex-nowrap items-center gap-6 overflow-x-auto px-4 py-4 md:gap-8 md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 border-transparent pb-1 text-base font-black uppercase tracking-tighter text-white md:text-lg">
            Khawater
          </span>
          <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 border-transparent pb-1 text-base font-bold uppercase tracking-wide text-white/80 md:text-lg">
            Новости
          </span>
          <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 border-transparent pb-1 text-base font-bold uppercase tracking-wide text-white/80 md:text-lg">
            <span className="inline-flex items-center gap-2">
              <span>Мои матчи</span>
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-500/50 animate-pulse" />
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 border-transparent pb-1 text-base font-bold uppercase tracking-wide text-white/80 md:text-lg">
            Задачи
          </span>
          <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 border-transparent pb-1 text-base font-bold uppercase tracking-wide text-white/80 md:text-lg">
            Профиль
          </span>
          <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 border-transparent pb-1 text-base font-bold uppercase tracking-wide text-white/80 md:text-lg">
            Прочее
          </span>
        </nav>
      </div>
    </header>
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
