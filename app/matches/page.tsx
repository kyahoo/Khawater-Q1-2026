"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMatchesForUserTeam } from "@/lib/supabase/matches";
import { SiteHeader } from "@/components/site-header";

const CHECK_IN_WINDOW_MS = 30 * 60 * 1000;

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

function MatchListCard({
  match,
  currentTimeMs,
}: {
  match: Awaited<ReturnType<typeof getMatchesForUserTeam>>[number];
  currentTimeMs: number | null;
}) {
  const isCheckInOpen = useMemo(() => {
    if (!match.scheduledAt || currentTimeMs === null) {
      return false;
    }

    if (match.status === "finished") {
      return false;
    }

    const scheduledTimeMs = new Date(match.scheduledAt).getTime();

    if (Number.isNaN(scheduledTimeMs)) {
      return false;
    }

    return currentTimeMs >= scheduledTimeMs - CHECK_IN_WINDOW_MS;
  }, [currentTimeMs, match.scheduledAt, match.status]);

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`block border px-4 py-3 transition-colors ${
        isCheckInOpen
          ? "border-green-500 bg-green-50 ring-1 ring-green-500/40 hover:bg-green-50"
          : "border-zinc-200 bg-white hover:bg-zinc-50"
      }`}
    >
      <div className="text-sm text-zinc-500">
        {formatRoundLabel(match.roundLabel)} · {match.format}
      </div>
      <div className="mt-1 font-medium">
        {match.teamAName} vs {match.teamBName}
      </div>
      {match.scheduledAt && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <span>
            {formatAlmatyDateTime(match.scheduledAt, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isCheckInOpen && (
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              Чекин открыт
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export default function MyMatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<
    Awaited<ReturnType<typeof getMatchesForUserTeam>>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(null);

  useEffect(() => {
    setCurrentTimeMs(Date.now());

    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
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

    void load();
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Мои матчи</h1>

        {isLoading ? (
          <div className="border border-zinc-300 bg-white p-5 text-sm text-zinc-600">
            Загрузка...
          </div>
        ) : errorMessage ? (
          <div className="border border-red-300 bg-white p-5 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : matches.length === 0 ? (
          <section className="border border-zinc-300 bg-white p-5">
            <p className="text-sm text-zinc-600">
              У вас пока нет матчей. Убедитесь, что вы в команде и она заявилась
              на активный турнир.
            </p>
            <Link
              href="/tournament"
              className="mt-3 inline-block text-sm text-zinc-600 underline"
            >
              Перейти к турниру
            </Link>
          </section>
        ) : (
          <div className="space-y-2">
            {matches.map((match) => (
              <MatchListCard
                key={match.id}
                match={match}
                currentTimeMs={currentTimeMs}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
