"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";

async function routeUserAfterAuth(router: ReturnType<typeof useRouter>) {
  router.replace("/tournament");
}

function getCredentialsFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  return { email, password };
}

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await routeUserAfterAuth(router);
      }
    };

    void checkSession();
  }, [router]);

  async function handleLogin(credentials?: { email: string; password: string }) {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const nextEmail = credentials?.email ?? email;
      const nextPassword = credentials?.password ?? password;
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: nextEmail,
        password: nextPassword,
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error("Вход выполнен, но пользователь не был возвращен.");
      }

      await routeUserAfterAuth(router);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось выполнить вход.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(credentials?: { email: string; password: string }) {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const nextEmail = credentials?.email ?? email;
      const nextPassword = credentials?.password ?? password;
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: nextEmail,
        password: nextPassword,
        options: {
          emailRedirectTo: "http://localhost:3000/tournament",
        },
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        await routeUserAfterAuth(router);
        return;
      }

      setErrorMessage(
        "Регистрация прошла успешно, но активная сессия не была создана. Проверьте настройки Supabase Auth."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось завершить регистрацию."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden text-white">
      <Image
        src="/esports-bg.png"
        alt="Фон авторизации"
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />
      <div className="absolute inset-0 z-0 bg-[#061726]/80 backdrop-blur-sm" />
      <SiteHeader />

      <main className="relative z-10 w-full max-w-md px-6">
        <form
          className="flex w-full max-w-md flex-col gap-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-8 shadow-[12px_12px_0px_0px_#061726]"
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin(getCredentialsFromForm(event.currentTarget));
          }}
        >
          <div>
            <h1 className="text-[#CD9C3E] text-4xl font-black uppercase tracking-wide">
              Вход
            </h1>
            <p className="mt-3 text-sm leading-7 text-gray-300">
              Войдите в свой аккаунт или зарегистрируйтесь как игрок, чтобы
              начать использовать Khawater.
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-[#CD9C3E]">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Введите email"
              className="w-full rounded-none border-2 border-[#061726] bg-[#061726]/80 p-3 text-white placeholder:text-gray-400 focus:border-[#CD9C3E] focus:outline-none focus:ring-1 focus:ring-[#CD9C3E]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-[#CD9C3E]">
              Пароль
            </label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
              className="w-full rounded-none border-2 border-[#061726] bg-[#061726]/80 p-3 text-white placeholder:text-gray-400 focus:border-[#CD9C3E] focus:outline-none focus:ring-1 focus:ring-[#CD9C3E]"
            />
          </div>
          <div className="flex flex-col gap-4">
            <button
              type="submit"
              disabled={isLoading}
              className="border-[2px] border-[#061726] bg-[#CD9C3E] p-3 font-bold uppercase text-[#061726] transition-transform hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#061726]"
            >
              {isLoading ? "Обработка..." : "Войти"}
            </button>
            <div className="mt-4 text-center text-sm text-gray-300">
              Нет аккаунта?
            </div>
            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;

                if (!form) {
                  return;
                }

                void handleRegister(getCredentialsFromForm(form));
              }}
              disabled={isLoading}
              className="mt-4 text-center text-sm text-[#CD9C3E] hover:underline"
            >
              {isLoading ? "Обработка..." : "Создать аккаунт"}
            </button>
          </div>

          {errorMessage && (
            <p className="text-sm leading-7 text-red-300">{errorMessage}</p>
          )}

          <p className="text-sm leading-7 text-gray-300">
            Регистрация — это только первый шаг. После создания аккаунта вам
            будет предложено настроить профиль, чтобы присоединиться к команде
            и участвовать в турнирах.
          </p>
        </form>
      </main>
    </div>
  );
}
