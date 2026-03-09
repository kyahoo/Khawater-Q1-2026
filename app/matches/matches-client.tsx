"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MatchCard } from "@/app/matches/match-card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMatchesForUserTeam, type UserTeamMatch } from "@/lib/supabase/matches";

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

export function MatchesClient() {
  const router = useRouter();
  const [matches, setMatches] = useState<UserTeamMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    setCurrentTimeMs(getCurrentAlmatyWallClockTimeMs());

    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(getCurrentAlmatyWallClockTimeMs());
    }, LIVE_STATUS_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const loadMatches = async () => {
      try {
        setErrorMessage("");

        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth");
          return;
        }

        const userMatches = await getMatchesForUserTeam(user.id);
        setMatches(userMatches);
      } catch {
        setErrorMessage("Не удалось загрузить матчи.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadMatches();
  }, [router]);

  if (isLoading) {
    return <StatePanel tone="default">Загрузка матчей...</StatePanel>;
  }

  if (errorMessage) {
    return <StatePanel tone="danger">{errorMessage}</StatePanel>;
  }

  const isCompletedMatch = (match: UserTeamMatch) =>
    match.status === "finished" || match.status === "completed";

  if (matches.length === 0) {
    return <EmptyStateBlock message="У вас пока нет матчей" />;
  }

  const upcomingMatches = matches.filter(
    (match) => !isCompletedMatch(match)
  );
  const finishedMatches = matches.filter((match) => isCompletedMatch(match));

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
