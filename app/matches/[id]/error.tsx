"use client";

import { useEffect } from "react";
import Link from "next/link";

type MatchErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MatchErrorPage({ error, reset }: MatchErrorPageProps) {
  useEffect(() => {
    console.error("Live Match Route Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen text-white">
      <div className="min-h-screen bg-[#0B3A4A]/10 backdrop-blur-sm shadow-[0_0_60px_-10px_rgba(11,58,74,0.3)]">
        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-6 shadow-[6px_6px_0px_0px_#061726]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
              Ошибка матча
            </p>
            <h1 className="mt-3 text-2xl font-black uppercase text-white">
              СБОЙ ЗАГРУЗКИ МАТЧА
            </h1>
            <div className="mt-5 border-[3px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
              <p className="text-sm font-bold text-[#CD9C3E]">
                {error.message || String(error)}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="border-[3px] border-[#061726] bg-[#CD9C3E] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
              >
                Попробовать снова
              </button>
              <Link
                href="/tournament"
                className="border-[3px] border-[#061726] bg-[#061726] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
              >
                Назад к турниру
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
