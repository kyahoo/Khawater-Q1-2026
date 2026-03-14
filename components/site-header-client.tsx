"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getHasLiveMatchForUser } from "@/lib/supabase/matches";
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
  const [hasLiveMatch, setHasLiveMatch] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadUserNavigationState = useEffectEvent(async (userId: string) => {
    try {
      const [nextTaskCount, nextBehaviorScore, nextHasLiveMatch] = await Promise.all([
        getActiveTaskCountForUser(userId),
        getBehaviorScoreForUser(userId),
        getHasLiveMatchForUser(userId),
      ]);
      setActiveTaskCount(nextTaskCount);
      setBehaviorScore(nextBehaviorScore);
      setHasLiveMatch(nextHasLiveMatch);
    } catch (error) {
      console.error("Navigation state load failed:", error);
      setActiveTaskCount(0);
      setHasLiveMatch(false);
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
      setHasLiveMatch(false);
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
      setHasLiveMatch(false);
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

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        isMoreOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isMoreOpen]);

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

  function dropdownLinkClass(href: string) {
    return `block whitespace-nowrap px-4 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${
      isActivePath(href)
        ? "bg-white/10 text-[#CD9C3E]"
        : "text-white hover:bg-white/10"
    }`;
  }

  function formatTaskCount(taskCount: number) {
    if (taskCount > 99) {
      return "99+";
    }

    return String(taskCount);
  }

  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  ) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-[#061726] bg-gradient-to-r from-[#0B3A4A] via-[#0B3A4A] via-70% to-[#061726]">
      <div className="mx-auto w-full max-w-6xl">
        <nav className="flex w-full flex-nowrap items-center gap-6 overflow-x-auto px-4 py-4 md:gap-8 md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
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
          <Link href="/news" className={navLinkClass("/news")}>
            Новости
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
                <span className="inline-flex items-center gap-2">
                  <span>Мои матчи</span>
                  {hasLiveMatch && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                    </span>
                  )}
                </span>
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
          <div ref={dropdownRef} className="relative flex items-center">
            <button
              type="button"
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              aria-expanded={isMoreOpen}
              className={`inline-flex h-full shrink-0 cursor-pointer items-center justify-center whitespace-nowrap border-b-4 pb-1 text-base font-bold uppercase tracking-wide transition-colors md:text-lg ${
                isActivePath("/rules") || isActivePath("/history")
                  ? "border-[#CD9C3E] text-[#CD9C3E]"
                  : "border-transparent text-white hover:text-gray-300"
              }`}
            >
              Прочее
            </button>
            {isMoreOpen && (
              <div className="fixed right-0 top-[62px] z-[100] flex min-w-[160px] flex-col bg-[#0B3A4A] shadow-2xl md:absolute md:right-0 md:top-full md:mt-2">
                <Link
                  href="/rules"
                  className={dropdownLinkClass("/rules")}
                  onClick={() => setIsMoreOpen(false)}
                >
                  Правила
                </Link>
                <Link
                  href="/history"
                  className={dropdownLinkClass("/history")}
                  onClick={() => setIsMoreOpen(false)}
                >
                  Зал славы
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
