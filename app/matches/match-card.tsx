"use client";

import Link from "next/link";
import type { UserTeamMatch } from "@/lib/supabase/matches";

const LIVE_WINDOW_BEFORE_MS = 30 * 60 * 1000;
const LIVE_WINDOW_AFTER_MS = 60 * 60 * 1000;

const almatyDateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Almaty",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const almatyWallClockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Almaty",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
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

function getAlmatyWallClockTimeMs(dateInput: string | Date) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = almatyWallClockFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);

  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function isMatchActive(match: UserTeamMatch, currentTimeMs: number | null, hasMounted: boolean) {
  if (!hasMounted || currentTimeMs === null || !match.scheduledAt) {
    return false;
  }

  if (match.status === "finished") {
    return false;
  }

  const scheduledTimeMs = getAlmatyWallClockTimeMs(match.scheduledAt);

  if (scheduledTimeMs === null) {
    return false;
  }

  return (
    currentTimeMs >= scheduledTimeMs - LIVE_WINDOW_BEFORE_MS &&
    currentTimeMs <= scheduledTimeMs + LIVE_WINDOW_AFTER_MS
  );
}

type MatchCardProps = {
  match: UserTeamMatch;
  currentTimeMs: number | null;
  hasMounted: boolean;
};

export function MatchCard({ match, currentTimeMs, hasMounted }: MatchCardProps) {
  const isActive = isMatchActive(match, currentTimeMs, hasMounted);
  const formattedSchedule = match.scheduledAt
    ? formatMatchDateTime(match.scheduledAt)
    : "Время будет объявлено позже";

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`block rounded-none border-[3px] bg-[#0B3A4A] p-4 transition-all md:p-5 ${
        isActive
          ? "border-[#39FF14] shadow-[0_0_10px_#39FF14]"
          : "border-[#061726] shadow-[4px_4px_0px_0px_#061726] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
      }`}
    >
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#CD9C3E] md:text-sm">
        {formatRoundLabel(match.roundLabel)} - {match.format}
      </div>
      <div className="mt-4 flex items-center gap-2 md:gap-4">
        <div className="flex min-w-0 flex-1 items-center justify-start">
          <span className="min-w-0 truncate text-sm font-bold uppercase tracking-wide text-white md:text-2xl">
            {match.teamAName}
          </span>
        </div>
        <div className="shrink-0 text-center text-lg font-black uppercase tracking-[0.25em] text-[#CD9C3E] md:text-3xl">
          VS
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end text-right">
          <span className="min-w-0 truncate text-sm font-bold uppercase tracking-wide text-white md:text-2xl">
            {match.teamBName}
          </span>
        </div>
      </div>
      <div className="mt-4 text-sm font-medium text-gray-300 md:text-base">
        {formattedSchedule}
      </div>
      {isActive && (
        <div className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-[#39FF14] md:text-sm">
          Матч идет сейчас
        </div>
      )}
    </Link>
  );
}
