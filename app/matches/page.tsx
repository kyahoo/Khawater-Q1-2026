import { Suspense } from "react";
import { MatchesClient } from "@/app/matches/matches-client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getMatchesForUserTeamWithClient, type UserTeamMatch } from "@/lib/supabase/matches";

export const dynamic = "force-dynamic";

function MatchCardSkeleton({ tone = "default" }: { tone?: "default" | "muted" }) {
  return (
    <div
      className={`rounded-none border-[3px] p-4 shadow-[4px_4px_0px_0px_#061726] md:p-5 ${
        tone === "muted"
          ? "border-[#061726] bg-[#061726]/95"
          : "border-[#061726] bg-[#0B3A4A]"
      }`}
    >
      <div className="h-4 w-40 animate-pulse bg-[#CD9C3E]/45" />
      <div className="mt-4 flex items-center gap-2 md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-10 w-10 shrink-0 animate-pulse border-[2px] border-[#061726] bg-[#061726] md:h-12 md:w-12" />
          <div className="h-5 w-32 animate-pulse bg-white/20 md:h-7 md:w-44" />
        </div>
        <div className="h-6 w-14 shrink-0 animate-pulse bg-[#CD9C3E]/45 md:h-8 md:w-20" />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="h-5 w-32 animate-pulse bg-white/20 md:h-7 md:w-44" />
          <div className="h-10 w-10 shrink-0 animate-pulse border-[2px] border-[#061726] bg-[#061726] md:h-12 md:w-12" />
        </div>
      </div>
      <div className="mt-4 h-4 w-56 animate-pulse bg-white/15 md:w-72" />
      <div className="mt-3 h-4 w-28 animate-pulse bg-white/10" />
    </div>
  );
}

function MatchesSectionSkeleton() {
  return (
    <div>
      <section>
        <div className="mb-4 inline-block border-[3px] border-[#061726] bg-[#0B3A4A] px-4 py-2 font-black uppercase tracking-widest text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726]">
          ПРЕДСТОЯЩИЕ МАТЧИ
        </div>
        <div className="space-y-4">
          <MatchCardSkeleton />
          <MatchCardSkeleton />
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-4 inline-block border-[3px] border-[#061726] bg-[#0B3A4A] px-4 py-2 font-black uppercase tracking-widest text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726]">
          ПРОШЕДШИЕ МАТЧИ
        </div>
        <div className="space-y-4">
          <MatchCardSkeleton tone="muted" />
        </div>
      </section>
    </div>
  );
}

async function MatchesSection() {
  let initialMatches: UserTeamMatch[] = [];
  let initialErrorMessage = "";

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Match Fetch Error:", userError);
      initialErrorMessage = userError.message;
    } else if (user) {
      initialMatches = await getMatchesForUserTeamWithClient(supabase, user.id);
    }
  } catch (error) {
    console.error("Match Fetch Error:", error);
    initialErrorMessage =
      error instanceof Error && error.message.trim()
        ? error.message
        : String(error);
  }

  return (
    <MatchesClient
      initialMatches={initialMatches}
      initialErrorMessage={initialErrorMessage}
    />
  );
}

export default function MyMatchesPage() {
  return (
    <div className="min-h-screen text-white">
      <div className="min-h-screen">
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
          <section className="border-[3px] border-[#061726] bg-[#061726]/85 p-5 shadow-[6px_6px_0px_0px_#061726] md:p-8">
            <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-[#CD9C3E] md:text-5xl">
              МОИ МАТЧИ
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-200 md:text-base">
              Следите за расписанием вашей команды и заходите в матч вовремя по
              времени Алматы.
            </p>
          </section>

          <section className="mt-6">
            <Suspense fallback={<MatchesSectionSkeleton />}>
              <MatchesSection />
            </Suspense>
          </section>
        </main>
      </div>
    </div>
  );
}
