"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getProfileByUserId } from "@/lib/supabase/profiles";
import { createTeamWithCaptain, getCurrentMembership } from "@/lib/supabase/teams";

export default function CreateTeamPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [tagline, setTagline] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadUserState = async () => {
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

        if (!profile) {
          router.replace("/player-setup");
          return;
        }

        const membership = await getCurrentMembership(user.id);

        if (membership) {
          router.replace("/my-team");
          return;
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load team setup."
        );
      } finally {
        setIsChecking(false);
      }
    };

    void loadUserState();
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");

    try {
      const trimmedName = teamName.trim();

      if (!trimmedName) {
        throw new Error("Team name is required.");
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      await createTeamWithCaptain({
        userId: user.id,
        name: trimmedName,
        tagline: tagline.trim(),
      });

      router.replace("/my-team");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create team."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isChecking) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-3xl text-sm text-zinc-600">
          Loading team creation...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-semibold">Create Team</h1>

        <p className="mb-4 max-w-2xl text-sm leading-7 text-zinc-700">
          In phase 1, creating a team gives you a basic team space for managing
          your roster, reviewing join requests, and entering the active
          tournament when ready.
        </p>

        <p className="mb-8 max-w-2xl text-sm leading-7 text-zinc-600">
          The user who creates the team becomes the team captain.
        </p>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Enter team name"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Short Description / Tagline
            </label>
            <textarea
              rows={4}
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              placeholder="Optional short description"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-sm outline-none"
            />
          </div>

          {errorMessage && (
            <p className="text-sm leading-7 text-red-600">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="rounded border border-zinc-400 bg-white px-5 py-2.5 text-sm font-medium"
          >
            {isSaving ? "Creating..." : "Create Team"}
          </button>
        </form>
      </main>
    </div>
  );
}
