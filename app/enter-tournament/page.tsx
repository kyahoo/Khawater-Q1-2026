"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getProfileByUserId } from "@/lib/supabase/profiles";
import { getCurrentTeamDetails } from "@/lib/supabase/teams";
import {
  createTournamentTeamEntry,
  getActiveTournament,
  getTournamentConfirmationsForUsers,
  getTournamentTeamEntry,
  type Tournament,
} from "@/lib/supabase/tournaments";

const TOURNAMENT_ENTRY_PLAYER_TARGET = 5;

export default function EnterTournamentPage() {
  const router = useRouter();
  const [teamData, setTeamData] = useState<Awaited<
    ReturnType<typeof getCurrentTeamDetails>
  > | null>(null);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isEnteringTournament, setIsEnteringTournament] = useState(false);
  const [hasEnteredTournament, setHasEnteredTournament] = useState(false);

  useEffect(() => {
    const loadEntryState = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth");
          return;
        }

        const profile = await getProfileByUserId(user.id);

        if (!profile) {
          router.replace("/player-setup");
          return;
        }

        const [nextTeamData, nextActiveTournament] = await Promise.all([
          getCurrentTeamDetails(user.id),
          getActiveTournament(),
        ]);

        setTeamData(nextTeamData);
        setActiveTournament(nextActiveTournament);
        setHasEnteredTournament(false);

        if (nextTeamData && nextActiveTournament) {
          try {
            const existingEntry = await getTournamentTeamEntry(
              nextActiveTournament.id,
              nextTeamData.team.id
            );
            setHasEnteredTournament(Boolean(existingEntry));
          } catch {
            setHasEnteredTournament(false);
          }
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load entry state."
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadEntryState();
  }, [router]);

  const teamMemberCount = teamData?.members.length ?? 0;
  const isCaptain = teamData?.membership.is_captain ?? false;
  const [confirmedCount, setConfirmedCount] = useState(0);

  useEffect(() => {
    const loadConfirmationCount = async () => {
      if (!teamData || !activeTournament) {
        setConfirmedCount(0);
        return;
      }

      try {
        const confirmations = await getTournamentConfirmationsForUsers(
          activeTournament.id,
          teamData.members.map((member) => member.userId)
        );
        setConfirmedCount(confirmations.length);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load tournament confirmations."
        );
      }
    };

    void loadConfirmationCount();
  }, [activeTournament, teamData]);

  const hasMinimumPlayers = teamMemberCount >= TOURNAMENT_ENTRY_PLAYER_TARGET;
  const hasMinimumConfirmedPlayers =
    confirmedCount >= TOURNAMENT_ENTRY_PLAYER_TARGET;
  const isEligible =
    Boolean(activeTournament) &&
    hasMinimumPlayers &&
    hasMinimumConfirmedPlayers &&
    isCaptain;
  const tournamentEntryStatus = hasEnteredTournament
    ? "Entered"
    : !activeTournament
    ? "No active tournament"
    : isEligible
      ? "Eligible to enter"
      : hasMinimumPlayers && hasMinimumConfirmedPlayers && !isCaptain
        ? "Captain action required"
        : "Not eligible";

  async function handleEnterTournament() {
    setIsEnteringTournament(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      if (!activeTournament || !teamData || !isEligible) {
        throw new Error("This team is not eligible to enter the active tournament.");
      }

      await createTournamentTeamEntry({
        tournamentId: activeTournament.id,
        teamId: teamData.team.id,
        enteredBy: user.id,
      });

      setHasEnteredTournament(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not enter current tournament."
      );
    } finally {
      setIsEnteringTournament(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-3xl text-sm text-zinc-600">
          Loading tournament entry...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-10">
        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        <h1 className="mb-4 text-3xl font-semibold">Enter Tournament</h1>

        <p className="mb-8 max-w-2xl text-sm leading-7 text-zinc-700">
          Only the team captain can enter the current team into the active
          tournament. This page shows whether the team currently meets the
          entry requirements for the active season.
        </p>

        <div className="mb-8 space-y-4 border border-zinc-300 bg-white p-5">
          <div>
            <div className="text-sm text-zinc-500">Team name</div>
            <div className="font-medium">{teamData?.team.name ?? "No team yet"}</div>
          </div>

          <div>
            <div className="text-sm text-zinc-500">Captain name</div>
            <div className="font-medium">
              {teamData?.captain?.nickname ?? "No captain"}
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-500">Team member count</div>
            <div className="font-medium">{teamMemberCount} players</div>
          </div>

          <div>
            <div className="text-sm text-zinc-500">Confirmed count</div>
            <div className="font-medium">
              {confirmedCount} / {TOURNAMENT_ENTRY_PLAYER_TARGET} players
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-500">Current tournament name</div>
            <div className="font-medium">
              {activeTournament?.name ?? "No active tournament"}
            </div>
          </div>
        </div>

        <div className="mb-8 border border-zinc-300 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold text-zinc-500">
            Entry Requirements
          </h2>

          <div className="mb-5 text-sm">
            Overall status:{" "}
            <span className="font-medium text-zinc-900">
              {tournamentEntryStatus}
            </span>
          </div>

          <div className="space-y-3 text-sm text-zinc-700">
            <div className="flex items-start justify-between gap-4 border border-zinc-200 bg-zinc-50 px-4 py-3">
              <span>At least 5 players are on the team</span>
              <span className="font-medium text-zinc-900">
                {hasMinimumPlayers ? "Met" : "Not met"}
              </span>
            </div>

            <div className="flex items-start justify-between gap-4 border border-zinc-200 bg-zinc-50 px-4 py-3">
              <span>At least 5 players are confirmed for the current tournament</span>
              <span className="font-medium text-zinc-900">
                {hasMinimumConfirmedPlayers ? "Met" : "Not met"}
              </span>
            </div>

            <div className="flex items-start justify-between gap-4 border border-zinc-200 bg-zinc-50 px-4 py-3">
              <span>Current user is the captain</span>
              <span className="font-medium text-zinc-900">
                {isCaptain ? "Met" : "Not met"}
              </span>
            </div>
          </div>

          {!isEligible && (
            <p className="mt-5 text-sm text-zinc-600">
              This team cannot enter yet because one or more entry requirements
              are still not met.
            </p>
          )}
        </div>

        <form>
          <button
            type="button"
            onClick={() => void handleEnterTournament()}
            disabled={!isEligible || hasEnteredTournament || isEnteringTournament}
            className={`rounded border px-5 py-2.5 text-sm font-medium ${
              isEligible && !hasEnteredTournament
                ? "border-zinc-400 bg-white text-zinc-900"
                : "border-zinc-300 bg-zinc-100 text-zinc-500"
            }`}
          >
            {hasEnteredTournament
              ? "Entered in Current Tournament"
              : isEnteringTournament
                ? "Entering..."
                : "Enter Tournament"}
          </button>
        </form>
      </main>
    </div>
  );
}
