"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DoubleEliminationBracket,
  type MatchComponentProps,
  type MatchType,
} from "@g-loot/react-tournament-brackets";
import { SiteHeader } from "@/components/site-header";
import { TeamLogo } from "@/components/team-logo";
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
  if (roundLabel === "Group Stage") {
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

  function calculateGroupStandings(matchesToRank: TournamentMatch[]) {
    const groupMatches = matchesToRank.filter(
      (match) =>
        match.status === "finished" &&
        match.roundLabel === "Group Stage" &&
        match.teamAScore !== null &&
        match.teamBScore !== null
    );

    const standingsByTeam = new Map<
      string,
      {
        teamId: string;
        teamName: string;
        teamLogoUrl: string | null;
        wins: number;
        losses: number;
        draws: number;
        points: number;
      }
    >();

    const ensureTeam = (teamId: string, teamName: string, teamLogoUrl: string | null) => {
      const existing = standingsByTeam.get(teamId);

      if (existing) {
        return existing;
      }

      const nextTeam = {
        teamId,
        teamName,
        teamLogoUrl,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
      };

      standingsByTeam.set(teamId, nextTeam);
      return nextTeam;
    };

    for (const match of groupMatches) {
      const teamA = ensureTeam(match.teamAId, match.teamAName, match.teamALogoUrl);
      const teamB = ensureTeam(match.teamBId, match.teamBName, match.teamBLogoUrl);
      const scoreText = `${match.teamAScore} - ${match.teamBScore}`;
      const [teamAScoreText, teamBScoreText] = scoreText.split(" - ");
      const teamAScore = Number(teamAScoreText);
      const teamBScore = Number(teamBScoreText);

      if (Number.isNaN(teamAScore) || Number.isNaN(teamBScore)) {
        continue;
      }

      if (match.format === "BO2") {
        if (teamAScore === teamBScore) {
          teamA.draws += 1;
          teamB.draws += 1;
          teamA.points += 1;
          teamB.points += 1;
        } else if (teamAScore > teamBScore) {
          teamA.wins += 1;
          teamB.losses += 1;
          teamA.points += 3;
        } else {
          teamB.wins += 1;
          teamA.losses += 1;
          teamB.points += 3;
        }

        continue;
      }

      if (teamAScore > teamBScore) {
        teamA.wins += 1;
        teamB.losses += 1;
        teamA.points += 1;
      } else if (teamBScore > teamAScore) {
        teamB.wins += 1;
        teamA.losses += 1;
        teamB.points += 1;
      }
    }

    return Array.from(standingsByTeam.values()).sort((teamA, teamB) => {
      if (teamB.points !== teamA.points) {
        return teamB.points - teamA.points;
      }

      if (teamB.wins !== teamA.wins) {
        return teamB.wins - teamA.wins;
      }

      return teamA.teamName.localeCompare(teamB.teamName);
    });
  }

  const groupStandings = calculateGroupStandings(matches);
  const advancingCount = Math.max(
    0,
    enteredTeams.length - (activeTournament?.teams_eliminated_per_group ?? enteredTeams.length)
  );
  const suspendedTeamIds = new Set(
    enteredTeams.filter((team) => team.isSuspended).map((team) => team.id)
  );

  function buildDoubleEliminationMatches(): {
    upper: MatchType[];
    lower: MatchType[];
  } {
    const upperBracketRoundOneMatches = matches.filter(
      (match) => match.roundLabel === "Upper Bracket Round 1"
    );
    const upperBracketFinalMatch =
      matches.find((match) => match.roundLabel === "Upper Bracket Round 2") ?? null;
    const lowerBracketRoundOneMatch =
      matches.find((match) => match.roundLabel === "Lower Bracket Round 1") ?? null;
    const lowerBracketFinalMatch =
      matches.find((match) => match.roundLabel === "Lower Bracket Round 2") ?? null;
    const grandFinalMatch =
      matches.find((match) => match.roundLabel === "Grand Finals") ?? null;

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
            <div className="mt-2 text-sm font-bold text-white">Счет: {matchResult}</div>
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
        const {
          data: { user },
        } = await supabase.auth.getUser();
  
        const nextActiveTournament = await getActiveTournament();
  
        if (!nextActiveTournament) {
          setActiveTournament(null);
          setEnteredTeams([]);
          setMatches([]);
          return;
        }

        setActiveTournament(nextActiveTournament);

        if (user) {
          const { data: membership } = await supabase
            .from("team_members")
            .select("team_id")
            .eq("user_id", user.id)
            .maybeSingle();

          const membershipTeamId = (membership as { team_id: string } | null)?.team_id ?? null;

          if (membershipTeamId) {
            const { data: tournamentEntry } = await supabase
              .from("tournament_team_entries")
              .select("team_id")
              .eq("tournament_id", nextActiveTournament.id)
              .eq("team_id", membershipTeamId)
              .maybeSingle();

            setCurrentUserTeamId(
              (tournamentEntry as { team_id: string } | null)?.team_id ?? null
            );
          }
        }

        const nextEnteredTeams = await getEnteredTeamsForTournament(
          nextActiveTournament.id
        );
        setEnteredTeams(nextEnteredTeams);

        try {
          const nextMatches = await getTournamentMatchesForTournament(
            nextActiveTournament.id
          );
          setMatches(nextMatches);
        } catch {
          setMatches([]);
          setMatchesErrorMessage("Матчи сейчас недоступны.");
        }
      } catch (error) {
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
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {isLoading ? (
          <div className="border border-zinc-300 bg-white p-5 text-sm text-zinc-600 shadow-md">
            Загрузка турнира...
          </div>
        ) : errorMessage ? (
          <div className="border border-red-300 bg-white p-5 text-sm text-red-600 shadow-md">
            {errorMessage}
          </div>
        ) : !activeTournament ? (
          <section className="border border-zinc-300 bg-white p-5 shadow-md">
            <h1 className="mb-3 text-2xl font-semibold">Турнир</h1>
            <p className="text-sm text-zinc-600">Сейчас нет активного турнира.</p>
          </section>
        ) : (
          <div className="space-y-6">
            <section
              className={`relative mb-8 overflow-hidden border-[3px] border-[#061726] p-8 shadow-[6px_6px_0px_0px_#061726] ${
                activeTournament.banner_url ? "" : "bg-[#0B3A4A]"
              }`}
            >
              {activeTournament.banner_url && (
                <>
                  <Image
                    src={activeTournament.banner_url}
                    alt={`Баннер турнира ${activeTournament.name}`}
                    fill
                    className="z-0 object-cover"
                    sizes="(max-width: 768px) 100vw, 1200px"
                  />
                  <div className="absolute inset-0 z-0 bg-[#061726]/60" />
                </>
              )}
              <div className="relative z-10">
                <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#CD9C3E]">
                  Активный турнир
                </div>
                <h1 className="text-4xl font-extrabold uppercase tracking-tight text-[#CD9C3E] md:text-5xl">
                  {activeTournament.name}
                </h1>
              </div>
            </section>

            <nav className="mb-8 flex flex-wrap gap-3">
              {TOURNAMENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`cursor-pointer select-none border-[4px] px-6 py-3 text-sm uppercase tracking-wider shadow-[6px_6px_0px_0px_#061726] transition-colors md:text-base ${
                    activeTab === tab.id
                      ? "border-[#061726] bg-white font-extrabold text-[#0B3A4A]"
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
                        className="group relative flex flex-col overflow-hidden border-[4px] border-[#061726] bg-white shadow-[6px_6px_0px_0px_#CD9C3E] transition-all hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_#CD9C3E]"
                      >
                        <div className="flex items-center gap-3 border-b-[4px] border-[#061726] bg-khawater-blue p-4 text-xl font-extrabold uppercase tracking-widest text-[#FFFFFF]">
                          <TeamLogo teamName={team.name} logoUrl={team.logoUrl} />
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{team.name}</span>
                            {team.isSuspended ? (
                              <span className="font-bold text-red-500">(Suspended)</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex-1 p-4">
                          <div className="text-sm leading-relaxed font-medium text-arcade-black">
                            <span className="mb-1 block text-xs font-bold uppercase text-arcade-muted">
                              Состав:
                            </span>{" "}
                            {team.roster?.length
                              ? team.roster.join(", ")
                              : "Игроков пока нет"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === "matches" && (
              <section className="w-full border-[3px] border-[#061726] bg-[#061726]/85 p-6 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md md:p-8">
                <h2 className="mb-8 text-4xl font-black uppercase text-[#CD9C3E] md:text-5xl">
                  Расписание группы
                </h2>

                {matchesErrorMessage ? (
                  <p className="text-sm text-gray-300">{matchesErrorMessage}</p>
                ) : matches.length === 0 ? (
                  <p className="text-sm text-gray-300">Матчи пока не опубликованы.</p>
                ) : (
                  <div>
                    {matches.map((match) => renderMatchCard(match))}
                  </div>
                )}
              </section>
            )}

            {activeTab === "group" && (
              <section className="w-full overflow-x-auto border-[3px] border-[#061726] bg-[#061726]/85 p-6 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md md:p-8">
                <h2 className="mb-8 text-4xl font-black uppercase text-[#CD9C3E] md:text-5xl">
                  Таблица группового этапа
                </h2>

                {matchesErrorMessage ? (
                  <p className="text-sm text-gray-300">{matchesErrorMessage}</p>
                ) : groupStandings.length === 0 ? (
                  <p className="text-sm text-gray-300">
                    Таблица появится после завершения матчей группового этапа.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse text-left">
                      <thead className="border-b-[3px] border-[#061726] text-[#CD9C3E]">
                        <tr>
                          <th className="px-4 pb-4 text-sm font-bold uppercase tracking-wider md:text-base">
                            Место
                          </th>
                          <th className="px-4 pb-4 text-sm font-bold uppercase tracking-wider md:text-base">
                            Команда
                          </th>
                          <th className="px-4 pb-4 text-sm font-bold uppercase tracking-wider md:text-base">
                            В
                          </th>
                          <th className="px-4 pb-4 text-sm font-bold uppercase tracking-wider md:text-base">
                            П
                          </th>
                          <th className="px-4 pb-4 text-sm font-bold uppercase tracking-wider md:text-base">
                            Н
                          </th>
                          <th className="px-4 pb-4 text-sm font-bold uppercase tracking-wider md:text-base">
                            Очки
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupStandings.map((team, index) => (
                          <tr
                            key={team.teamId}
                            className="border-b-2 border-[#061726] bg-[#0B3A4A] transition-colors hover:bg-[#0d4a5e]"
                          >
                            <td
                              className={`p-4 text-base font-medium md:text-lg ${
                                index === 0 ? "font-black text-[#CD9C3E]" : "text-white"
                              }`}
                            >
                              {index + 1}
                            </td>
                            <td className="p-4 text-base font-medium text-white md:text-lg">
                              <div className="flex items-center gap-4">
                                <TeamLogo
                                  teamName={team.teamName}
                                  logoUrl={team.teamLogoUrl}
                                  sizeClassName="aspect-square h-10 w-10 md:h-12 md:w-12"
                                  textClassName="text-lg md:text-xl"
                                />
                                <span>{team.teamName}</span>
                              </div>
                            </td>
                            <td className="p-4 text-base font-medium text-white md:text-lg">
                              {team.wins}
                            </td>
                            <td className="p-4 text-base font-medium text-white md:text-lg">
                              {team.losses}
                            </td>
                            <td className="p-4 text-base font-medium text-white md:text-lg">
                              {team.draws}
                            </td>
                            <td className="p-4 text-base font-medium text-white md:text-lg">
                              {team.points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activeTab === "playoffs" && (
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Сетка плей-офф
                </h2>

                {advancingCount !== 4 ? (
                  <p className="text-sm text-zinc-600">
                    A 4-team double elimination bracket is available once four teams
                    advance from the group stage.
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