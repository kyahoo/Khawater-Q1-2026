"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfileByUserId, type Profile } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteTeamIfLastCaptain,
  getCurrentTeamDetails,
  leaveCurrentTeam,
} from "@/lib/supabase/teams";
import {
  confirmTournamentParticipation,
  getActiveTournament,
  getTournamentConfirmation,
  type Tournament,
} from "@/lib/supabase/tournaments";
import { SiteHeader } from "@/components/site-header";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamData, setTeamData] = useState<Awaited<
    ReturnType<typeof getCurrentTeamDetails>
  > | null>(null);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMutatingTeam, setIsMutatingTeam] = useState(false);
  const [isConfirmingParticipation, setIsConfirmingParticipation] = useState(false);
  const [isParticipationConfirmed, setIsParticipationConfirmed] = useState(false);
  const isCaptain = teamData?.membership.is_captain ?? false;
  const isLastMember = (teamData?.members.length ?? 0) === 1;

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth");
          return;
        }

        const nextProfile = await getProfileByUserId(user.id);

        if (!nextProfile) {
          router.replace("/player-setup");
          return;
        }

        setProfile(nextProfile);
        const [nextTeamData, nextActiveTournament] = await Promise.all([
          getCurrentTeamDetails(user.id),
          getActiveTournament(),
        ]);

        setTeamData(nextTeamData);
        setActiveTournament(nextActiveTournament);

        if (nextActiveTournament && nextTeamData) {
          const confirmation = await getTournamentConfirmation(
            nextActiveTournament.id,
            user.id
          );
          setIsParticipationConfirmed(Boolean(confirmation));
        } else {
          setIsParticipationConfirmed(false);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load profile."
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, [router]);

  async function handleLeaveTeam() {
    setIsMutatingTeam(true);
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

      await leaveCurrentTeam(user.id);
      setTeamData(null);
      setIsParticipationConfirmed(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not leave team."
      );
    } finally {
      setIsMutatingTeam(false);
    }
  }

  async function handleDeleteTeam() {
    setIsMutatingTeam(true);
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

      await deleteTeamIfLastCaptain(user.id);
      setTeamData(null);
      setIsParticipationConfirmed(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete team."
      );
    } finally {
      setIsMutatingTeam(false);
    }
  }

  async function handleConfirmParticipation() {
    setIsConfirmingParticipation(true);
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

      if (!activeTournament) {
        throw new Error("No active tournament found.");
      }

      if (!teamData) {
        throw new Error(
          "Join or create a team before confirming tournament participation."
        );
      }

      await confirmTournamentParticipation(activeTournament.id, user.id);
      setIsParticipationConfirmed(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not confirm participation."
      );
    } finally {
      setIsConfirmingParticipation(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-5xl text-sm text-zinc-600">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-6 text-3xl font-semibold">Профиль</h1>

        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="border border-zinc-300 bg-white p-5">
              <div className="mb-3 text-2xl font-semibold">
                {profile?.nickname ?? "Player"}
              </div>
            </div>

            <div className="border border-zinc-300 bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                Статус команды
              </h2>
              <div className="space-y-3 text-sm text-zinc-700">
                <div>
                  Команда:{" "}
                  <span className="font-medium text-zinc-900">
                    {teamData ? teamData.team.name : "No team yet"}
                  </span>
                </div>
              </div>

              {teamData && (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {isCaptain && isLastMember ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteTeam()}
                      disabled={isMutatingTeam}
                      className="rounded border border-zinc-400 bg-white px-4 py-2 text-sm font-medium"
                    >
                      {isMutatingTeam ? "Working..." : "Delete Team"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleLeaveTeam()}
                      disabled={isMutatingTeam}
                      className="rounded border border-zinc-400 bg-white px-4 py-2 text-sm font-medium"
                    >
                      {isMutatingTeam ? "Working..." : "Покинуть команду"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border border-zinc-300 bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                Участие в текущем турнире
              </h2>
              <div className="space-y-3 text-sm text-zinc-700">
                <div>
                  Команда:{" "}
                  <span className="font-medium text-zinc-900">
                    {teamData ? teamData.team.name : "No team yet"}
                  </span>
                </div>
                <div>
                  Турнир:{" "}
                  <span className="font-medium text-zinc-900">
                    {activeTournament?.name ?? "No active tournament"}
                  </span>
                </div>
                <div>
                  Статус участия:{" "}
                  <span className="font-medium text-zinc-900">
                    {isParticipationConfirmed ? "Подтверждено" : "Not confirmed"}
                  </span>
                </div>
              </div>

              {!teamData && (
                <p className="mt-5 text-sm text-zinc-600">
                  Join or create a team before confirming tournament
                  participation.
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleConfirmParticipation()}
                disabled={!activeTournament || !teamData || isConfirmingParticipation}
                className="mt-5 rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
              >
                {isParticipationConfirmed
                  ? "Участие подтверждено"
                  : isConfirmingParticipation
                    ? "Confirming..."
                    : "Confirm Participation"}
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            {teamData ? (
              <a
                href="/my-team"
                className="block rounded border border-zinc-300 bg-white px-5 py-4 text-sm font-medium"
              >
                Моя команда
              </a>
            ) : (
              <>
                <a
                  href="/create-team"
                  className="block rounded border border-zinc-300 bg-white px-5 py-4 text-sm font-medium"
                >
                  Create Team
                </a>
                <a
                  href="/join-team"
                  className="block rounded border border-zinc-300 bg-white px-5 py-4 text-sm font-medium"
                >
                  Join Team
                </a>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
