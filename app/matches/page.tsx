import { MatchesClient } from "@/app/matches/matches-client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getMatchesForUserTeamWithClient, type UserTeamMatch } from "@/lib/supabase/matches";

export const dynamic = "force-dynamic";

export default async function MyMatchesPage() {
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
            <MatchesClient
              initialMatches={initialMatches}
              initialErrorMessage={initialErrorMessage}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
