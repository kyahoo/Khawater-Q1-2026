"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      setHasSession(false);
      router.replace("/");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  function isActivePath(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function navLinkClass(href: string) {
    return `inline-flex items-center justify-center text-sm uppercase tracking-wide transition-colors touch-manipulation md:text-base ${
      isActivePath(href)
        ? "font-bold text-[#CD9C3E]"
        : "font-bold text-white hover:text-gray-300"
    }`;
  }

  return (
    <header className="sticky top-0 z-50 flex w-full flex-row items-center justify-between bg-khawater-blue px-8 py-4">
      <div className="mx-auto flex w-full max-w-6xl flex-row items-center justify-between">
        <div className="relative z-10 flex items-center gap-6">
        <div className="inline-flex items-center justify-center text-2xl font-extrabold uppercase tracking-tighter text-white touch-manipulation md:text-3xl">
          Khawater
        </div>

          <nav className="relative z-10 flex items-center gap-6">
            <Link
              href="/tournament"
              className={navLinkClass("/tournament")}
            >
              Турнир
            </Link>
            <Link
              href="/rules"
              className={navLinkClass("/rules")}
            >
              Правила
            </Link>
          </nav>
        </div>

        <div className="relative z-10 flex items-center gap-6">
          {hasSession === null ? (
            <div className="h-9 w-24 bg-white/10" />
          ) : hasSession ? (
            <div className="flex items-center gap-6">
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
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="w-fit text-sm font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors hover:text-[#CD9C3E]"
              >
                {isSigningOut ? "Выход..." : "Выйти"}
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              className="inline-flex w-fit items-center justify-center text-sm font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors touch-manipulation hover:text-[#CD9C3E]"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
