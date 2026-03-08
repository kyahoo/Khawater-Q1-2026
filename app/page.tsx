"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const isLoggedIn = false;
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn) {
      router.replace("/tournament");
    }
  }, [isLoggedIn, router]);

  if (isLoggedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-transparent text-white">
      <main className="px-6 py-12 sm:py-20">
        <section className="mx-auto flex min-h-[70vh] max-w-6xl items-center">
          <div className="max-w-2xl">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center border border-zinc-600 bg-zinc-900 text-sm font-semibold">
                K
              </div>
              <div className="text-xl font-semibold tracking-wide">Khawater</div>
            </div>
            <h1 className="mb-6 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Khawater World 🌍
            </h1>
            <p className="mb-8 max-w-xl text-base leading-7 text-zinc-300">
              Турниры Dota 2, сделанные с любовью.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                href="/auth"
                className="inline-block rounded border border-zinc-500 bg-white px-6 py-3 text-sm font-medium text-zinc-950"
              >
                Регистрация
              </a>
              <a
                href="/auth"
                className="inline-block rounded border border-zinc-600 px-6 py-3 text-sm font-medium text-white"
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
