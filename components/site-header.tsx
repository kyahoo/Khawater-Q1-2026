"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SiteHeader() {
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

  return (
    <header className="sticky top-0 z-50 flex w-full items-center justify-between bg-[#09090B] px-8 py-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="relative z-10 flex items-center gap-12">
        <Link
          href="/tournament"
          className="inline-flex items-center justify-center text-2xl font-extrabold uppercase tracking-tighter text-white touch-manipulation md:text-3xl"
        >
          Khawater
        </Link>

          <nav className="relative z-10 flex items-center gap-8">
            <Link
              href="/tournament"
              className="inline-flex items-center justify-center text-sm font-bold uppercase tracking-wide text-white transition-colors touch-manipulation hover:text-[#FFD000] md:text-base"
            >
              Турнир
            </Link>
            <Link
              href="/rules"
              className="inline-flex items-center justify-center text-sm font-bold uppercase tracking-wide text-white transition-colors touch-manipulation hover:text-[#FFD000] md:text-base"
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
                className="relative z-10 inline-flex w-fit shrink-0 items-center justify-center bg-[#FFD000] px-8 py-3 text-sm font-extrabold uppercase text-[#09090B] transition-transform touch-manipulation clip-slant hover:-translate-y-1 md:text-base"
              >
                Мои матчи
              </Link>
              <Link
                href="/profile"
                className="inline-flex w-fit items-center justify-center text-sm font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors touch-manipulation hover:text-[#FFD000]"
              >
                Профиль
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="w-fit text-sm font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors hover:text-[#FFD000]"
              >
                {isSigningOut ? "Выход..." : "Выйти"}
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              className="inline-flex w-fit items-center justify-center text-sm font-bold uppercase tracking-wide text-[#FFFFFF] transition-colors touch-manipulation hover:text-[#FFD000]"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
