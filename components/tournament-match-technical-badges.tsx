"use client";

import type { TournamentMatch } from "@/lib/supabase/tournaments";

type TechnicalBadgeTone = "win" | "loss" | "mutual";

type TechnicalBadge = {
  key: string;
  label: string;
  tone: TechnicalBadgeTone;
};

type TournamentMatchTechnicalBadgesProps = {
  match: TournamentMatch;
  variant?: "public" | "admin";
  className?: string;
};

function getMatchWinnerTeamId(match: TournamentMatch) {
  if (match.winnerTeamId === match.teamAId || match.winnerTeamId === match.teamBId) {
    return match.winnerTeamId;
  }

  if (match.teamAScore !== null && match.teamBScore !== null) {
    if (match.teamAScore > match.teamBScore) {
      return match.teamAId;
    }

    if (match.teamBScore > match.teamAScore) {
      return match.teamBId;
    }
  }

  return null;
}

export function getTournamentMatchTechnicalBadges(match: TournamentMatch): TechnicalBadge[] {
  if (!match.isForfeit) {
    return [];
  }

  if (match.teamAScore === 0 && match.teamBScore === 0) {
    return [
      {
        key: "mutual-technical-loss",
        label: "Обоюдное тех. поражение",
        tone: "mutual",
      },
    ];
  }

  const winnerTeamId = getMatchWinnerTeamId(match);

  if (winnerTeamId === match.teamAId) {
    return [
      {
        key: `technical-win-${match.teamAId}`,
        label: `${match.teamAName}: Тех. победа`,
        tone: "win",
      },
      {
        key: `technical-loss-${match.teamBId}`,
        label: `${match.teamBName}: Тех. поражение`,
        tone: "loss",
      },
    ];
  }

  if (winnerTeamId === match.teamBId) {
    return [
      {
        key: `technical-loss-${match.teamAId}`,
        label: `${match.teamAName}: Тех. поражение`,
        tone: "loss",
      },
      {
        key: `technical-win-${match.teamBId}`,
        label: `${match.teamBName}: Тех. победа`,
        tone: "win",
      },
    ];
  }

  return [
    {
      key: "mutual-technical-loss",
      label: "Обоюдное тех. поражение",
      tone: "mutual",
    },
  ];
}

function getBadgeClassName(
  tone: TechnicalBadgeTone,
  variant: "public" | "admin"
) {
  if (variant === "public") {
    if (tone === "win") {
      return "border-2 border-emerald-300 bg-emerald-500/20 text-emerald-100";
    }

    return "border-2 border-red-300 bg-red-500/20 text-red-100";
  }

  if (tone === "win") {
    return "border border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  return "border border-red-300 bg-red-50 text-red-700";
}

export function TournamentMatchTechnicalBadges({
  match,
  variant = "public",
  className = "",
}: TournamentMatchTechnicalBadgesProps) {
  const badges = getTournamentMatchTechnicalBadges(match);

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`inline-flex items-center px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${getBadgeClassName(
            badge.tone,
            variant
          )}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
