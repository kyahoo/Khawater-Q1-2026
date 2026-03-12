"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveTaskCountForUser } from "@/lib/supabase/tasks";

type SiteHeaderClientProps = {
  initialBehaviorScore: number | null;
  initialCurrentUserId: string | null;
};

function getBehaviorBadgeTone(score: number) {
  if (score >= 4) {
    return "border-[#F4D38A] bg-[#CD9C3E] text-[#061726]";
  }

  if (score >= 1) {
    return "border-[#FCD34D] bg-[#F59E0B] text-[#061726]";
  }

  return "border-[#FCA5A5] bg-[#EF4444] text-white";
}

async function getBehaviorScoreForUser(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("behavior_score")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return typeof data?.behavior_score === "number" ? data.behavior_score : null;
}

export function SiteHeaderClient({
  initialBehaviorScore,
  initialCurrentUserId,
}: SiteHeaderClientProps) {
  const pathname = usePathname();
  const [currentUserId, setCurrentUserId] = useState<string | null>(initialCurrentUserId);
  const [hasSession, setHasSession] = useState(Boolean(initialCurrentUserId));
  const [activeTaskCount, setActiveTaskCount] = useState<number | null>(
    initialCurrentUserId ? null : 0
  );
  const [behaviorScore, setBehaviorScore] = useState<number | null>(initialBehaviorScore);

  const loadUserNavigationState = useEffectEvent(async (userId: string) => {
    try {
      const [nextTaskCount, nextBehaviorScore] = await Promise.all([
        getActiveTaskCountForUser(userId),
        getBehaviorScoreForUser(userId),
      ]);
      setActiveTaskCount(nextTaskCount);
      setBehaviorScore(nextBehaviorScore);
    } catch (error) {
      console.error("Navigation state load failed:", error);
      setActiveTaskCount(0);
    }
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      const sessionUserId = data.session?.user.id ?? null;
      setHasSession(Boolean(sessionUserId));
      setCurrentUserId(sessionUserId);

      if (sessionUserId) {
        void loadUserNavigationState(sessionUserId);
        return;
      }

      setActiveTaskCount(0);
      setBehaviorScore(null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUserId = session?.user.id ?? null;
      setHasSession(Boolean(sessionUserId));
      setCurrentUserId(sessionUserId);

      if (sessionUserId) {
        void loadUserNavigationState(sessionUserId);
        return;
      }

      setActiveTaskCount(0);
      setBehaviorScore(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || !hasSession) {
      return;
    }

    void loadUserNavigationState(currentUserId);
  }, [pathname, hasSession, currentUserId, initialBehaviorScore]);

  function isActivePath(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function navLinkClass(href: string) {
    return `inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 pb-1 text-base font-bold uppercase tracking-wide transition-colors touch-manipulation md:text-lg ${
      isActivePath(href)
        ? "border-[#CD9C3E] text-[#CD9C3E]"
        : "border-transparent text-white hover:text-gray-300"
    }`;
  }

  function formatTaskCount(taskCount: number) {
    if (taskCount > 99) {
      return "99+";
    }

    return String(taskCount);
  }

  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-[#061726] bg-khawater-blue">
      <div className="mx-auto w-full max-w-6xl">
        <nav className="flex w-full flex-nowrap items-center gap-6 overflow-x-auto px-4 py-4 md:gap-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          <Link
            href="/tournament"
            className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-4 pb-1 text-base uppercase tracking-tighter touch-manipulation md:text-lg ${
              pathname === "/tournament"
                ? "border-[#CD9C3E] font-black text-[#CD9C3E]"
                : "border-transparent font-bold text-white"
            }`}
          >
            Khawater
          </Link>
          <Link href="/rules" className={navLinkClass("/rules")}>
            Правила
          </Link>
          <Link href="/news" className={navLinkClass("/news")}>
            Новости
          </Link>
          <Link href="/history" className={navLinkClass("/history")}>
            Зал славы
          </Link>
          {hasSession === false ? (
            <Link
              href="/auth"
              className="inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap text-base font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors touch-manipulation hover:text-[#CD9C3E] md:text-lg"
            >
              Войти
            </Link>
          ) : hasSession ? (
            <>
              <Link href="/matches" className={navLinkClass("/matches")}>
                Мои матчи
              </Link>
              <Link href="/tasks" className={navLinkClass("/tasks")}>
                <span className="inline-flex items-center gap-2">
                  <span>Задачи</span>
                  {(activeTaskCount ?? 0) > 0 ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full border-2 border-[#7F1D1D] bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                      {formatTaskCount(activeTaskCount ?? 0)}
                    </span>
                  ) : null}
                </span>
              </Link>
              <Link href="/profile" className={navLinkClass("/profile")}>
                <span className="inline-flex items-center gap-2">
                  <span>Профиль</span>
                  {typeof behaviorScore === "number" ? (
                    <span
                      className={`inline-flex min-w-12 items-center justify-center border-[2px] px-2 py-1 font-mono text-[10px] font-black leading-none tracking-[0.18em] shadow-[2px_2px_0px_0px_#061726] md:text-[11px] ${getBehaviorBadgeTone(
                        behaviorScore
                      )}`}
                    >
                      {`[ ${behaviorScore} ]`}
                    </span>
                  ) : null}
                </span>
              </Link>
            </>
          ) : (
            <div className="h-9 w-24 shrink-0 bg-white/10" />
          )}
        </nav>
      </div>
    </header>
  );
}
