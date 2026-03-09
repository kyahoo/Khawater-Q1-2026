"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          router.push("/tournament");
        }
      }
    );

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/tournament");
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router, supabase]);

  return (
    <div className="min-h-screen bg-transparent text-white">
      <main className="px-6 py-12 sm:py-20">
        <section className="mx-auto flex min-h-[70vh] max-w-6xl items-center">
          <div className="w-fit max-w-3xl border-[4px] border-[#061726] bg-[#061726]/85 p-8 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md md:p-10">
            <h1 className="text-5xl font-black leading-tight text-[#CD9C3E] md:text-6xl">
              Khawater World 🌍
            </h1>
            <p className="mt-4 mb-8 max-w-xl text-xl text-white md:text-2xl">
              Турниры Dota 2, сделанные с любовью.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                href="/auth"
                className="inline-flex items-center justify-center border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-3 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
              >
                Регистрация
              </a>
              <a
                href="/auth"
                className="inline-flex items-center justify-center border-[3px] border-[#061726] bg-white px-6 py-3 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
              >
                Войти
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
