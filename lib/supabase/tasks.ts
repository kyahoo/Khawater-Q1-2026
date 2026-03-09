import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type ActiveTaskType =
  | "enter_score"
  | "upload_result_screenshots"
  | "complete_stage_two";

export type ActiveTask = {
  id: string;
  userId: string;
  matchId: string;
  href: string;
  type: ActiveTaskType;
  label: string;
  title: string;
  description: string;
  actionLabel: string;
  roundLabel: string;
  format: string;
  scheduledAt: string | null;
  teamAName: string;
  teamBName: string;
};

type TournamentMatchTaskRow = Pick<
  Database["public"]["Tables"]["tournament_matches"]["Row"],
  | "id"
  | "team_a_id"
  | "team_b_id"
  | "round_label"
  | "scheduled_at"
  | "status"
  | "team_a_score"
  | "team_b_score"
  | "format"
  | "lobby_name"
  | "lobby_password"
  | "result_screenshot_url"
>;

type TournamentMatchTaskQueryRow = TournamentMatchTaskRow & {
  result_screenshot_urls?: string[] | null;
};

type TeamTaskRow = Pick<Database["public"]["Tables"]["teams"]["Row"], "id" | "name">;
type TeamMemberTaskRow = Pick<
  Database["public"]["Tables"]["team_members"]["Row"],
  "team_id" | "user_id" | "is_captain"
>;
type MatchCheckInTaskRow = Pick<
  Database["public"]["Tables"]["match_check_ins"]["Row"],
  "match_id" | "player_id" | "is_checked_in" | "lobby_screenshot_url"
>;

const POST_MATCH_STATUSES = new Set(["in_progress", "completed", "finished"]);
const TASK_PRIORITY: Record<ActiveTaskType, number> = {
  enter_score: 0,
  upload_result_screenshots: 1,
  complete_stage_two: 2,
};

function formatRoundLabel(roundLabel: string) {
  if (roundLabel === "Group Stage") {
    return "Групповой этап";
  }

  return roundLabel;
}

function normalizeResultScreenshotUrls(match: TournamentMatchTaskQueryRow) {
  const arrayUrls = Array.isArray(match.result_screenshot_urls)
    ? match.result_screenshot_urls.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0
      )
    : [];

  if (arrayUrls.length > 0) {
    return arrayUrls;
  }

  return match.result_screenshot_url?.trim() ? [match.result_screenshot_url.trim()] : [];
}

function getHostTeamId(
  match: TournamentMatchTaskRow,
  teamNameById: Map<string, string>
) {
  const teamAName = teamNameById.get(match.team_a_id)?.trim() ?? "";
  const teamBName = teamNameById.get(match.team_b_id)?.trim() ?? "";

  if (!teamBName || teamAName.localeCompare(teamBName) <= 0) {
    return match.team_a_id;
  }

  return match.team_b_id;
}

function createEmptyTaskRecord(userIds: string[]) {
  return userIds.reduce<Record<string, ActiveTask[]>>((record, userId) => {
    record[userId] = [];
    return record;
  }, {});
}

function pushTask(params: {
  taskRecord: Record<string, ActiveTask[]>;
  allowedUserIds: Set<string> | null;
  task: ActiveTask;
}) {
  const { taskRecord, allowedUserIds, task } = params;

  if (allowedUserIds && !allowedUserIds.has(task.userId)) {
    return;
  }

  if (!taskRecord[task.userId]) {
    taskRecord[task.userId] = [];
  }

  taskRecord[task.userId].push(task);
}

export async function listActiveTasksForUsers(
  supabase: SupabaseClient<Database>,
  userIds: string[] = []
) {
  const trimmedUserIds = Array.from(
    new Set(userIds.map((userId) => userId.trim()).filter(Boolean))
  );
  const allowedUserIds = trimmedUserIds.length > 0 ? new Set(trimmedUserIds) : null;
  const tasksByUserId = createEmptyTaskRecord(trimmedUserIds);

  const { data: activeTournament, error: activeTournamentError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (activeTournamentError || !activeTournament) {
    return tasksByUserId;
  }

  const initialMatchesResult = await supabase
    .from("tournament_matches")
    .select(
      "id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, lobby_name, lobby_password, result_screenshot_url, result_screenshot_urls"
    )
    .eq("tournament_id", activeTournament.id);
  let matches = initialMatchesResult.data as TournamentMatchTaskQueryRow[] | null;
  let matchesError = initialMatchesResult.error;

  if (
    matchesError?.message.includes("column tournament_matches.") &&
    matchesError.message.includes("does not exist")
  ) {
    const legacyResult = await supabase
      .from("tournament_matches")
      .select(
        "id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, format, lobby_name, lobby_password, result_screenshot_url"
      )
      .eq("tournament_id", activeTournament.id);

    matches = legacyResult.data;
    matchesError = legacyResult.error;
  }

  if (matchesError || !matches?.length) {
    return tasksByUserId;
  }

  const matchRows = matches as TournamentMatchTaskQueryRow[];
  const teamIds = Array.from(
    new Set(matchRows.flatMap((match) => [match.team_a_id, match.team_b_id]))
  );
  const matchIds = matchRows.map((match) => match.id);

  const [{ data: teams, error: teamsError }, { data: teamMembers, error: teamMembersError }, {
    data: checkIns,
    error: checkInsError,
  }] = await Promise.all([
    supabase.from("teams").select("id, name").in("id", teamIds),
    supabase.from("team_members").select("team_id, user_id, is_captain").in("team_id", teamIds),
    supabase
      .from("match_check_ins")
      .select("match_id, player_id, is_checked_in, lobby_screenshot_url")
      .in("match_id", matchIds),
  ]);

  if (teamsError || teamMembersError || checkInsError) {
    return tasksByUserId;
  }

  const teamRows = (teams ?? []) as TeamTaskRow[];
  const teamMemberRows = (teamMembers ?? []) as TeamMemberTaskRow[];
  const checkInRows = (checkIns ?? []) as MatchCheckInTaskRow[];

  const teamNameById = new Map(teamRows.map((team) => [team.id, team.name?.trim() ?? ""]));
  const captainUserIdByTeamId = new Map(
    teamMemberRows
      .filter((membership) => membership.is_captain)
      .map((membership) => [membership.team_id, membership.user_id])
  );
  const checkInsByMatchId = new Map<string, MatchCheckInTaskRow[]>();

  for (const checkInRow of checkInRows) {
    const existingRows = checkInsByMatchId.get(checkInRow.match_id) ?? [];
    existingRows.push(checkInRow);
    checkInsByMatchId.set(checkInRow.match_id, existingRows);
  }

  for (const match of matchRows) {
    const teamAName = teamNameById.get(match.team_a_id)?.trim() || "Team A";
    const teamBName = teamNameById.get(match.team_b_id)?.trim() || "Team B";
    const hostTeamId = getHostTeamId(match, teamNameById);
    const hostCaptainUserId = captainUserIdByTeamId.get(hostTeamId) ?? null;
    const matchCheckIns = checkInsByMatchId.get(match.id) ?? [];
    const checkedInRows = matchCheckIns.filter((checkInRow) => checkInRow.is_checked_in);
    const normalizedStatus = match.status.trim().toLowerCase();
    const hasReachedLobbyPhase =
      checkedInRows.length > 0 ||
      Boolean(match.lobby_name?.trim()) ||
      Boolean(match.lobby_password?.trim()) ||
      POST_MATCH_STATUSES.has(normalizedStatus);
    const hasEnteredScore =
      match.team_a_score !== null && match.team_b_score !== null;
    const requiredResultScreenshotCount = hasEnteredScore
      ? (match.team_a_score ?? 0) + (match.team_b_score ?? 0)
      : 0;
    const uploadedResultScreenshotCount = normalizeResultScreenshotUrls(match).length;

    if (hostCaptainUserId && hasReachedLobbyPhase && !hasEnteredScore) {
      pushTask({
        taskRecord: tasksByUserId,
        allowedUserIds,
        task: {
          id: `${match.id}:enter_score:${hostCaptainUserId}`,
          userId: hostCaptainUserId,
          matchId: match.id,
          href: `/matches/${match.id}`,
          type: "enter_score",
          label: "Пост-матч",
          title: "Введите счет серии",
          description: `Хост лобби должен зафиксировать итог матча ${teamAName} vs ${teamBName}.`,
          actionLabel: "ВВЕСТИ СЧЕТ",
          roundLabel: formatRoundLabel(match.round_label),
          format: match.format,
          scheduledAt: match.scheduled_at,
          teamAName,
          teamBName,
        },
      });
    }

    if (
      hostCaptainUserId &&
      hasEnteredScore &&
      uploadedResultScreenshotCount < requiredResultScreenshotCount
    ) {
      const missingScreenshotCount =
        requiredResultScreenshotCount - uploadedResultScreenshotCount;

      pushTask({
        taskRecord: tasksByUserId,
        allowedUserIds,
        task: {
          id: `${match.id}:upload_result_screenshots:${hostCaptainUserId}`,
          userId: hostCaptainUserId,
          matchId: match.id,
          href: `/matches/${match.id}`,
          type: "upload_result_screenshots",
          label: "Пост-матч",
          title: "Загрузите скриншоты серии",
          description: `Не хватает ${missingScreenshotCount} скриншотов для матча ${teamAName} vs ${teamBName}.`,
          actionLabel: "ЗАГРУЗИТЬ ФОТО",
          roundLabel: formatRoundLabel(match.round_label),
          format: match.format,
          scheduledAt: match.scheduled_at,
          teamAName,
          teamBName,
        },
      });
    }

    for (const checkInRow of checkedInRows) {
      if (checkInRow.lobby_screenshot_url?.trim()) {
        continue;
      }

      pushTask({
        taskRecord: tasksByUserId,
        allowedUserIds,
        task: {
          id: `${match.id}:complete_stage_two:${checkInRow.player_id}`,
          userId: checkInRow.player_id,
          matchId: match.id,
          href: `/matches/${match.id}`,
          type: "complete_stage_two",
          label: "Этап 2",
          title: "Загрузите фото лобби",
          description: `Для матча ${teamAName} vs ${teamBName} не хватает фото лобби.`,
          actionLabel: "ЗАГРУЗИТЬ ФОТО",
          roundLabel: formatRoundLabel(match.round_label),
          format: match.format,
          scheduledAt: match.scheduled_at,
          teamAName,
          teamBName,
        },
      });
    }
  }

  for (const tasks of Object.values(tasksByUserId)) {
    tasks.sort((taskA, taskB) => {
      const priorityDifference = TASK_PRIORITY[taskA.type] - TASK_PRIORITY[taskB.type];

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const scheduledAtA = taskA.scheduledAt ? new Date(taskA.scheduledAt).getTime() : Infinity;
      const scheduledAtB = taskB.scheduledAt ? new Date(taskB.scheduledAt).getTime() : Infinity;

      if (scheduledAtA !== scheduledAtB) {
        return scheduledAtA - scheduledAtB;
      }

      return taskA.matchId.localeCompare(taskB.matchId);
    });
  }

  return tasksByUserId;
}

export async function listActiveTasksForUser(userId: string) {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId) {
    return [] as ActiveTask[];
  }

  const supabase = getSupabaseBrowserClient();
  const tasksByUserId = await listActiveTasksForUsers(supabase, [trimmedUserId]);

  return tasksByUserId[trimmedUserId] ?? [];
}

export async function getActiveTaskCountForUser(userId: string) {
  const tasks = await listActiveTasksForUser(userId);
  return tasks.length;
}

export async function getActiveTaskCountsForUsers(
  supabase: SupabaseClient<Database>,
  userIds: string[]
) {
  const trimmedUserIds = Array.from(
    new Set(userIds.map((userId) => userId.trim()).filter(Boolean))
  );
  const tasksByUserId = await listActiveTasksForUsers(supabase, trimmedUserIds);

  return trimmedUserIds.reduce<Record<string, number>>((countsByUserId, userId) => {
    countsByUserId[userId] = tasksByUserId[userId]?.length ?? 0;
    return countsByUserId;
  }, {});
}
