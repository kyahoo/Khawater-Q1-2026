"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MatchCard } from "@/app/matches/match-card";
import type { UserTeamMatch } from "@/lib/supabase/matches";

const LIVE_STATUS_REFRESH_MS = 60 * 1000;

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

function getCurrentAlmatyWallClockTimeMs() {
  const parts = almatyWallClockFormatter.formatToParts(new Date());
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

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function StatePanel({
  tone,
  children,
}: {
  tone: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-none border-[3px] p-5 text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_0px_#061726] ${
        tone === "danger"
          ? "border-red-600 bg-[#061726] text-red-300"
          : "border-[#061726] bg-[#0B3A4A] text-gray-200"
      }`}
    >
      {children}
    </div>
  );
}

function EmptyStateBlock({ message }: { message: string }) {
  return (
    <div className="rounded-none border-[3px] border-[#061726] bg-[#061726] p-5 text-sm font-black uppercase tracking-wide text-gray-300 shadow-[4px_4px_0px_0px_#061726]">
      {message}
    </div>
  );
}

type MatchesClientProps = {
  initialMatches: UserTeamMatch[];
  initialErrorMessage?: string;
};

export function MatchesClient({
  initialMatches,
  initialErrorMessage = "",
}: MatchesClientProps) {
  const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(() =>
    typeof window === "undefined" ? null : getCurrentAlmatyWallClockTimeMs()
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(getCurrentAlmatyWallClockTimeMs());
    }, LIVE_STATUS_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const hasMounted = currentTimeMs !== null;

  if (initialErrorMessage) {
    return <StatePanel tone="danger">{initialErrorMessage}</StatePanel>;
  }

  const isCompletedMatch = (match: UserTeamMatch) =>
    match.status === "finished" || match.status === "completed";

  if (initialMatches.length === 0) {
    return <EmptyStateBlock message="У ВАС ПОКА НЕТ ЗАПЛАНИРОВАННЫХ МАТЧЕЙ" />;
  }

  const upcomingMatches = initialMatches.filter(
    (match) => !isCompletedMatch(match)
  );
  const finishedMatches = initialMatches.filter((match) => isCompletedMatch(match));

  return (
    <div>
      <section>
        <h2 className="mb-4 inline-block border-[3px] border-[#061726] bg-[#0B3A4A] px-4 py-2 text-[#CD9C3E] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_#061726]">
          ПРЕДСТОЯЩИЕ МАТЧИ
        </h2>
        <div className="space-y-4">
          {upcomingMatches.length > 0 ? (
            upcomingMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                currentTimeMs={currentTimeMs}
                hasMounted={hasMounted}
              />
            ))
          ) : (
            <EmptyStateBlock message="НЕТ ПРЕДСТОЯЩИХ МАТЧЕЙ" />
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 inline-block border-[3px] border-[#061726] bg-[#0B3A4A] px-4 py-2 text-[#CD9C3E] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_#061726]">
          ПРОШЕДШИЕ МАТЧИ
        </h2>
        <div className="space-y-4">
          {finishedMatches.length > 0 ? (
            finishedMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                currentTimeMs={currentTimeMs}
                hasMounted={hasMounted}
              />
            ))
          ) : (
            <EmptyStateBlock message="НЕТ ПРОШЕДШИХ МАТЧЕЙ" />
          )}
        </div>
      </section>
    </div>
  );
}
