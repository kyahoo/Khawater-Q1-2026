"use client";

import Image from "next/image";
import Link from "next/link";
import {
  getUserTeamMatchTechnicalOutcome,
  isUserTeamMatchCompleted,
  isUserTeamMatchLive,
  type UserTeamMatch,
} from "@/lib/supabase/matches";

const almatyDateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Almaty",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function formatRoundLabel(roundLabel: string) {
  if (roundLabel === "Group Stage") {
    return "Групповой этап";
  }

  return roundLabel;
}

function formatMatchDateTime(dateInput: string) {
  return almatyDateTimeFormatter.format(new Date(dateInput));
}

function hasMatchResult(match: UserTeamMatch) {
  return match.teamAScore !== null && match.teamBScore !== null;
}

type MatchCardProps = {
  match: UserTeamMatch;
  currentTimeMs: number | null;
  hasMounted: boolean;
};

function TeamLogoBox({
  teamName,
  logoUrl,
}: {
  teamName: string;
  logoUrl: string | null;
}) {
  return (
    <div
      className={`h-10 w-10 shrink-0 overflow-hidden rounded-none ${logoUrl ? "border-none bg-transparent outline-none" : "border-[2px] border-[#061726] bg-[#061726]"} md:h-12 md:w-12`}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={`Логотип команды ${teamName}`}
          width={48}
          height={48}
          className="h-full w-full border-none object-cover outline-none"
        />
      ) : null}
    </div>
  );
}

export function MatchCard({ match, currentTimeMs, hasMounted }: MatchCardProps) {
  const effectiveCurrentTimeMs = hasMounted ? currentTimeMs ?? undefined : undefined;
  const technicalOutcome = getUserTeamMatchTechnicalOutcome(
    match,
    effectiveCurrentTimeMs
  );
  const isFinished = isUserTeamMatchCompleted(match);
  const isPast = isFinished || technicalOutcome !== null;
  const isActive =
    hasMounted && isUserTeamMatchLive(match, effectiveCurrentTimeMs);
  const formattedSchedule = match.scheduledAt
    ? `${formatMatchDateTime(match.scheduledAt)}${isPast ? " - Завершен" : ""}`
    : "Время будет объявлено позже";
  const centerLabel = hasMatchResult(match)
    ? `${match.teamAScore} - ${match.teamBScore}`
    : "VS";
  const statusLabel = isActive
    ? "МАТЧ ОТКРЫТ"
    : technicalOutcome === "technical-loss"
      ? "ТЕХНИЧЕСКОЕ ПОРАЖЕНИЕ"
      : isPast
        ? "ЗАВЕРШЕН"
        : null;
  const statusClassName = isActive
    ? "text-[#39FF14]"
    : technicalOutcome === "technical-loss"
      ? "text-red-400"
      : "text-gray-400";

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`block rounded-none border-[3px] p-4 transition-all md:p-5 ${
        isActive
          ? "border-[#39FF14] bg-[#0B3A4A] shadow-[0_0_10px_#39FF14]"
          : isPast
            ? "border-[#061726] bg-[#061726]/95 shadow-[4px_4px_0px_0px_#061726] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
            : "border-[#061726] bg-[#0B3A4A] shadow-[4px_4px_0px_0px_#061726] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
      }`}
    >
      <div
        className={`text-xs font-bold uppercase tracking-[0.2em] md:text-sm ${
          isPast ? "text-gray-400" : "text-[#CD9C3E]"
        }`}
      >
        {formatRoundLabel(match.roundLabel)} - {match.format}
      </div>
      <div className="mt-4 flex items-center gap-2 md:gap-4">
        <div className="flex min-w-0 flex-1 items-center justify-start gap-3">
          <TeamLogoBox teamName={match.teamAName} logoUrl={match.teamALogoUrl} />
          <span
            className={`min-w-0 truncate text-sm font-bold uppercase tracking-wide md:text-2xl ${
              isPast ? "text-gray-300" : "text-white"
            }`}
          >
            {match.teamAName}
          </span>
        </div>
        <div
          className={`shrink-0 text-center text-lg font-black uppercase ${
            isPast
              ? "text-white md:text-2xl"
              : "tracking-[0.25em] text-[#CD9C3E] md:text-3xl"
          }`}
        >
          {centerLabel}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 text-right">
          <span
            className={`min-w-0 truncate text-sm font-bold uppercase tracking-wide md:text-2xl ${
              isPast ? "text-gray-300" : "text-white"
            }`}
          >
            {match.teamBName}
          </span>
          <TeamLogoBox teamName={match.teamBName} logoUrl={match.teamBLogoUrl} />
        </div>
      </div>
      <div
        className={`mt-4 text-sm font-medium md:text-base ${
          isPast ? "text-gray-400" : "text-gray-300"
        }`}
      >
        {formattedSchedule}
      </div>
      {statusLabel && (
        <div
          className={`mt-3 text-xs font-black uppercase tracking-[0.2em] md:text-sm ${statusClassName}`}
        >
          {statusLabel}
        </div>
      )}
    </Link>
  );
}
