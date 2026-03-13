"use client";

import Image from "next/image";
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
  const totalMmr = useMemo(
    () => teamMembers.reduce((sum, member) => sum + (member.mmr ?? 0), 0),
    [teamMembers]
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
  const cardClassName =
    "rounded-none border-[3px] border-[#061726] bg-[#0B3A4A]/90 p-6 text-white shadow-[6px_6px_0px_0px_#061726] backdrop-blur-sm md:p-8";
  const cardHeadingClassName =
    "mb-4 text-lg font-black uppercase text-[#CD9C3E] md:text-xl";
  const bodyTextClassName = "text-sm text-gray-300 md:text-base";
  const disabledButtonClassName =
    "mt-4 w-full cursor-not-allowed border-[3px] border-[#061726] bg-gray-600 px-6 py-3 font-extrabold uppercase text-gray-300 opacity-80 shadow-[4px_4px_0px_0px_#061726]";

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
      <div className="min-h-screen bg-transparent px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-6xl text-sm text-zinc-600">
          Загрузка команды...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-zinc-900">
      <main className="mx-auto max-w-6xl px-6 py-8">
        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        {!teamData ? (
          <div className={`max-w-3xl ${cardClassName}`}>
            <h1 className="mb-4 text-lg font-black uppercase text-[#CD9C3E] md:text-xl">
              Моя команда
            </h1>
            <p className={`mb-5 ${bodyTextClassName}`}>
              Вы пока не состоите ни в одной команде.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/create-team"
                className="w-fit border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
              >
                Создать команду
              </Link>
              <Link
                href="/join-team"
                className="w-fit border-[3px] border-[#061726] bg-white px-6 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
              >
                Вступить в команду
              </Link>
            </div>
          </div>
        ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className={cardClassName}>
              <div className={cardHeadingClassName}>Название команды</div>
              <div className="flex items-center gap-4 mb-2">
                {teamData.team.logo_url ? (
                  <Image
                    src={teamData.team.logo_url}
                    alt={`Логотип команды ${teamData.team.name}`}
                    width={48}
                    height={48}
                    className="h-12 w-12 border-none object-cover outline-none"
                  />
                ) : null}
                <h1 className="text-3xl font-black text-white md:text-4xl">
                  {teamData.team.name}
                </h1>
              </div>
              <div className={bodyTextClassName}>
                Капитан:{" "}
                <span className="font-medium text-white">
                  {teamData.captain?.nickname ?? "Капитан"}
                </span>
              </div>
              <div className="mt-2 inline-block border border-yellow-600 px-2 py-1 text-sm font-bold tracking-wider text-yellow-500">
                TOTAL MMR: {totalMmr}
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {hasEnteredTournament ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled
                      className={disabledButtonClassName}
                    >
                      Состав зафиксирован
                    </button>
                    <p className={bodyTextClassName}>
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
                    className="w-fit border-[3px] border-[#061726] bg-red-600 px-6 py-3 text-sm font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                  >
                    {isMutatingTeam ? "Обработка..." : "Удалить команду"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleLeaveTeam()}
                    disabled={isMutatingTeam}
                    className="w-fit border-[3px] border-[#061726] bg-red-600 px-6 py-3 text-sm font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                  >
                    {isMutatingTeam ? "Обработка..." : "Покинуть команду"}
                  </button>
                )}
              </div>
            </div>

            <section className={cardClassName}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className={cardHeadingClassName}>
                  Участники команды
                </h2>
                <div className={bodyTextClassName}>
                  {confirmedCount} / {TOURNAMENT_ENTRY_PLAYER_TARGET} подтверждено
                  для текущего турнира
                </div>
              </div>
              <div className={`mb-4 ${bodyTextClassName}`}>
                {activeTournament?.name ?? "Нет активного турнира"}
              </div>
              <div className="space-y-2">
                {teamMembers.map((player) => (
                  <div
                    key={player.userId}
                    className="flex items-center justify-between border-b-2 border-[#061726] bg-[#061726]/50 p-3 last:border-b-0 md:p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-white">
                          {player.nickname}
                        </span>
                        {player.isCaptain && (
                          <span className="border-2 border-[#CD9C3E] px-2 py-1 text-xs font-bold uppercase text-[#CD9C3E]">
                            Капитан
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-400">
                        Текущий турнир:{" "}
                        {player.isConfirmed ? "Подтверждено" : "Не подтверждено"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-6">
            <section className={cardClassName}>
              <h2 className={cardHeadingClassName}>
                Статус заявки на турнир
              </h2>
              <div className="mb-3 text-2xl font-black uppercase text-[#10B981]">
                {tournamentEntryStatus === "Entered"
                  ? "Заявлена"
                  : tournamentEntryStatus === "No active tournament"
                    ? "Нет активного турнира"
                    : tournamentEntryStatus === "Eligible to enter"
                      ? "Можно подать заявку"
                      : tournamentEntryStatus === "Captain action required"
                        ? "Требуется капитан"
                        : "Не готова"}
              </div>
              <p className={`mb-5 ${bodyTextClassName}`}>
                {activeTournament?.name ?? "Нет активного турнира"}
              </p>
              {hasEnteredTournament && (
                <p className={`mb-5 ${bodyTextClassName}`}>
                  Заявка команды зафиксирована. Вступление, выход и другие
                  изменения состава недоступны после подачи заявки.
                </p>
              )}
              <div className={`mb-5 space-y-2 ${bodyTextClassName}`}>
                <div>
                  Участники команды:{" "}
                  <span className="font-medium text-white">
                    {teamMemberCount} / {TOURNAMENT_ENTRY_PLAYER_TARGET}
                  </span>
                </div>
                <div>
                  Подтвержденные игроки:{" "}
                  <span className="font-medium text-white">
                    {confirmedCount} / {TOURNAMENT_ENTRY_PLAYER_TARGET}
                  </span>
                </div>
                <div>
                  Капитан может подать заявку:{" "}
                  <span className="font-medium text-white">
                    {canCaptainEnter ? "Да" : "Нет"}
                  </span>
                </div>
              </div>

              {hasEnteredTournament ? (
                <button
                  type="button"
                  disabled
                  className={disabledButtonClassName}
                >
                  Заявлена на текущий турнир
                </button>
              ) : isEligibleToEnter ? (
                <button
                  type="button"
                  onClick={() => void handleEnterTournament()}
                  disabled={isEnteringTournament}
                  className="mt-4 block w-full border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-3 text-center text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                >
                  {isEnteringTournament
                    ? "Подача..."
                    : "Подать заявку на текущий турнир"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className={disabledButtonClassName}
                >
                  Подать заявку на текущий турнир
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
