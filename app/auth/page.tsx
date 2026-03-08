"use client";

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
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-semibold">Авторизация</h1>
        <p className="mb-6 max-w-2xl text-sm leading-7 text-zinc-700">
          Войдите в свой аккаунт или зарегистрируйтесь как игрок, чтобы начать
          использовать Khawater.
        </p>

        <form
          className="mb-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin(getCredentialsFromForm(event.currentTarget));
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Введите email"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Пароль</label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-sm outline-none"
            />
          </div>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row">
            <button
              type="submit"
              disabled={isLoading}
              className="rounded border border-zinc-400 bg-white px-5 py-2.5 text-sm font-medium"
            >
              {isLoading ? "Обработка..." : "Войти"}
            </button>
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
              className="rounded border border-zinc-400 px-5 py-2.5 text-sm font-medium"
            >
              {isLoading ? "Обработка..." : "Регистрация игрока"}
            </button>
          </div>
        </form>

        {errorMessage && (
          <p className="mb-6 max-w-2xl text-sm leading-7 text-red-600">
            {errorMessage}
          </p>
        )}

        <p className="max-w-2xl text-sm leading-7 text-zinc-600">
          Регистрация — это только первый шаг. После создания аккаунта вам будет
          предложено настроить профиль, чтобы присоединиться к команде и
          участвовать в турнирах.
        </p>
      </main>
    </div>
  );
}
