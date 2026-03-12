"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getProfileByUserId, type Profile } from "@/lib/supabase/profiles";
import {
  getCurrentMembership,
  joinTeam,
  listTeamsWithMeta,
  type TeamListItem,
} from "@/lib/supabase/teams";

export default function JoinTeamPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadJoinState = async () => {
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

        setProfile(profile);

        const [membership, teamList] = await Promise.all([
          getCurrentMembership(user.id),
          listTeamsWithMeta(),
        ]);

        setCurrentTeamId(membership?.team_id ?? null);
        setTeams(teamList);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load teams."
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadJoinState();
  }, [router]);

  async function handleJoin(teamId: string) {
    setJoiningTeamId(teamId);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      if (currentTeamId) {
        return;
      }

      const nextProfile = await getProfileByUserId(user.id);

      if (!nextProfile?.mmr) {
        setProfile(nextProfile);
        throw new Error("Укажите текущий MMR в профиле перед вступлением в команду.");
      }

      await joinTeam({ teamId, userId: user.id });
      setCurrentTeamId(teamId);
      setTeams((currentTeams) =>
        currentTeams.map((team) =>
          team.id === teamId
            ? { ...team, memberCount: team.memberCount + 1 }
            : team
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not join team."
      );
    } finally {
      setJoiningTeamId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-4xl text-sm text-zinc-600">
          Loading teams...
        </div>
      </div>
    );
  }

  const hasMMR = Boolean(profile?.mmr);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-4 text-3xl font-semibold">Join Team</h1>

        <p className="mb-8 max-w-2xl text-sm leading-7 text-zinc-700">
          Players can browse existing teams and join directly in phase 1. If you
          already belong to a team, joining another one is blocked. Teams that
          already entered the active tournament have a locked roster and cannot
          be joined.
        </p>

        {!hasMMR && (
          <div className="mb-6 border border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Add your current MMR on the{" "}
            <Link href="/profile" className="font-semibold underline">
              profile page
            </Link>{" "}
            before joining a team.
          </div>
        )}

        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-500">
            Available Teams
          </h2>
          <div className="space-y-3">
            {teams.map((team) => {
              const isCurrentTeam = currentTeamId === team.id;
              const isBlockedByExistingTeam = Boolean(currentTeamId) && !isCurrentTeam;
              const isLockedForActiveTournament = team.isLockedForActiveTournament;
              const isBlockedByMissingMMR = !hasMMR;

              return (
                <div
                  key={team.id}
                  className="flex flex-col gap-3 border border-zinc-300 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">{team.name}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      Captain: {team.captainName}
                    </div>
                    <div className="text-sm text-zinc-500">
                      Members: {team.memberCount}
                    </div>
                    {isLockedForActiveTournament && (
                      <div className="text-sm text-zinc-500">
                        Tournament status: Entered, roster locked
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={
                      isCurrentTeam ||
                      isBlockedByExistingTeam ||
                      isBlockedByMissingMMR ||
                      isLockedForActiveTournament ||
                      joiningTeamId === team.id
                    }
                    onClick={() => void handleJoin(team.id)}
                    className={`w-fit rounded border px-4 py-2 text-sm font-medium ${
                      isCurrentTeam ||
                      isBlockedByExistingTeam ||
                      isBlockedByMissingMMR ||
                      isLockedForActiveTournament
                        ? "border-zinc-300 bg-zinc-100 text-zinc-500"
                        : "border-zinc-400 bg-zinc-100 text-zinc-900"
                    }`}
                  >
                    {isCurrentTeam
                      ? "Joined"
                      : isBlockedByExistingTeam
                        ? "Already on a Team"
                        : isBlockedByMissingMMR
                          ? "MMR Required"
                        : isLockedForActiveTournament
                          ? "Roster Locked"
                        : joiningTeamId === team.id
                          ? "Joining..."
                          : "Join Team"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
