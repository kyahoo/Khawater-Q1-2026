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
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="px-6 py-12 sm:py-20">
        <section className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center border border-zinc-600 bg-zinc-900 text-sm font-semibold">
                K
              </div>
              <div className="text-xl font-semibold tracking-wide">Khawater</div>
            </div>
            <h1 className="mb-6 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              A competitive stage for teams entering the Khawater season.
            </h1>
            <p className="mb-8 max-w-xl text-base leading-7 text-zinc-300">
              Phase 1 starts here. Register as a player, complete setup, join or
              create a team, and move into the active tournament experience.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                href="/auth"
                className="inline-block rounded border border-zinc-500 bg-white px-6 py-3 text-sm font-medium text-zinc-950"
              >
                Register
              </a>
              <a
                href="/auth"
                className="inline-block rounded border border-zinc-600 px-6 py-3 text-sm font-medium text-white"
              >
                Log in
              </a>
            </div>
          </div>

          <div className="border border-zinc-700 bg-zinc-900 p-4">
            <div className="flex h-[420px] items-center justify-center border border-dashed border-zinc-600 bg-zinc-950 text-center text-sm text-zinc-400">
              Khawater key visual / hero image placeholder
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
