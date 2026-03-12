import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type PlayerMedalValue = "gold" | "silver" | "bronze";

export type PlayerMedalWithTournament = {
  id: string;
  userId: string;
  tournamentId: string;
  tournamentName: string;
  tournamentCreatedAt: string | null;
  medal: PlayerMedalValue;
};

export const PLAYER_MEDAL_META: Record<
  PlayerMedalValue,
  { icon: string; label: string }
> = {
  gold: {
    icon: "🥇",
    label: "Gold Medal",
  },
  silver: {
    icon: "🥈",
    label: "Silver Medal",
  },
  bronze: {
    icon: "🥉",
    label: "Bronze Medal",
  },
};

type MedalClient = Pick<SupabaseClient<Database>, "from">;

function isPlayerMedalValue(value: string): value is PlayerMedalValue {
  return value === "gold" || value === "silver" || value === "bronze";
}

function comparePlayerMedals(
  medalA: PlayerMedalWithTournament,
  medalB: PlayerMedalWithTournament
) {
  const createdAtA = medalA.tournamentCreatedAt
    ? new Date(medalA.tournamentCreatedAt).getTime()
    : Number.POSITIVE_INFINITY;
  const createdAtB = medalB.tournamentCreatedAt
    ? new Date(medalB.tournamentCreatedAt).getTime()
    : Number.POSITIVE_INFINITY;

  if (createdAtA !== createdAtB) {
    return createdAtA - createdAtB;
  }

  const tournamentNameComparison = medalA.tournamentName.localeCompare(
    medalB.tournamentName
  );

  if (tournamentNameComparison !== 0) {
    return tournamentNameComparison;
  }

  return medalA.id.localeCompare(medalB.id);
}

export function getPlayerMedalTitle(medal: {
  medal: PlayerMedalValue;
  tournamentName: string;
}) {
  return `${medal.tournamentName} (${PLAYER_MEDAL_META[medal.medal].label})`;
}

export async function listPlayerMedalsForUsersWithClient(
  supabase: MedalClient,
  userIds: string[]
) {
  const normalizedUserIds = Array.from(
    new Set(userIds.map((userId) => userId.trim()).filter(Boolean))
  );

  if (normalizedUserIds.length === 0) {
    return {} as Record<string, PlayerMedalWithTournament[]>;
  }

  const { data: medalRows, error: medalsError } = await supabase
    .from("player_medals")
    .select("id, user_id, tournament_id, medal")
    .in("user_id", normalizedUserIds);

  if (medalsError) {
    throw medalsError;
  }

  const typedMedalRows = ((medalRows ?? []) as Array<{
    id: string;
    user_id: string;
    tournament_id: string;
    medal: string;
  }>).flatMap((medalRow) =>
    isPlayerMedalValue(medalRow.medal)
      ? [
          {
            ...medalRow,
            medal: medalRow.medal,
          },
        ]
      : []
  );

  const tournamentIds = Array.from(
    new Set(typedMedalRows.map((medalRow) => medalRow.tournament_id))
  );
  let tournamentsById = new Map<
    string,
    {
      name: string;
      created_at: string | null;
    }
  >();

  if (tournamentIds.length > 0) {
    const { data: tournamentRows, error: tournamentsError } = await supabase
      .from("tournaments")
      .select("id, name, created_at")
      .in("id", tournamentIds);

    if (tournamentsError) {
      throw tournamentsError;
    }

    tournamentsById = new Map(
      ((tournamentRows ?? []) as Array<{
        id: string;
        name: string;
        created_at: string;
      }>).map((tournament) => [
        tournament.id,
        {
          name: tournament.name,
          created_at: tournament.created_at ?? null,
        },
      ])
    );
  }

  const medalsByUserId = normalizedUserIds.reduce<
    Record<string, PlayerMedalWithTournament[]>
  >((accumulator, userId) => {
    accumulator[userId] = [];
    return accumulator;
  }, {});

  for (const medalRow of typedMedalRows) {
    const tournament = tournamentsById.get(medalRow.tournament_id);

    medalsByUserId[medalRow.user_id] = [
      ...(medalsByUserId[medalRow.user_id] ?? []),
      {
        id: medalRow.id,
        userId: medalRow.user_id,
        tournamentId: medalRow.tournament_id,
        tournamentName: tournament?.name ?? "Unknown tournament",
        tournamentCreatedAt: tournament?.created_at ?? null,
        medal: medalRow.medal,
      },
    ];
  }

  for (const userId of Object.keys(medalsByUserId)) {
    medalsByUserId[userId].sort(comparePlayerMedals);
  }

  return medalsByUserId;
}

export async function listPlayerMedalsForUsers(userIds: string[]) {
  const supabase = getSupabaseBrowserClient();
  return listPlayerMedalsForUsersWithClient(supabase, userIds);
}
