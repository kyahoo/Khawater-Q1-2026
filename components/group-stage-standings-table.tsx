"use client";

import { TeamLogo } from "@/components/team-logo";
import type { TournamentMatch } from "@/lib/supabase/tournaments";

export type GroupStageStanding = {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  wins: number;
  losses: number;
  draws: number;
  points: number;
};

type GroupStageStandingsTableProps = {
  matches: TournamentMatch[];
  isLoading?: boolean;
  errorMessage?: string;
  title?: string;
  description?: string;
  emptyMessage?: string;
  variant?: "public" | "admin";
};

function GroupStageStandingsSkeleton({
  title,
  variant,
}: {
  title: string;
  variant: "public" | "admin";
}) {
  if (variant === "admin") {
    return (
      <section className="border border-zinc-300 bg-white p-5 shadow-md">
        <h2 className="mb-4 text-lg font-semibold text-zinc-500">{title}</h2>
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={`${title}-skeleton-${index}`}
              className="animate-pulse border border-zinc-200 bg-zinc-50 p-4"
            >
              <div className="h-4 w-40 rounded bg-zinc-200" />
              <div className="mt-3 h-3 w-full rounded bg-zinc-200" />
              <div className="mt-2 h-3 w-2/3 rounded bg-zinc-200" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full border-[3px] border-[#061726] bg-[#061726]/85 p-6 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md md:p-8">
      <h2 className="mb-8 text-4xl font-black uppercase text-[#CD9C3E] md:text-5xl">
        {title}
      </h2>
      <div className="space-y-4">
        {Array.from({ length: 5 }, (_, index) => (
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

export function calculateGroupStageStandings(
  matchesToRank: TournamentMatch[]
): GroupStageStanding[] {
  const groupMatches = matchesToRank.filter(
    (match) =>
      match.status === "finished" &&
      match.roundLabel === "Group Stage" &&
      (match.isForfeit || (match.teamAScore !== null && match.teamBScore !== null))
  );

  const standingsByTeam = new Map<string, GroupStageStanding>();

  const ensureTeam = (teamId: string, teamName: string, teamLogoUrl: string | null) => {
    const existing = standingsByTeam.get(teamId);

    if (existing) {
      return existing;
    }

    const nextTeam: GroupStageStanding = {
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

  const recordWin = (
    winner: GroupStageStanding,
    loser: GroupStageStanding,
    format: TournamentMatch["format"]
  ) => {
    winner.wins += 1;
    loser.losses += 1;
    winner.points += format === "BO2" ? 3 : 1;
  };

  for (const match of groupMatches) {
    const teamA = ensureTeam(match.teamAId, match.teamAName, match.teamALogoUrl);
    const teamB = ensureTeam(match.teamBId, match.teamBName, match.teamBLogoUrl);
    const teamAScore = match.teamAScore;
    const teamBScore = match.teamBScore;
    const isMutualForfeit = teamAScore === 0 && teamBScore === 0;

    if (match.isForfeit) {
      if (!isMutualForfeit && match.winnerTeamId === match.teamAId) {
        recordWin(teamA, teamB, match.format);
        continue;
      }

      if (!isMutualForfeit && match.winnerTeamId === match.teamBId) {
        recordWin(teamB, teamA, match.format);
        continue;
      }

      teamA.losses += 1;
      teamB.losses += 1;
      continue;
    }

    if (teamAScore === null || teamBScore === null) {
      continue;
    }

    if (isMutualForfeit) {
      teamA.losses += 1;
      teamB.losses += 1;
      continue;
    }

    if (match.format === "BO2") {
      if (teamAScore === teamBScore) {
        teamA.draws += 1;
        teamB.draws += 1;
        teamA.points += 1;
        teamB.points += 1;
      } else if (teamAScore > teamBScore) {
        recordWin(teamA, teamB, match.format);
      } else {
        recordWin(teamB, teamA, match.format);
      }

      continue;
    }

    if (teamAScore > teamBScore) {
      recordWin(teamA, teamB, match.format);
    } else if (teamBScore > teamAScore) {
      recordWin(teamB, teamA, match.format);
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

export function GroupStageStandingsTable({
  matches,
  isLoading = false,
  errorMessage = "",
  title = "Таблица группового этапа",
  description,
  emptyMessage = "Таблица появится после завершения матчей группового этапа.",
  variant = "public",
}: GroupStageStandingsTableProps) {
  if (isLoading) {
    return <GroupStageStandingsSkeleton title={title} variant={variant} />;
  }

  const standings = calculateGroupStageStandings(matches);
  const isPublic = variant === "public";
  const sectionClassName = isPublic
    ? "w-full overflow-x-auto border-[3px] border-[#061726] bg-[#061726]/85 p-6 shadow-[6px_6px_0px_0px_#061726] backdrop-blur-md md:p-8"
    : "border border-zinc-300 bg-white p-5 shadow-md";
  const headingClassName = isPublic
    ? "mb-8 text-4xl font-black uppercase text-[#CD9C3E] md:text-5xl"
    : "mb-4 text-lg font-semibold text-zinc-500";
  const descriptionClassName = isPublic
    ? "mb-4 text-sm text-white/75"
    : "mb-4 text-sm text-zinc-600";
  const messageClassName = isPublic ? "text-sm text-gray-300" : "text-sm text-zinc-600";
  const tableHeadClassName = isPublic
    ? "border-b-[3px] border-[#061726] text-[#CD9C3E]"
    : "border-b border-zinc-200 text-zinc-500";
  const rowClassName = isPublic
    ? "border-b-2 border-[#061726] bg-[#0B3A4A] transition-colors hover:bg-[#0d4a5e]"
    : "border-b border-zinc-200 bg-white transition-colors hover:bg-zinc-50";
  const cellClassName = isPublic
    ? "p-4 text-base font-medium text-white md:text-lg"
    : "p-4 text-sm font-medium text-zinc-800 md:text-base";
  const logoSizeClassName = isPublic
    ? "aspect-square h-10 w-10 md:h-12 md:w-12"
    : "aspect-square h-10 w-10";
  const logoTextClassName = isPublic ? "text-lg md:text-xl" : "text-base";

  return (
    <section className={sectionClassName}>
      <h2 className={headingClassName}>{title}</h2>

      {description ? <p className={descriptionClassName}>{description}</p> : null}

      {errorMessage ? (
        <p className={messageClassName}>{errorMessage}</p>
      ) : standings.length === 0 ? (
        <p className={messageClassName}>{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead className={tableHeadClassName}>
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
              {standings.map((team, index) => (
                <tr key={team.teamId} className={rowClassName}>
                  <td
                    className={`${cellClassName} ${
                      isPublic
                        ? index === 0
                          ? "font-black text-[#CD9C3E]"
                          : "text-white"
                        : index === 0
                          ? "font-bold text-[#0B3A4A]"
                          : "text-zinc-800"
                    }`}
                  >
                    {index + 1}
                  </td>
                  <td className={cellClassName}>
                    <div className="flex items-center gap-4">
                      <TeamLogo
                        teamName={team.teamName}
                        logoUrl={team.teamLogoUrl}
                        sizeClassName={logoSizeClassName}
                        textClassName={logoTextClassName}
                      />
                      <span>{team.teamName}</span>
                    </div>
                  </td>
                  <td className={cellClassName}>{team.wins}</td>
                  <td className={cellClassName}>{team.losses}</td>
                  <td className={cellClassName}>{team.draws}</td>
                  <td className={cellClassName}>{team.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
