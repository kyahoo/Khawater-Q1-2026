"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveTaskCountForUser } from "@/lib/supabase/tasks";

export function SiteHeader() {
  const pathname = usePathname();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTaskCount, setActiveTaskCount] = useState<number | null>(null);

  const loadActiveTaskCount = useEffectEvent(async (userId: string) => {
    try {
      const nextTaskCount = await getActiveTaskCountForUser(userId);
      setActiveTaskCount(nextTaskCount);
    } catch (error) {
      console.error("Active task count load failed:", error);
      setActiveTaskCount(0);
    }
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setHasSession(Boolean(data.session));
        setCurrentUserId(data.session?.user.id ?? null);
        if (data.session?.user.id) {
          void loadActiveTaskCount(data.session.user.id);
        } else {
          setActiveTaskCount(0);
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
      setCurrentUserId(session?.user.id ?? null);
      if (session?.user.id) {
        void loadActiveTaskCount(session.user.id);
      } else {
        setActiveTaskCount(0);
      }
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

    void loadActiveTaskCount(currentUserId);
  }, [pathname, hasSession, currentUserId]);

  function isActivePath(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function navLinkClass(href: string) {
    return `inline-flex shrink-0 items-center justify-center whitespace-nowrap text-base font-bold uppercase tracking-wide transition-colors touch-manipulation md:text-lg ${
      isActivePath(href)
        ? "text-[#CD9C3E]"
        : "text-white hover:text-gray-300"
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
    <header className="sticky top-0 z-50 w-full bg-khawater-blue">
      <div className="mx-auto w-full max-w-6xl">
        <nav className="flex flex-nowrap items-center gap-6 overflow-x-auto w-full px-4 py-4 md:gap-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          <Link
            href="/tournament"
            className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap text-base uppercase tracking-tighter touch-manipulation md:text-lg ${
              pathname === "/tournament" ? "font-black text-[#CD9C3E]" : "font-bold text-white"
            }`}
          >
            Khawater
          </Link>
          <Link href="/rules" className={navLinkClass("/rules")}>
            Правила
          </Link>
          <Link href="/history" className={navLinkClass("/history")}>
            Зал славы
          </Link>
          {hasSession === null ? (
            <div className="h-9 w-24 shrink-0 bg-white/10" />
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
                Профиль
              </Link>
            </>
          ) : (
            <Link
              href="/auth"
              className="inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap text-base font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors touch-manipulation hover:text-[#CD9C3E] md:text-lg"
            >
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
