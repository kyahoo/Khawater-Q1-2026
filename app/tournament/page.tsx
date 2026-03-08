"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DoubleEliminationBracket,
  type MatchComponentProps,
  type MatchType,
} from "@g-loot/react-tournament-brackets";
import { SiteHeader } from "@/components/site-header";
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
        wins: number;
        losses: number;
        draws: number;
        points: number;
      }
    >();

    const ensureTeam = (teamId: string, teamName: string) => {
      const existing = standingsByTeam.get(teamId);

      if (existing) {
        return existing;
      }

      const nextTeam = {
        teamId,
        teamName,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
      };

      standingsByTeam.set(teamId, nextTeam);
      return nextTeam;
    };

    for (const match of groupMatches) {
      const teamA = ensureTeam(match.teamAId, match.teamAName);
      const teamB = ensureTeam(match.teamBId, match.teamBName);
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

    const content = (
      <>
        <div className="text-sm text-zinc-500">
          {formatRoundLabel(match.roundLabel)} &middot; {match.format}
        </div>
        <div className="mt-1 font-medium">
          {match.teamAName}{" "}
          {match.status === "finished" &&
          match.teamAScore !== null &&
          match.teamBScore !== null
            ? match.teamAScore > match.teamBScore
              ? ">"
              : match.teamAScore < match.teamBScore
                ? "<"
                : "="
            : "vs"}{" "}
          {match.teamBName}
        </div>
        {match.scheduledAt && (
          <div className="mt-1 text-sm text-zinc-500">
            Время:{" "}
            {formatAlmatyDateTime(match.scheduledAt, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        )}
        {match.status === "finished" &&
          match.teamAScore !== null &&
          match.teamBScore !== null && (
            <div className="text-sm text-zinc-500">
              Счет: {match.teamAScore} - {match.teamBScore}
            </div>
          )}
      </>
    );

    const sharedClassName = "block border border-zinc-200 bg-zinc-50 px-4 py-3";

    if (isUserMatch) {
      return (
        <Link
          key={match.id}
          href={`/matches/${match.id}`}
          className={`${sharedClassName} cursor-pointer transition-colors hover:bg-zinc-100`}
        >
          {content}
        </Link>
      );
    }

    return (
      <div key={match.id} className={sharedClassName}>
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
            <section className="relative mb-8 overflow-hidden border-[3px] border-arcade-black bg-[#FFD000] p-8 shadow-[8px_8px_0px_0px_#09090B] clip-chamfer">
              <div className="mb-4 inline-block bg-[#09090B] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#FFFFFF] clip-slant">
                Активный турнир
              </div>
              <h1 className="text-4xl font-extrabold uppercase tracking-tight text-arcade-black md:text-5xl">
                {activeTournament.name}
              </h1>
              <div
                className="pointer-events-none absolute -right-10 -bottom-10 h-64 w-64 rotate-12 bg-arcade-black/5"
                aria-hidden="true"
              />
            </section>

            <nav className="mb-8 flex flex-wrap gap-3 border-b-[4px] border-[#0F172A] pb-2">
              {TOURNAMENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`cursor-pointer select-none border-[3px] px-6 py-3 text-sm uppercase tracking-wider transition-colors -skew-x-[12deg] md:text-base ${
                    activeTab === tab.id
                      ? "translate-y-[2px] border-[#0F172A] bg-[#FFD700] text-[#09090B]"
                      : "border-[#0F172A] bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  <span
                    className={`block skew-x-[-12deg] ${
                      activeTab === tab.id
                        ? "font-extrabold text-[#09090B]"
                        : "font-bold text-white"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              ))}
            </nav>

            {activeTab === "teams" && (
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-6 flex items-center gap-3 text-2xl font-extrabold uppercase tracking-tight text-[#09090B] before:h-8 before:w-4 before:bg-[#FFD000] before:content-[''] before:clip-slant">
                  Заявленные команды
                </h2>

                {enteredTeams.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    Пока ни одна команда не заявилась на этот турнир.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-6 mt-6 md:grid-cols-2 lg:grid-cols-3">
                    {enteredTeams.map((team) => (
                      <div
                        key={team.id}
                        className="group relative flex flex-col overflow-hidden border-[3px] border-arcade-black bg-white shadow-md transition-all clip-chamfer hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="border-b-[3px] border-[#09090B] bg-khawater-blue p-4 text-xl font-extrabold uppercase tracking-widest text-[#FFFFFF] transition-colors">
                          {team.name}{" "}
                          {team.isSuspended ? (
                            <span className="font-bold text-red-500">(Suspended)</span>
                          ) : null}
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
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Расписание и результаты
                </h2>

                {matchesErrorMessage ? (
                  <p className="text-sm text-zinc-600">{matchesErrorMessage}</p>
                ) : matches.length === 0 ? (
                  <p className="text-sm text-zinc-600">No matches published yet.</p>
                ) : (
                  <div className="space-y-2">
                    {matches.map((match) => renderMatchCard(match))}
                  </div>
                )}
              </section>
            )}

            {activeTab === "group" && (
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Таблица группового этапа
                </h2>

                {matchesErrorMessage ? (
                  <p className="text-sm text-zinc-600">{matchesErrorMessage}</p>
                ) : groupStandings.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    Group stage standings will appear here once finished group-stage
                    matches are available.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-zinc-200 text-left text-sm">
                      <thead className="bg-zinc-100 text-zinc-600">
                        <tr>
                          <th className="px-4 py-3 font-medium">Место</th>
                          <th className="px-4 py-3 font-medium">Команда</th>
                          <th className="px-4 py-3 font-medium">В</th>
                          <th className="px-4 py-3 font-medium">П</th>
                          <th className="px-4 py-3 font-medium">Н</th>
                          <th className="px-4 py-3 font-medium">Очки</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {groupStandings.map((team, index) => (
                          <tr key={team.teamId} className="border-t border-zinc-200">
                            <td className="px-4 py-3 font-medium text-zinc-900">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 font-medium text-zinc-900">
                              {team.teamName}
                            </td>
                            <td className="px-4 py-3 text-zinc-600">{team.wins}</td>
                            <td className="px-4 py-3 text-zinc-600">{team.losses}</td>
                            <td className="px-4 py-3 text-zinc-600">{team.draws}</td>
                            <td className="px-4 py-3 font-medium text-zinc-900">
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