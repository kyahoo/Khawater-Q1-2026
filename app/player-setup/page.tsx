"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfileByUserId, upsertProfile } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";

export default function PlayerSetupPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth");
          return;
        }

        const profile = await getProfileByUserId(user.id);

        if (profile) {
          router.replace("/profile");
          return;
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load user."
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadUser();
  }, [router]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");

    try {
      const trimmedNickname = nickname.trim();

      if (!trimmedNickname) {
        throw new Error("Display name / nickname is required.");
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      await upsertProfile({
        id: user.id,
        nickname: trimmedNickname,
      });

      router.replace("/profile");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-semibold">Player Setup</h1>

        <p className="mb-8 max-w-2xl text-sm leading-7 text-zinc-700">
          This is the next step after registering. Use it to add the basic
          player information needed before joining a team or taking part in the
          tournament flow.
        </p>
        <p className="mb-8 max-w-2xl text-sm leading-7 text-zinc-500">
          After this step, continue to your profile.
        </p>

        <form className="space-y-6" onSubmit={handleSave}>
          <div>
            <label className="mb-2 block text-sm font-medium">
              Display Name / Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Enter display name"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-sm outline-none"
            />
          </div>

          {errorMessage && (
            <p className="text-sm leading-7 text-red-600">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || isSaving}
            className="rounded border border-zinc-400 bg-white px-5 py-2.5 text-sm font-medium"
          >
            {isLoading || isSaving ? "Saving..." : "Save and Continue"}
          </button>
        </form>
      </main>
    </div>
  );
}
