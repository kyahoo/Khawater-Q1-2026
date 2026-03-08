"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfileByUserId } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";

async function routeUserAfterAuth(userId: string, router: ReturnType<typeof useRouter>) {
  const profile = await getProfileByUserId(userId);
  router.replace(profile ? "/profile" : "/player-setup");
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
        await routeUserAfterAuth(user.id, router);
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
        throw new Error("Login did not return a user.");
      }

      await routeUserAfterAuth(data.user.id, router);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed.");
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
          emailRedirectTo: "http://localhost:3000/profile",
        },
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        await routeUserAfterAuth(data.user.id, router);
        return;
      }

      setErrorMessage(
        "Signup succeeded but no active session was created. Check your Supabase auth settings."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Registration failed."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-semibold">Auth</h1>
        <p className="mb-6 max-w-2xl text-sm leading-7 text-zinc-700">
          Log in to your existing account or register as a player to begin using
          Khawater in phase 1.
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
              placeholder="Enter email"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Password</label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-sm outline-none"
            />
          </div>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row">
            <button
              type="submit"
              disabled={isLoading}
              className="rounded border border-zinc-400 bg-white px-5 py-2.5 text-sm font-medium"
            >
              {isLoading ? "Working..." : "Login"}
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
              {isLoading ? "Working..." : "Register as Player"}
            </button>
          </div>
        </form>

        {errorMessage && (
          <p className="mb-6 max-w-2xl text-sm leading-7 text-red-600">
            {errorMessage}
          </p>
        )}

        <p className="max-w-2xl text-sm leading-7 text-zinc-600">
          Registration is only the first step. After creating an account, the
          flow continues into basic player setup so the user can complete their
          profile and move into team or tournament participation.
        </p>
      </main>
    </div>
  );
}
