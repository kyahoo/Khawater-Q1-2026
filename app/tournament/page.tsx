"use client";

import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DoubleEliminationBracket,
  type MatchComponentProps,
  type MatchType,
} from "@g-loot/react-tournament-brackets";
import { GroupStageStandingsTable } from "@/components/group-stage-standings-table";
import { TournamentMatchTechnicalBadges } from "@/components/tournament-match-technical-badges";
import { PlayerMedals } from "@/components/player-medals";
import { TeamLogo } from "@/components/team-logo";
import { VerifiedMMRBadge } from "@/components/verified-mmr-badge";
import {
  getPlayoffBracketSlot,
  GROUP_STAGE_ROUND_LABEL,
  isPlayoffRoundLabel,
  type PlayoffBracketSlot,
} from "@/lib/playoff-bracket";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getActiveTournament,
  getEnteredTeamsForTournament,
  type EnteredTeam,
  getTournamentMatchesForTournament,
  type TournamentMatch,
  type Tournament,
} from "@/lib/supabase/tournaments";

const TOURNAMENT_TABS = [
  { id: "teams", label: "Заявленные команды" },
  { id: "matches", label: "Расписание и результаты" },
  { id: "group", label: "Таблица группового этапа" },
  { id: "playoffs", label: "Сетка плей-офф" },
] as const;

type TournamentTabId = (typeof TOURNAMENT_TABS)[number]["id"];
type BracketParticipant = {
  id: string;
  name: string;
  resultText: string | null;
  isWinner?: true;
  status: null;
  isSuspended?: boolean;
};

type PlayoffMatchBuckets = Record<PlayoffBracketSlot, TournamentMatch[]>;

function createEmptyPlayoffMatchBuckets(): PlayoffMatchBuckets {
  return {
    upperRoundOne: [],
    upperFinal: [],
    lowerRoundOne: [],
    lowerFinal: [],
    grandFinal: [],
  };
}

function TournamentSectionSkeleton({
  title,
  rows = 3,
}: {
  title: string;
  rows?: number;
}) {
  return (
    <section className="w-full border-[3px] border-[#061726] bg-[#061726]/85 p-6 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md md:p-8">
      <h2 className="mb-8 text-4xl font-black uppercase text-[#CD9C3E] md:text-5xl">
        {title}
      </h2>
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={`${title}-skeleton-${index}`}
            className="animate-pulse border-[3px] border-[#CD9C3E] bg-[#0B3A4A] p-5 shadow-[4px_4px_0px_0px_#061726]"
          >
            <div className="h-5 w-40 border-2 border-[#061726] bg-[#145268]" />
            <div className="mt-4 h-4 w-full border-2 border-[#061726] bg-[#145268]" />
            <div className="mt-3 h-4 w-2/3 border-2 border-[#061726] bg-[#145268]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function TournamentMatchesSection({
  isLoading,
  matchesErrorMessage,
  matches,
  renderMatchCard,
}: {
  isLoading: boolean;
  matchesErrorMessage: string;
  matches: TournamentMatch[];
  renderMatchCard: (match: TournamentMatch) => React.ReactNode;
}) {
  if (isLoading) {
    return <TournamentSectionSkeleton title="Расписание группы" rows={4} />;
  }

  return (
    <section className="w-full border-[3px] border-[#061726] bg-[#061726]/85 p-6 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md md:p-8">
      <h2 className="mb-8 text-4xl font-black uppercase text-[#CD9C3E] md:text-5xl">
        Расписание группы
      </h2>

      {matchesErrorMessage ? (
        <p className="text-sm text-gray-300">{matchesErrorMessage}</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-gray-300">Матчи пока не опубликованы.</p>
      ) : (
        <div>{matches.map((match) => renderMatchCard(match))}</div>
      )}
    </section>
  );
}

function formatAlmatyDateTime(
  dateInput: string,
  options: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    ...options,
  }).format(new Date(dateInput));
}

function formatRoundLabel(roundLabel: string) {
  if (roundLabel === GROUP_STAGE_ROUND_LABEL) {
    return "Групповой этап";
  }

  return roundLabel;
}

function formatAlmatyMatchDate(dateInput: string) {
  return formatAlmatyDateTime(dateInput, {
    day: "numeric",
    month: "long",
  });
}

function formatAlmatyMatchTime(dateInput: string) {
  return formatAlmatyDateTime(dateInput, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CustomMatchCard({
  match,
  topParty,
  bottomParty,
  computedStyles,
}: MatchComponentProps) {
  const topParticipant = topParty as BracketParticipant | undefined;
  const bottomParticipant = bottomParty as BracketParticipant | undefined;
  const width = computedStyles?.width ?? 300;
  const height = computedStyles?.boxHeight ?? 110;
  const titleY = 16;
  const dateY = 30;
  const headerHeight = 40;
  const bodyTop = headerHeight;
  const middleY = bodyTop + (height - bodyTop) / 2;
  const topTextY = bodyTop + (middleY - bodyTop) / 2 + 5;
  const bottomTextY = middleY + (height - middleY) / 2 + 5;
  const startTime = typeof match.startTime === "string" && match.startTime
    ? match.startTime
    : "TBD Date";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect
        x="1"
        y="1"
        width={width - 2}
        height={height - 2}
        rx="6"
        fill="#fafafa"
        stroke="#e4e4e7"
      />
      <line
        x1="1"
        y1={headerHeight}
        x2={width - 1}
        y2={headerHeight}
        stroke="#e4e4e7"
      />
      <line
        x1="1"
        y1={middleY}
        x2={width - 1}
        y2={middleY}
        stroke="#e4e4e7"
      />
      <text x="12" y={titleY} fill="#71717a" fontSize="12">
        {match.name ?? match.tournamentRoundText ?? "Match"}
      </text>
      <text x="12" y={dateY} fill="#71717a" fontSize="11">
        {startTime}
      </text>
      <text x="12" y={topTextY} fill="#18181b" fontSize="14">
        <tspan
          fill={topParticipant?.isSuspended ? "#ef4444" : "#18181b"}
          textDecoration={topParticipant?.isSuspended ? "line-through" : undefined}
        >
          {topParticipant?.name ?? "TBD"}
        </tspan>
      </text>
      <text x={width - 12} y={topTextY} fill="#71717a" fontSize="12" textAnchor="end">
        {topParticipant?.resultText ?? ""}
      </text>
      <text x="12" y={bottomTextY} fill="#18181b" fontSize="14">
        <tspan
          fill={bottomParticipant?.isSuspended ? "#ef4444" : "#18181b"}
          textDecoration={bottomParticipant?.isSuspended ? "line-through" : undefined}
        >
          {bottomParticipant?.name ?? "TBD"}
        </tspan>
      </text>
      <text
        x={width - 12}
        y={bottomTextY}
        fill="#71717a"
        fontSize="12"
        textAnchor="end"
      >
        {bottomParticipant?.resultText ?? ""}
      </text>
    </svg>
  );
}

export default function TournamentPage() {
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [enteredTeams, setEnteredTeams] = useState<EnteredTeam[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [currentUserTeamId, setCurrentUserTeamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [matchesErrorMessage, setMatchesErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TournamentTabId>("teams");

  const suspendedTeamIds = new Set(
    enteredTeams.filter((team) => team.isSuspended).map((team) => team.id)
  );
  const playoffMatches = matches.filter((match) => isPlayoffRoundLabel(match.roundLabel));

  function buildDoubleEliminationMatches(): {
    upper: MatchType[];
    lower: MatchType[];
  } {
    const playoffMatchesBySlot = playoffMatches.reduce<PlayoffMatchBuckets>(
      (buckets, match) => {
        const slot = getPlayoffBracketSlot(match.roundLabel);

        if (!slot) {
          return buckets;
        }

        buckets[slot].push(match);
        return buckets;
      },
      createEmptyPlayoffMatchBuckets()
    );
    const upperBracketRoundOneMatches = playoffMatchesBySlot.upperRoundOne;
    const upperBracketFinalMatch = playoffMatchesBySlot.upperFinal[0] ?? null;
    const lowerBracketRoundOneMatch = playoffMatchesBySlot.lowerRoundOne[0] ?? null;
    const lowerBracketFinalMatch = playoffMatchesBySlot.lowerFinal[0] ?? null;
    const grandFinalMatch = playoffMatchesBySlot.grandFinal[0] ?? null;

    const createParticipant = (
      id: string,
      name: string,
      resultText: string | null = null,
      isWinner?: true,
      isSuspended?: boolean
    ) => ({
      id,
      name,
      resultText,
      isWinner,
      status: null,
      isSuspended,
    });

    const createTbdParticipants = (prefix: string) => [
      createParticipant(`${prefix}-top`, "TBD"),
      createParticipant(`${prefix}-bottom`, "TBD"),
    ];

    const toBracketState = (match: TournamentMatch | null) =>
      match?.status === "finished" ? "SCORE_DONE" : "SCHEDULED";

    const formatMatchStartTime = (scheduledAt: string | null) => {
      if (!scheduledAt) {
        return "";
      }

      return formatAlmatyDateTime(scheduledAt, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const createParticipantsFromMatch = (
      match: TournamentMatch | null,
      fallbackPrefix: string
    ) => {
      if (!match) {
        return createTbdParticipants(fallbackPrefix);
      }

      const teamAScore = match.teamAScore;
      const teamBScore = match.teamBScore;
      const teamAWon =
        teamAScore !== null && teamBScore !== null && teamAScore > teamBScore;
      const teamBWon =
        teamAScore !== null && teamBScore !== null && teamBScore > teamAScore;

      return [
        createParticipant(
          match.teamAId,
          match.teamAName,
          teamAScore === null ? null : String(teamAScore),
          teamAWon ? true : undefined,
          suspendedTeamIds.has(match.teamAId)
        ),
        createParticipant(
          match.teamBId,
          match.teamBName,
          teamBScore === null ? null : String(teamBScore),
          teamBWon ? true : undefined,
          suspendedTeamIds.has(match.teamBId)
        ),
      ];
    };

    return {
      upper: [
        {
          id: "upper-semifinal-1",
          name: "Upper Semifinal 1",
          nextMatchId: "upper-final",
          nextLooserMatchId: "lower-round-1",
          tournamentRoundText: "UB 1",
          startTime: formatMatchStartTime(
            upperBracketRoundOneMatches[0]?.scheduledAt ?? null
          ),
          state: toBracketState(upperBracketRoundOneMatches[0] ?? null),
          participants: createParticipantsFromMatch(
            upperBracketRoundOneMatches[0] ?? null,
            "upper-semifinal-1"
          ),
        },
        {
          id: "upper-semifinal-2",
          name: "Upper Semifinal 2",
          nextMatchId: "upper-final",
          nextLooserMatchId: "lower-round-1",
          tournamentRoundText: "UB 1",
          startTime: formatMatchStartTime(
            upperBracketRoundOneMatches[1]?.scheduledAt ?? null
          ),
          state: toBracketState(upperBracketRoundOneMatches[1] ?? null),
          participants: createParticipantsFromMatch(
            upperBracketRoundOneMatches[1] ?? null,
            "upper-semifinal-2"
          ),
        },
        {
          id: "upper-final",
          name: "Upper Final",
          nextMatchId: "grand-final",
          nextLooserMatchId: "lower-final",
          tournamentRoundText: "UB 2",
          startTime: formatMatchStartTime(upperBracketFinalMatch?.scheduledAt ?? null),
          state: toBracketState(upperBracketFinalMatch),
          participants: createParticipantsFromMatch(upperBracketFinalMatch, "upper-final"),
        },
        {
          id: "grand-final",
          name: "Grand Final",
          nextMatchId: null,
          tournamentRoundText: "GF",
          startTime: formatMatchStartTime(grandFinalMatch?.scheduledAt ?? null),
          state: toBracketState(grandFinalMatch),
          participants: createParticipantsFromMatch(grandFinalMatch, "grand-final"),
        },
      ],
      lower: [
        {
          id: "lower-round-1",
          name: "Lower Round 1",
          nextMatchId: "lower-final",
          tournamentRoundText: "LB 1",
          startTime: formatMatchStartTime(lowerBracketRoundOneMatch?.scheduledAt ?? null),
          state: toBracketState(lowerBracketRoundOneMatch),
          participants: createParticipantsFromMatch(
            lowerBracketRoundOneMatch,
            "lower-round-1"
          ),
        },
        {
          id: "lower-final",
          name: "Lower Final",
          nextMatchId: "grand-final",
          tournamentRoundText: "LB 2",
          startTime: formatMatchStartTime(lowerBracketFinalMatch?.scheduledAt ?? null),
          state: toBracketState(lowerBracketFinalMatch),
          participants: createParticipantsFromMatch(
            lowerBracketFinalMatch,
            "lower-final"
          ),
        },
      ],
    };
  }

  const mappedMatches = buildDoubleEliminationMatches();

  function renderMatchCard(match: TournamentMatch) {
    const isUserMatch =
      currentUserTeamId !== null &&
      (currentUserTeamId === match.teamAId || currentUserTeamId === match.teamBId);
    const formattedSchedule = match.scheduledAt
      ? `${formatAlmatyMatchDate(match.scheduledAt)} · ${formatAlmatyMatchTime(match.scheduledAt)}`
      : "Время будет объявлено позже";
    const matchResult =
      match.status === "finished" &&
      match.teamAScore !== null &&
      match.teamBScore !== null
        ? `${match.teamAScore} : ${match.teamBScore}`
        : null;

    const content = (
      <div className="mb-4 flex w-full flex-col items-start border-2 border-[#061726] bg-[#0B3A4A] p-4 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-[#CD9C3E] md:text-base">
            {formatRoundLabel(match.roundLabel)} - {match.format}
          </div>
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
            <div className="flex w-full min-w-0 items-center justify-start gap-4">
              <TeamLogo
                teamName={match.teamAName}
                logoUrl={match.teamALogoUrl}
                sizeClassName="aspect-square h-10 w-10 md:h-20 md:w-20"
                textClassName="text-base md:text-3xl"
              />
              <span className="min-w-0 truncate text-base font-bold text-white md:text-3xl">
                {match.teamAName}
              </span>
            </div>
            <div className="mx-2 flex items-center justify-center text-center text-xl font-black text-[#CD9C3E] md:mx-4 md:text-4xl">
              {match.teamAScore !== null && match.teamBScore !== null
                ? match.teamAScore > match.teamBScore
                  ? ">"
                  : match.teamBScore > match.teamAScore
                    ? "<"
                    : "VS"
                : "VS"}
            </div>
            <div className="flex w-full min-w-0 items-center justify-end gap-4 text-right">
              <span className="min-w-0 truncate text-base font-bold text-white md:text-3xl">
                {match.teamBName}
              </span>
              <TeamLogo
                teamName={match.teamBName}
                logoUrl={match.teamBLogoUrl}
                sizeClassName="aspect-square h-10 w-10 md:h-20 md:w-20"
                textClassName="text-base md:text-3xl"
              />
            </div>
          </div>
          {matchResult && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-sm font-bold text-white">Счет: {matchResult}</div>
              <TournamentMatchTechnicalBadges match={match} variant="public" />
            </div>
          )}
          {!matchResult && match.isForfeit && (
            <TournamentMatchTechnicalBadges
              match={match}
              variant="public"
              className="mt-2"
            />
          )}
        </div>
        <div className="mt-2 text-base font-medium text-gray-300 md:mt-0 md:pl-6 md:text-lg">
          {formattedSchedule}
        </div>
      </div>
    );

    if (isUserMatch) {
      return (
        <Link
          key={match.id}
          href={`/matches/${match.id}`}
          className="block cursor-pointer transition-transform hover:-translate-y-1"
        >
          {content}
        </Link>
      );
    }

    return (
      <div key={match.id}>
        {content}
      </div>
    );
  }

  useEffect(() => {
    const loadTournamentPage = async () => {
      try {
        setErrorMessage("");
        setMatchesErrorMessage("");
        setCurrentUserTeamId(null);

        const supabase = getSupabaseBrowserClient();
        let currentUserId: string | null = null;

        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          currentUserId = session?.user?.id ?? null;
        } catch (authError) {
          console.error("Tournament session load failed:", authError);
        }

        let nextActiveTournament: Tournament | null = null;

        try {
          nextActiveTournament = await getActiveTournament();
        } catch (error) {
          console.error("Tournament Fetch Error:", error);
          throw error;
        }

        let membership: { team_id: string } | null = null;

        if (currentUserId && nextActiveTournament) {
          try {
            const { data: membershipData, error: membershipError } = await supabase
              .from("team_members")
              .select("team_id")
              .eq("user_id", currentUserId)
              .maybeSingle();

            if (membershipError) {
              console.error("Tournament membership load failed:", membershipError);
            } else {
              membership = membershipData as { team_id: string } | null;
            }
          } catch (membershipLoadError) {
            console.error("Tournament membership load failed:", membershipLoadError);
          }
        }

        if (!nextActiveTournament) {
          setActiveTournament(null);
          setEnteredTeams([]);
          setMatches([]);
          return;
        }

        setActiveTournament(nextActiveTournament);
        const membershipTeamId = membership?.team_id ?? null;

        const [enteredTeamsResult, matchesResult, tournamentEntryResult] = await Promise.all([
          getEnteredTeamsForTournament(nextActiveTournament.id),
          getTournamentMatchesForTournament(nextActiveTournament.id).catch(() => null),
          membershipTeamId
            ? supabase
                .from("tournament_team_entries")
                .select("team_id")
                .eq("tournament_id", nextActiveTournament.id)
                .eq("team_id", membershipTeamId)
                .eq("is_suspended", false)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        setEnteredTeams(enteredTeamsResult);
        setCurrentUserTeamId(
          ((tournamentEntryResult.data as { team_id: string } | null)?.team_id ?? null)
        );

        if (!matchesResult) {
          setMatches([]);
          setMatchesErrorMessage("Матчи сейчас недоступны.");
        } else {
          setMatches(matchesResult);
        }
      } catch (error) {
        console.error("Tournament Fetch Error:", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить страницу турнира."
        );
      } finally {
        setIsLoading(false);
      }
    };
  
    void loadTournamentPage();
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-zinc-900">
      <main className="mx-auto max-w-6xl px-6 py-8">
        {errorMessage ? (
          <div className="border border-red-300 bg-white p-5 text-sm text-red-600 shadow-md">
            {errorMessage}
          </div>
        ) : !isLoading && !activeTournament ? (
          <section className="border border-zinc-300 bg-white p-5 shadow-md">
            <h1 className="mb-3 text-2xl font-semibold">Турнир</h1>
            <p className="text-sm text-zinc-600">Сейчас нет активного турнира.</p>
          </section>
        ) : (
          <div className="space-y-6">
            <details className="mb-8">
              <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
                <div
                  className={`relative overflow-hidden border-[3px] border-[#061726] p-8 shadow-[6px_6px_0px_0px_#061726] ${
                    activeTournament?.banner_url
                      ? "bg-[#0B3A4A]"
                      : "bg-slate-800/80 animate-pulse"
                  }`}
                >
                  {activeTournament?.banner_url ? (
                    <>
                    <Image
                      src={activeTournament.banner_url}
                      alt={`Баннер турнира ${activeTournament.name ?? ""}`}
                      fill
                      unoptimized={true}
                      priority={true}
                      className="absolute inset-0 z-0 h-full w-full object-cover object-right"
                    />
                    <div className="absolute inset-0 z-0 bg-gradient-to-r from-gray-900 via-gray-900/70 to-transparent" />
                    </>
                  ) : null}
                  <div className="relative z-10 max-w-3xl">
                    <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#CD9C3E]">
                      Активный турнир
                    </div>
                    <h1 className="text-4xl font-extrabold uppercase tracking-tight text-[#CD9C3E] md:text-5xl">
                      {activeTournament?.name ?? "ЗАГРУЗКА ТУРНИРА"}
                    </h1>
                  </div>
                </div>
              </summary>
              <div className="bg-gray-900 border border-t-0 border-gray-600 p-4 flex justify-around text-center items-center">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">
                    Призовой фонд
                  </span>
                  <span className="text-xl font-bold text-yellow-500">
                    {activeTournament?.prize_pool || "TBD"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">
                    Даты проведения
                  </span>
                  <span className="text-xl font-bold text-white">
                    {activeTournament?.dates || "TBD"}
                  </span>
                </div>
              </div>
            </details>

            <nav className="mb-8 flex flex-wrap gap-3">
              {TOURNAMENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`cursor-pointer select-none border-[4px] px-6 py-3 text-sm uppercase tracking-wider shadow-[6px_6px_0px_0px_#061726] transition-colors md:text-base ${
                    activeTab === tab.id
                      ? "border-[#061726] bg-[#F4EED7] font-extrabold text-[#061726]"
                      : "border-[#061726] bg-[#0B3A4A] font-bold text-white hover:bg-[#0f4f66]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {activeTab === "teams" && (
              <section className="border-[4px] border-[#061726] bg-[#061726]/85 p-5 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md">
                <h2 className="mb-6 text-2xl font-extrabold uppercase tracking-tight text-[#CD9C3E]">
                  Заявленные команды
                </h2>

                {enteredTeams.length === 0 ? (
                  <p className="text-sm text-white/75">
                    Пока ни одна команда не заявилась на этот турнир.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-6 mt-6 md:grid-cols-2 lg:grid-cols-3">
                    {enteredTeams.map((team) => (
                      <div
                        key={team.id}
                        className="group relative flex flex-col overflow-visible border-[4px] border-[#061726] shadow-[6px_6px_0px_0px_#CD9C3E] transition-all hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_#CD9C3E]"
                      >
                        <div className="flex items-center gap-3 border-b-[4px] border-[#061726] bg-[#F4EED7] p-4 text-xl font-extrabold uppercase tracking-widest text-[#061726]">
                          <TeamLogo teamName={team.name} logoUrl={team.logoUrl} />
                          <span>{team.name}</span>
                        </div>
                        <div className="flex-1">
                          <div className="h-full bg-white/10 px-3 backdrop-blur-md">
                            <span className="block py-3 text-xs font-bold uppercase text-white/90">
                              Состав:
                            </span>
                            {team.roster?.length ? (
                              team.roster.map((player) => {
                                return (
                                  <div
                                    key={player.id}
                                    className="flex items-center justify-between gap-3 border-b border-white/15 py-1 text-sm last:border-0"
                                  >
                                    <span className="min-w-0 flex-1 font-bold text-gray-100">
                                      {player.nickname}
                                    </span>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {player.mmr !== null ? (
                                        <VerifiedMMRBadge
                                          mmr={player.mmr}
                                          isVerified={player.isMMRVerified}
                                        />
                                      ) : null}
                                      <PlayerMedals medals={player.medals} />
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="py-2 text-sm text-white/80">
                                Игроков пока нет
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === "matches" && (
              <Suspense fallback={<TournamentSectionSkeleton title="Расписание группы" rows={4} />}>
                <TournamentMatchesSection
                  isLoading={isLoading}
                  matchesErrorMessage={matchesErrorMessage}
                  matches={matches}
                  renderMatchCard={renderMatchCard}
                />
              </Suspense>
            )}

            {activeTab === "group" && (
              <Suspense
                fallback={<TournamentSectionSkeleton title="Таблица группового этапа" rows={5} />}
              >
                <GroupStageStandingsTable
                  isLoading={isLoading}
                  errorMessage={matchesErrorMessage}
                  matches={matches}
                  variant="public"
                />
              </Suspense>
            )}

            {activeTab === "playoffs" && (
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Сетка плей-офф
                </h2>

                {playoffMatches.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    Playoff matches have not been published yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <DoubleEliminationBracket
                      matches={mappedMatches}
                      matchComponent={CustomMatchCard}
                    />
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
