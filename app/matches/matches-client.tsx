"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
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

  if (matches.length === 0) {
    return (
      <StatePanel tone="default">
        <div className="space-y-4 normal-case tracking-normal">
          <p className="text-sm leading-7 text-gray-200">
            У вас пока нет матчей. Убедитесь, что вы в команде и она заявилась на активный
            турнир.
          </p>
          <Link
            href="/tournament"
            className="inline-flex items-center justify-center rounded-none border-[3px] border-[#061726] bg-[#CD9C3E] px-5 py-3 text-sm font-black uppercase tracking-wide text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
          >
            Перейти к турниру
          </Link>
        </div>
      </StatePanel>
    );
  }

  return (
    <div className="space-y-4">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          currentTimeMs={currentTimeMs}
          hasMounted={hasMounted}
        />
      ))}
    </div>
  );
}
