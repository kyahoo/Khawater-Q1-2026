"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getProfileByUserId } from "@/lib/supabase/profiles";
import {
  deleteTeamIfLastCaptain,
  getCurrentTeamDetails,
  leaveCurrentTeam,
  type TeamMember,
} from "@/lib/supabase/teams";
import {
  createTournamentTeamEntry,
  getActiveTournament,
  getTournamentConfirmationsForUsers,
  getTournamentTeamEntry,
  type Tournament,
} from "@/lib/supabase/tournaments";
import { SiteHeader } from "@/components/site-header";

const TOURNAMENT_ENTRY_PLAYER_TARGET = 5;

export default function MyTeamPage() {
  const router = useRouter();
  const [teamData, setTeamData] = useState<Awaited<
    ReturnType<typeof getCurrentTeamDetails>
  > | null>(null);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [confirmedUserIds, setConfirmedUserIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMutatingTeam, setIsMutatingTeam] = useState(false);
  const [isEnteringTournament, setIsEnteringTournament] = useState(false);
  const [hasEnteredTournament, setHasEnteredTournament] = useState(false);

  useEffect(() => {
    const loadTeam = async () => {
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

        const [nextTeamData, nextActiveTournament] = await Promise.all([
          getCurrentTeamDetails(user.id),
          getActiveTournament(),
        ]);

        let nextConfirmedUserIds: string[] = [];
        let nextHasEnteredTournament = false;

        if (nextTeamData && nextActiveTournament) {
          const confirmations = await getTournamentConfirmationsForUsers(
            nextActiveTournament.id,
            nextTeamData.members.map((member) => member.userId)
          );

          nextConfirmedUserIds = confirmations.map(
            (confirmation) => confirmation.user_id
          );

          try {
            const existingEntry = await getTournamentTeamEntry(
              nextActiveTournament.id,
              nextTeamData.team.id
            );
            nextHasEnteredTournament = Boolean(existingEntry);
          } catch {
            nextHasEnteredTournament = false;
          }
        }

        setTeamData(nextTeamData);
        setActiveTournament(nextActiveTournament);
        setConfirmedUserIds(nextConfirmedUserIds);
        setHasEnteredTournament(nextHasEnteredTournament);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load team."
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadTeam();
  }, [router]);

  const confirmedUserIdSet = useMemo(
    () => new Set(confirmedUserIds),
    [confirmedUserIds]
  );

  const teamMembers = useMemo(
    () =>
      (teamData?.members ?? []).map((member: TeamMember) => ({
        ...member,
        isConfirmed: confirmedUserIdSet.has(member.userId),
      })),
    [confirmedUserIdSet, teamData]
  );
  const confirmedCount = teamMembers.filter((player) => player.isConfirmed).length;
  const isCaptain = teamData?.membership.is_captain ?? false;
  const isLastMember = (teamData?.members.length ?? 0) === 1;
  const teamMemberCount = teamMembers.length;
  const hasMinimumPlayers = teamMemberCount >= TOURNAMENT_ENTRY_PLAYER_TARGET;
  const hasMinimumConfirmedPlayers =
    confirmedCount >= TOURNAMENT_ENTRY_PLAYER_TARGET;
  const canCaptainEnter = isCaptain;
  const isEligibleToEnter =
    Boolean(activeTournament) &&
    hasMinimumPlayers &&
    hasMinimumConfirmedPlayers &&
    canCaptainEnter;
  const tournamentEntryStatus = hasEnteredTournament
    ? "Entered"
    : !activeTournament
    ? "No active tournament"
    : isEligibleToEnter
      ? "Eligible to enter"
      : hasMinimumPlayers && hasMinimumConfirmedPlayers && !canCaptainEnter
        ? "Captain action required"
        : "Not eligible";

  async function handleEnterTournament() {
    setIsEnteringTournament(true);
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

      if (!activeTournament || !teamData || !isEligibleToEnter) {
        throw new Error("This team is not eligible to enter the active tournament.");
      }

      await createTournamentTeamEntry({
        tournamentId: activeTournament.id,
        teamId: teamData.team.id,
        enteredBy: user.id,
      });

      setHasEnteredTournament(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not enter current tournament."
      );
    } finally {
      setIsEnteringTournament(false);
    }
  }

  async function handleLeaveTeam() {
    setIsMutatingTeam(true);
    setErrorMessage("");

    try {
      if (hasEnteredTournament) {
        throw new Error(
          "This team has already entered the active tournament, so its roster is locked."
        );
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      await leaveCurrentTeam(user.id);
      router.replace("/profile");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not leave team."
      );
      setIsMutatingTeam(false);
    }
  }

  async function handleDeleteTeam() {
    setIsMutatingTeam(true);
    setErrorMessage("");

    try {
      if (hasEnteredTournament) {
        throw new Error(
          "This team has already entered the active tournament, so its roster is locked."
        );
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      await deleteTeamIfLastCaptain(user.id);
      router.replace("/profile");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete team."
      );
      setIsMutatingTeam(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-6xl text-sm text-zinc-600">
          Loading team...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      {/* Team strip */}
      <div className="border-b border-zinc-300 bg-zinc-200 px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold">Моя команда</span>
            <span className="rounded border border-zinc-500 bg-zinc-300 px-2 py-0.5 text-xs font-medium">
              {isCaptain ? "Captain view" : "Режим участника"}
            </span>
          </div>
          <div className="text-sm text-zinc-600">Текущий сезон: Season 3</div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        {!teamData ? (
          <div className="max-w-3xl border border-zinc-300 bg-white p-5">
            <h1 className="mb-3 text-2xl font-semibold">Моя команда</h1>
            <p className="mb-5 text-sm text-zinc-600">
              You are not part of a team yet.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/create-team"
                className="rounded border border-zinc-400 bg-white px-4 py-2 text-sm font-medium"
              >
                Create Team
              </Link>
              <Link
                href="/join-team"
                className="rounded border border-zinc-400 bg-white px-4 py-2 text-sm font-medium"
              >
                Join Team
              </Link>
            </div>
          </div>
        ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="border border-zinc-300 bg-white p-5">
              <div className="mb-2 text-sm text-zinc-500">Название команды</div>
              <h1 className="mb-4 text-2xl font-semibold">{teamData.team.name}</h1>
              <div className="text-sm text-zinc-600">
                Капитан:{" "}
                <span className="font-medium text-zinc-900">
                  {teamData.captain?.nickname ?? "Captain"}
                </span>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {hasEnteredTournament ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled
                      className="rounded border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500"
                    >
                      Состав зафиксирован
                    </button>
                    <p className="text-sm text-zinc-600">
                      Эта команда уже участвует в активном турнире, поэтому
                      участники не могут самостоятельно покинуть её в данный
                      момент.
                    </p>
                  </div>
                ) : isCaptain && isLastMember ? (
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
                    {isMutatingTeam ? "Working..." : "Leave Team"}
                  </button>
                )}
              </div>
            </div>

            <section className="border border-zinc-300 bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-zinc-500">
                  Участники команды
                </h2>
                <div className="text-sm text-zinc-500">
                  {confirmedCount} / {TOURNAMENT_ENTRY_PLAYER_TARGET} подтверждено
                  для текущего турнира
                </div>
              </div>
              <div className="mb-4 text-sm text-zinc-500">
                {activeTournament?.name ?? "No active tournament"}
              </div>
              <div className="space-y-2">
                {teamMembers.map((player) => (
                  <div
                    key={player.userId}
                    className="flex flex-col gap-2 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{player.nickname}</span>
                      {player.isCaptain && (
                        <span className="text-sm text-zinc-500">Капитан</span>
                      )}
                    </div>
                    <span className="text-sm text-zinc-500">
                      Текущий турнир:{" "}
                      {player.isConfirmed ? "Подтверждено" : "Not confirmed"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-6">
            <section className="border border-zinc-300 bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                Статус заявки на турнир
              </h2>
              <div className="mb-3 text-xl font-semibold">
                {tournamentEntryStatus === "Entered"
                  ? "Заявлена"
                  : tournamentEntryStatus}
              </div>
              <p className="mb-5 text-sm text-zinc-600">
                {activeTournament?.name ?? "No active tournament"}
              </p>
              {hasEnteredTournament && (
                <p className="mb-5 text-sm text-zinc-600">
                  Заявка команды зафиксирована. Вступление, выход и другие
                  изменения состава недоступны после подачи заявки.
                </p>
              )}
              <div className="mb-5 space-y-2 text-sm text-zinc-700">
                <div>
                  Участники команды:{" "}
                  <span className="font-medium text-zinc-900">
                    {teamMemberCount} / {TOURNAMENT_ENTRY_PLAYER_TARGET}
                  </span>
                </div>
                <div>
                  Подтвержденные игроки:{" "}
                  <span className="font-medium text-zinc-900">
                    {confirmedCount} / {TOURNAMENT_ENTRY_PLAYER_TARGET}
                  </span>
                </div>
                <div>
                  Капитан может подать заявку:{" "}
                  <span className="font-medium text-zinc-900">
                    {canCaptainEnter ? "Yes" : "Нет"}
                  </span>
                </div>
              </div>

              {hasEnteredTournament ? (
                <button
                  type="button"
                  disabled
                  className="w-full rounded border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500"
                >
                  Заявлена на текущий турнир
                </button>
              ) : isEligibleToEnter ? (
                <button
                  type="button"
                  onClick={() => void handleEnterTournament()}
                  disabled={isEnteringTournament}
                  className="block w-full rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-center text-sm font-medium"
                >
                  {isEnteringTournament
                    ? "Entering..."
                    : "Enter Current Tournament"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full rounded border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500"
                >
                  Enter Current Tournament
                </button>
              )}
            </section>
          </aside>
        </div>
        )}
      </main>
    </div>
  );
}
