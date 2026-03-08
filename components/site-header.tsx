"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SiteHeader() {
  const pathname = usePathname();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setHasSession(Boolean(data.session));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 flex w-full items-center justify-between bg-khawater-blue px-4 py-4 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-nowrap items-center gap-6 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="relative z-10 flex flex-nowrap items-center gap-6">
        <Link
          href="/tournament"
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap text-base font-extrabold uppercase tracking-tighter text-white touch-manipulation md:text-lg"
        >
          Khawater
        </Link>

          <nav className="relative z-10 flex flex-nowrap items-center gap-6 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            <Link
              href="/rules"
              className={navLinkClass("/rules")}
            >
              Правила
            </Link>
          </nav>
        </div>

        <div className="relative z-10 flex flex-nowrap items-center gap-6 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {hasSession === null ? (
            <div className="h-9 w-24 shrink-0 bg-white/10" />
          ) : hasSession ? (
            <div className="flex flex-nowrap items-center gap-6">
              <Link
                href="/matches"
                className={navLinkClass("/matches")}
              >
                Мои матчи
              </Link>
              <Link
                href="/profile"
                className={navLinkClass("/profile")}
              >
                Профиль
              </Link>
            </div>
          ) : (
            <Link
              href="/auth"
              className="inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap text-base font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors touch-manipulation hover:text-[#CD9C3E] md:text-lg"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
