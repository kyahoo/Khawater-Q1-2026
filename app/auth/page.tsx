"use client";

import Image from "next/image";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleDiscordLogin() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/tournament`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось выполнить вход через Discord."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden text-white">
      <Image
        src="/esports-bg.avif"
        alt="Фон авторизации"
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />

      <main className="relative z-10 w-full max-w-md px-6">
        <div className="flex w-full max-w-md flex-col gap-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-8 shadow-[12px_12px_0px_0px_#061726]">
          <div>
            <h1 className="text-[#CD9C3E] text-4xl font-black uppercase tracking-wide">
              Вход
            </h1>
            <p className="mt-3 text-sm leading-7 text-gray-300">
              Подключите Discord, чтобы войти на турнирную платформу Khawater.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleDiscordLogin()}
            disabled={isLoading}
            className="mx-auto block w-full max-w-md border-[3px] border-[#061726] bg-[#0B3A4A] px-4 py-4 text-center text-xl font-black uppercase text-[#CD9C3E] shadow-[6px_6px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:cursor-not-allowed disabled:opacity-70 md:py-6 md:text-2xl"
          >
            {isLoading ? "ПЕРЕХОД В DISCORD..." : "ВОЙТИ ЧЕРЕЗ DISCORD"}
          </button>

          {errorMessage && (
            <p className="text-sm leading-7 text-red-300">{errorMessage}</p>
          )}
        </div>
      </main>
    </div>
  );
}
