import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Group standings banner";
export const contentType = "image/png";
export const size = {
  width: 1080,
  height: 1440,
};

const TITLE = "ТАБЛИЦА ГРУППОВОГО ЭТАПА";
const GOLD = "#CD9C3E";
const NAVY = "#061726";
const PANEL_BACKGROUND = "rgba(11, 58, 74, 0.9)";
const PANEL_BORDER = "#061726";
const LABEL_TEXT = "#BFD6DC";

type TournamentEntryRow = Pick<
  Database["public"]["Tables"]["tournament_team_entries"]["Row"],
  "team_id" | "created_at"
>;

type TeamMetaRow = Pick<Database["public"]["Tables"]["teams"]["Row"], "id" | "name" | "logo_url">;

type MatchRow = Database["public"]["Tables"]["tournament_matches"]["Row"];

type Standing = {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
};

type GroupAssignment = {
  key: string;
  label: string;
  teamIds: string[];
  explicitKey: string | null;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment configuration.");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getFallbackGroupCount(teamCount: number, preferredCount: number) {
  return Math.max(1, Math.min(preferredCount || 1, teamCount || 1));
}

function createGroupLabel(index: number, explicitKey?: string | null) {
  if (explicitKey) {
    return `ГРУППА ${explicitKey.toUpperCase()}`;
  }

  return `ГРУППА ${String.fromCharCode(65 + index)}`;
}

function compareGroupKeys(left: string, right: string) {
  return new Intl.Collator("ru", {
    numeric: true,
    sensitivity: "base",
  }).compare(left, right);
}

function extractExplicitGroupKey(roundLabel: string) {
  const normalizedLabel = roundLabel.trim();

  if (!normalizedLabel || /^group\s*stage$/i.test(normalizedLabel)) {
    return null;
  }

  const patterns = [
    /^group\s+([a-z0-9]+)$/i,
    /^group\s*stage\s*[-:]\s*([a-z0-9]+)$/i,
    /^group\s*stage\s+([a-z0-9]+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedLabel.match(pattern);

    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

function distributeTeamsEvenly(teamIds: string[], targetGroupCount: number) {
  const groupCount = getFallbackGroupCount(teamIds.length, targetGroupCount);
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    key: `fallback-${index}`,
    label: createGroupLabel(index),
    teamIds: [] as string[],
    explicitKey: null,
  }));

  teamIds.forEach((teamId, index) => {
    groups[index % groupCount].teamIds.push(teamId);
  });

  return groups.filter((group) => group.teamIds.length > 0);
}

function inferGroupAssignments(params: {
  teamIds: string[];
  groupMatches: MatchRow[];
  preferredGroupCount: number;
}) {
  const { teamIds, groupMatches, preferredGroupCount } = params;
  const enteredTeamIdSet = new Set(teamIds);

  const explicitGroups = new Map<string, Set<string>>();

  for (const match of groupMatches) {
    const explicitKey = extractExplicitGroupKey(match.round_label);

    if (!explicitKey) {
      continue;
    }

    const teamIdsForMatch = [match.team_a_id, match.team_b_id].filter((teamId) =>
      enteredTeamIdSet.has(teamId)
    );

    if (teamIdsForMatch.length === 0) {
      continue;
    }

    const group = explicitGroups.get(explicitKey) ?? new Set<string>();
    teamIdsForMatch.forEach((teamId) => group.add(teamId));
    explicitGroups.set(explicitKey, group);
  }

  if (explicitGroups.size > 0) {
    const assignments = Array.from(explicitGroups.entries())
      .sort(([leftKey], [rightKey]) => compareGroupKeys(leftKey, rightKey))
      .map(([groupKey, groupTeamIds], index) => ({
        key: `explicit-${groupKey}`,
        label: createGroupLabel(index, groupKey),
        teamIds: teamIds.filter((teamId) => groupTeamIds.has(teamId)),
        explicitKey: groupKey,
      }))
      .filter((group) => group.teamIds.length > 0);

    const assignedTeamIds = new Set(assignments.flatMap((group) => group.teamIds));
    const remainingTeamIds = teamIds.filter((teamId) => !assignedTeamIds.has(teamId));

    if (remainingTeamIds.length === 0) {
      return assignments;
    }

    if (assignments.length === 0) {
      return distributeTeamsEvenly(teamIds, preferredGroupCount);
    }

    for (const teamId of remainingTeamIds) {
      const nextGroup = assignments.reduce((smallestGroup, currentGroup) =>
        currentGroup.teamIds.length < smallestGroup.teamIds.length
          ? currentGroup
          : smallestGroup
      );
      nextGroup.teamIds.push(teamId);
    }

    return assignments;
  }

  const matchedTeamIds = new Set(
    groupMatches.flatMap((match) =>
      [match.team_a_id, match.team_b_id].filter((teamId) => enteredTeamIdSet.has(teamId))
    )
  );

  if (matchedTeamIds.size === 0) {
    return distributeTeamsEvenly(teamIds, preferredGroupCount);
  }

  const adjacency = new Map<string, Set<string>>();

  matchedTeamIds.forEach((teamId) => {
    adjacency.set(teamId, new Set());
  });

  for (const match of groupMatches) {
    const teamAId = enteredTeamIdSet.has(match.team_a_id) ? match.team_a_id : null;
    const teamBId = enteredTeamIdSet.has(match.team_b_id) ? match.team_b_id : null;

    if (!teamAId || !teamBId) {
      continue;
    }

    adjacency.get(teamAId)?.add(teamBId);
    adjacency.get(teamBId)?.add(teamAId);
  }

  const visited = new Set<string>();
  const assignments: GroupAssignment[] = [];

  for (const teamId of teamIds) {
    if (!matchedTeamIds.has(teamId) || visited.has(teamId)) {
      continue;
    }

    const stack = [teamId];
    const groupTeamIds: string[] = [];

    while (stack.length > 0) {
      const currentTeamId = stack.pop();

      if (!currentTeamId || visited.has(currentTeamId)) {
        continue;
      }

      visited.add(currentTeamId);
      groupTeamIds.push(currentTeamId);

      adjacency.get(currentTeamId)?.forEach((connectedTeamId) => {
        if (!visited.has(connectedTeamId)) {
          stack.push(connectedTeamId);
        }
      });
    }

    assignments.push({
      key: `component-${assignments.length}`,
      label: createGroupLabel(assignments.length),
      teamIds: teamIds.filter((entryTeamId) => groupTeamIds.includes(entryTeamId)),
      explicitKey: null,
    });
  }

  const assignedTeamIds = new Set(assignments.flatMap((group) => group.teamIds));
  const remainingTeamIds = teamIds.filter((teamId) => !assignedTeamIds.has(teamId));

  if (assignments.length === 0) {
    return distributeTeamsEvenly(teamIds, preferredGroupCount);
  }

  for (const teamId of remainingTeamIds) {
    const nextGroup = assignments.reduce((smallestGroup, currentGroup) =>
      currentGroup.teamIds.length < smallestGroup.teamIds.length
        ? currentGroup
        : smallestGroup
    );
    nextGroup.teamIds.push(teamId);
  }

  return assignments;
}

function calculateGroupStandings(params: {
  teamIds: string[];
  matches: MatchRow[];
  teamMetaById: Map<string, TeamMetaRow>;
  explicitGroupKey: string | null;
}) {
  const { teamIds, matches, teamMetaById, explicitGroupKey } = params;
  const groupTeamIdSet = new Set(teamIds);

  const standingsByTeamId = new Map<string, Standing>();

  const ensureStanding = (teamId: string) => {
    const existingStanding = standingsByTeamId.get(teamId);

    if (existingStanding) {
      return existingStanding;
    }

    const team = teamMetaById.get(teamId);
    const nextStanding: Standing = {
      teamId,
      teamName: team?.name ?? "Команда",
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
    };

    standingsByTeamId.set(teamId, nextStanding);
    return nextStanding;
  };

  teamIds.forEach((teamId) => {
    ensureStanding(teamId);
  });

  const finishedGroupMatches = matches.filter((match) => {
    const teamAInGroup = groupTeamIdSet.has(match.team_a_id);
    const teamBInGroup = groupTeamIdSet.has(match.team_b_id);
    const explicitKey = extractExplicitGroupKey(match.round_label);

    if (!teamAInGroup || !teamBInGroup) {
      return false;
    }

    if (explicitGroupKey && explicitKey && explicitKey !== explicitGroupKey) {
      return false;
    }

    return (
      match.status === "finished" &&
      match.team_a_score !== null &&
      match.team_b_score !== null
    );
  });

  for (const match of finishedGroupMatches) {
    const teamAStanding = ensureStanding(match.team_a_id);
    const teamBStanding = ensureStanding(match.team_b_id);
    const teamAScore = match.team_a_score;
    const teamBScore = match.team_b_score;

    if (teamAScore === null || teamBScore === null) {
      continue;
    }

    if (match.format === "BO2") {
      if (teamAScore === teamBScore) {
        teamAStanding.draws += 1;
        teamBStanding.draws += 1;
        teamAStanding.points += 1;
        teamBStanding.points += 1;
        continue;
      }

      if (teamAScore > teamBScore) {
        teamAStanding.wins += 1;
        teamBStanding.losses += 1;
        teamAStanding.points += 3;
        continue;
      }

      teamBStanding.wins += 1;
      teamAStanding.losses += 1;
      teamBStanding.points += 3;
      continue;
    }

    if (teamAScore > teamBScore) {
      teamAStanding.wins += 1;
      teamBStanding.losses += 1;
      teamAStanding.points += 1;
      continue;
    }

    if (teamBScore > teamAScore) {
      teamBStanding.wins += 1;
      teamAStanding.losses += 1;
      teamBStanding.points += 1;
    }
  }

  return Array.from(standingsByTeamId.values()).sort((leftTeam, rightTeam) => {
    if (rightTeam.points !== leftTeam.points) {
      return rightTeam.points - leftTeam.points;
    }

    if (rightTeam.wins !== leftTeam.wins) {
      return rightTeam.wins - leftTeam.wins;
    }

    if (leftTeam.losses !== rightTeam.losses) {
      return leftTeam.losses - rightTeam.losses;
    }

    return leftTeam.teamName.localeCompare(rightTeam.teamName, "ru");
  });
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data: activeTournament, error: activeTournamentError } = await supabase
      .from("tournaments")
      .select("id, name, number_of_groups")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeTournamentError) {
      throw new Error(activeTournamentError.message);
    }

    if (!activeTournament) {
      return Response.json(
        {
          error: "No active tournament found.",
        },
        {
          status: 404,
        }
      );
    }

    const { data: backgroundData, error: backgroundError } = await supabase.storage
      .from("social-templates")
      .createSignedUrl("standings-bg.png", 60);

    if (backgroundError || !backgroundData?.signedUrl) {
      return Response.json(
        {
          error: "Standings background template is missing.",
        },
        {
          status: 404,
        }
      );
    }

    const { data: tournamentEntries, error: tournamentEntriesError } = await supabase
      .from("tournament_team_entries")
      .select("team_id, created_at")
      .eq("tournament_id", activeTournament.id)
      .order("created_at", { ascending: true });

    if (tournamentEntriesError) {
      throw new Error(tournamentEntriesError.message);
    }

    const typedEntries = (tournamentEntries ?? []) as TournamentEntryRow[];
    const teamIds = typedEntries.map((entry) => entry.team_id);

    if (teamIds.length === 0) {
      return Response.json(
        {
          error: "No teams have entered the active tournament yet.",
        },
        {
          status: 404,
        }
      );
    }

    const [{ data: teams, error: teamsError }, { data: matches, error: matchesError }] =
      await Promise.all([
        supabase.from("teams").select("id, name, logo_url").in("id", teamIds),
        supabase
          .from("tournament_matches")
          .select(
            "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, display_order, format, created_at, lobby_name, lobby_password"
          )
          .eq("tournament_id", activeTournament.id)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    if (matchesError) {
      throw new Error(matchesError.message);
    }

    const teamMetaById = new Map(
      ((teams ?? []) as TeamMetaRow[]).map((team) => [team.id, team] as const)
    );
    const groupMatches = ((matches ?? []) as MatchRow[]).filter((match) =>
      match.round_label.toLowerCase().includes("group")
    );
    const groups = inferGroupAssignments({
      teamIds,
      groupMatches,
      preferredGroupCount: activeTournament.number_of_groups,
    }).map((group) => ({
      ...group,
      standings: calculateGroupStandings({
        teamIds: group.teamIds,
        matches: groupMatches,
        teamMetaById,
        explicitGroupKey: group.explicitKey,
      }),
    }));

    const panelWidth = groups.length === 1 ? 944 : 468;

    return new ImageResponse(
      (
        <div
          tw="relative flex h-full w-full"
          style={{
            backgroundColor: NAVY,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundData.signedUrl}
            alt=""
            tw="absolute inset-0 h-full w-full"
            style={{
              objectFit: "cover",
            }}
          />
          <div
            tw="absolute inset-0 flex"
            style={{
              background:
                "linear-gradient(180deg, rgba(6, 23, 38, 0.18) 0%, rgba(6, 23, 38, 0.55) 100%)",
            }}
          />
          <div
            tw="relative flex h-full w-full flex-col px-16 pt-16 pb-14"
            style={{
              gap: 30,
            }}
          >
            <div tw="flex w-full flex-col items-center justify-center">
              <div
                tw="flex items-center justify-center border-4 px-10 py-5"
                style={{
                  borderColor: PANEL_BORDER,
                  backgroundColor: "rgba(6, 23, 38, 0.86)",
                  boxShadow: `12px 12px 0 ${PANEL_BORDER}`,
                }}
              >
                <span
                  style={{
                    color: GOLD,
                    fontSize: 58,
                    fontWeight: 900,
                    letterSpacing: 4,
                    textAlign: "center",
                  }}
                >
                  {TITLE}
                </span>
              </div>
              <span
                style={{
                  marginTop: 20,
                  color: "#FFFFFF",
                  fontSize: 28,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {activeTournament.name}
              </span>
            </div>

            <div
              tw="flex flex-1 flex-wrap content-start justify-center"
              style={{
                gap: 24,
              }}
            >
              {groups.map((group) => (
                <div
                  key={group.key}
                  tw="flex flex-col border-4 px-7 py-6"
                  style={{
                    width: panelWidth,
                    minHeight: groups.length === 1 ? 1020 : 0,
                    borderColor: PANEL_BORDER,
                    backgroundColor: PANEL_BACKGROUND,
                    boxShadow: `12px 12px 0 ${PANEL_BORDER}`,
                  }}
                >
                  <div tw="flex items-center justify-between">
                    <span
                      style={{
                        color: GOLD,
                        fontSize: 34,
                        fontWeight: 900,
                        letterSpacing: 2,
                      }}
                    >
                      {group.label}
                    </span>
                    <span
                      style={{
                        color: "#FFFFFF",
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    >
                      {group.standings.length} команд
                    </span>
                  </div>

                  <div
                    tw="flex items-center justify-between"
                    style={{
                      marginTop: 20,
                      paddingBottom: 12,
                      borderBottom: "2px solid rgba(205, 156, 62, 0.35)",
                    }}
                  >
                    <span
                      style={{
                        width: 42,
                        color: LABEL_TEXT,
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    >
                      #
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: LABEL_TEXT,
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    >
                      Команда
                    </span>
                    <span
                      style={{
                        width: 112,
                        color: LABEL_TEXT,
                        fontSize: 18,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      W-L
                    </span>
                    <span
                      style={{
                        width: 86,
                        color: LABEL_TEXT,
                        fontSize: 18,
                        fontWeight: 700,
                        textAlign: "right",
                      }}
                    >
                      Очки
                    </span>
                  </div>

                  <div
                    tw="flex flex-col"
                    style={{
                      marginTop: 8,
                    }}
                  >
                    {group.standings.map((team, index) => (
                      <div
                        key={team.teamId}
                        tw="flex items-center justify-between"
                        style={{
                          minHeight: 68,
                          paddingTop: 10,
                          paddingBottom: 10,
                          borderTop:
                            index === 0
                              ? "0px solid transparent"
                              : "1px solid rgba(255, 255, 255, 0.12)",
                        }}
                      >
                        <span
                          style={{
                            width: 42,
                            color: index === 0 ? GOLD : "#FFFFFF",
                            fontSize: 24,
                            fontWeight: 900,
                          }}
                        >
                          {index + 1}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            color: "#FFFFFF",
                            fontSize: 24,
                            fontWeight: index === 0 ? 800 : 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {team.teamName}
                        </span>
                        <span
                          style={{
                            width: 112,
                            color: "#FFFFFF",
                            fontSize: 22,
                            fontWeight: 700,
                            textAlign: "center",
                          }}
                        >
                          {team.wins}-{team.losses}
                        </span>
                        <span
                          style={{
                            width: 86,
                            color: GOLD,
                            fontSize: 28,
                            fontWeight: 900,
                            textAlign: "right",
                          }}
                        >
                          {team.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      size
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not generate standings banner.",
      },
      {
        status: 500,
      }
    );
  }
}
