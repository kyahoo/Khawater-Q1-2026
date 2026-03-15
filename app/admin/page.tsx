"use client";

import { GroupStageStandingsTable } from "@/components/group-stage-standings-table";
import { TournamentMatchTechnicalBadges } from "@/components/tournament-match-technical-badges";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminForceConfirmTeam,
  adminForceAddPlayerToTeam,
  adminRemovePlayerFromTeam,
  setPlayerMedal,
  type AdminTournamentResultItem,
  createAdminPlayerAction,
  deleteTournament,
  deletePlayer,
  deleteMultipleMatches,
  deleteMatch,
  deleteTeam,
  enableTournamentMatchAdminOverride,
  generateGroupStageMatches,
  listAdminPlayers,
  listAdminTournamentResults,
  recordTournamentResult,
  resetPlayerBehaviorScore,
  resetPlayerDeviceBinding,
  resolveTimedOutTournamentMatch,
  toggleTeamSuspension,
  updateAdminPlayerMMR,
  updateMMRStatus,
  updateTournamentMatchAction,
  type AdminPlayerListItem,
} from "./actions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getPlayerMedalTitle,
  PLAYER_MEDAL_META,
  type PlayerMedalValue,
} from "@/lib/supabase/player-medals";
import {
  getAlmatyWallClockTimeMs,
  getCurrentAlmatyWallClockTimeMs,
  isUserTeamMatchCompleted,
  MATCH_CHECK_IN_TIMEOUT_MS,
  REQUIRED_TEAM_CHECK_INS,
} from "@/lib/supabase/matches";
import {
  getProfileByUserId,
  listProfilesWithTeamMeta,
  type AdminProfileListItem,
  type Profile,
} from "@/lib/supabase/profiles";
import {
  addMemberToTeamAsAdmin,
  createTeamForAdmin,
  getTeamMembers,
  listTeamsWithMeta,
  setTeamCaptainAsAdmin,
  type TeamListItem,
} from "@/lib/supabase/teams";
import {
  createTournamentMatch,
  createTournamentTeamEntry,
  createTournament,
  getTournamentMatchesForTournament,
  listAdminTournamentEntryTeams,
  listTournaments,
  setActiveTournament,
  updateTournamentCheckInThreshold,
  updateTournamentDetails,
  type AdminTournamentEntryTeam,
  type TournamentMatch,
  type Tournament,
} from "@/lib/supabase/tournaments";
import { MATCH_ROUND_OPTIONS } from "@/lib/playoff-bracket";

const EMPTY_MATCH_FORM = {
  teamAId: "",
  teamBId: "",
  roundLabel: "",
  scheduledAt: "",
  status: "scheduled",
  teamAScore: "",
  teamBScore: "",
  format: "BO3",
  requireLobbyPhoto: true,
  lobbyPhotoMap1Only: false,
  requirePhotoUnconfirmedMMROnly: false,
};

const EMPTY_GROUP_STAGE_FORM = {
  tournamentId: "",
  teamIds: [] as string[],
  startDate: "",
  endDate: "",
  dailyStartTime: "18:00",
  dailyEndTime: "23:30",
  format: "BO3",
  matchIntervalMinutes: "90",
};

const MATCH_FORMAT_OPTIONS = ["BO1", "BO2", "BO3"] as const;
const GROUP_STAGE_MATCH_FORMAT_OPTIONS = ["BO1", "BO2", "BO3", "BO5"] as const;

const TOURNAMENT_GROUP_OPTIONS = [1, 2, 4] as const;
const TEAMS_ELIMINATED_OPTIONS = [0, 1, 2, 3, 4] as const;
const PLAYOFF_FORMAT_OPTIONS = [
  "Single Elimination",
  "Double Elimination",
] as const;

const ALMATY_TIME_ZONE = "Asia/Almaty";
const STANDINGS_BACKGROUND_FILE_NAME = "standings-bg.png";
const SCHEDULE_BACKGROUND_FILE_NAME = "schedule-bg.png";
const ACTIVE_MATCH_STATUS_REFRESH_MS = 60 * 1000;

const ADMIN_TABS = [
  { id: "players", label: "Игроки" },
  { id: "teams", label: "Команды" },
  { id: "tournaments", label: "Турниры" },
  { id: "matches", label: "Матчи" },
  { id: "social", label: "Социальные сети" },
] as const;

const MMR_STATUS_OPTIONS = [
  { value: "pending", label: "MMR: ОЖИДАЕТ" },
  { value: "verified", label: "MMR: ПОДТВЕРЖДЕН" },
  { value: "rejected", label: "MMR: ОТКЛОНЕН" },
] as const;

const PLAYER_MEDAL_OPTIONS = [
  { value: "", label: "МЕДАЛЬ: ВЫБРАТЬ" },
  { value: "gold", label: "🥇 ЗОЛОТО" },
  { value: "silver", label: "🥈 СЕРЕБРО" },
  { value: "bronze", label: "🥉 БРОНЗА" },
  { value: "clear", label: "ОЧИСТИТЬ" },
] as const;

const PLAYER_METRIC_BADGE_CLASSNAME =
  "inline-flex h-9 items-center whitespace-nowrap border px-2 text-xs font-black uppercase tracking-[0.16em]";

const PLAYER_METRIC_SELECT_CLASSNAME =
  "h-9 w-fit appearance-none whitespace-nowrap border bg-transparent px-2 text-xs font-black uppercase tracking-[0.16em] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const PLAYER_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-9 items-center justify-center whitespace-nowrap border-2 px-3 text-xs font-black uppercase tracking-[0.16em] transition-all hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none";

const PLAYER_ACTION_BUTTON_YELLOW_CLASSNAME = `${PLAYER_ACTION_BUTTON_CLASSNAME} border-[#061726] bg-yellow-500 text-[#061726] shadow-[2px_2px_0px_0px_#061726]`;

const PLAYER_ACTION_BUTTON_BLUE_CLASSNAME = `${PLAYER_ACTION_BUTTON_CLASSNAME} border-blue-600 bg-blue-500/10 text-blue-600 shadow-[2px_2px_0px_0px_#2563EB] hover:bg-blue-500/20`;

const PLAYER_ACTION_BUTTON_DANGER_CLASSNAME = `${PLAYER_ACTION_BUTTON_CLASSNAME} border-red-800 bg-transparent text-red-500 shadow-[2px_2px_0px_0px_#7F1D1D] hover:bg-red-900/30`;

type AdminTabId = (typeof ADMIN_TABS)[number]["id"];
type ScheduleDayParam = "today" | "tomorrow";
type TournamentPlacement = 1 | 2 | 3;
type AdminMedalSelectionValue = "" | PlayerMedalValue | "clear";
type TimedOutMatchAction = "override" | "technical-defeat";
type TournamentDetailField = "prizePool" | "dates";

function getSupabaseLikeErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "";
    const details =
      "details" in error && typeof error.details === "string"
        ? error.details
        : "";

    if (message && details) {
      return `${message} (${details})`;
    }

    if (message) {
      return message;
    }

    if (details) {
      return details;
    }
  }

  return fallbackMessage;
}

function getTimeZoneDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return {
    year,
    month,
    day,
  };
}

function getTimeZoneDateStamp(dayOffset = 0, timeZone = ALMATY_TIME_ZONE) {
  const currentParts = getTimeZoneDateParts(new Date(), timeZone);
  const date = new Date(
    Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day + dayOffset)
  );
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isTimedOutTournamentMatch(
  match: Pick<
    TournamentMatch,
    | "adminOverride"
    | "scheduledAt"
    | "status"
    | "teamACheckInCount"
    | "teamBCheckInCount"
  >,
  currentTimeMs: number | null
) {
  if (
    currentTimeMs === null ||
    match.adminOverride ||
    isUserTeamMatchCompleted(match) ||
    !match.scheduledAt
  ) {
    return false;
  }

  const scheduledTimeMs = getAlmatyWallClockTimeMs(match.scheduledAt);

  if (
    scheduledTimeMs === null ||
    currentTimeMs <= scheduledTimeMs + MATCH_CHECK_IN_TIMEOUT_MS
  ) {
    return false;
  }

  return (
    match.teamACheckInCount < REQUIRED_TEAM_CHECK_INS ||
    match.teamBCheckInCount < REQUIRED_TEAM_CHECK_INS
  );
}

function renderTemplateStatusBadge(hasBackground: boolean | null) {
  if (hasBackground === true) {
    return (
      <div className="inline-flex w-fit border-2 border-[#061726] bg-[#061726] px-2 py-1 text-xs font-bold uppercase tracking-wide text-[#39FF14]">
        🟢 Фон загружен
      </div>
    );
  }

  if (hasBackground === false) {
    return (
      <div className="inline-flex w-fit border-2 border-[#061726] bg-zinc-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
        🔴 Фон отсутствует
      </div>
    );
  }

  return (
    <div className="inline-flex w-fit border-2 border-[#061726] bg-zinc-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
      ⚪ Проверка...
    </div>
  );
}

function buildTournamentResultSelections(
  results: AdminTournamentResultItem[]
): Record<string, Partial<Record<TournamentPlacement, string>>> {
  return results.reduce<Record<string, Partial<Record<TournamentPlacement, string>>>>(
    (accumulator, result) => {
      const currentTournamentSelections = accumulator[result.tournamentId] ?? {};
      currentTournamentSelections[result.placement] = result.teamId;
      accumulator[result.tournamentId] = currentTournamentSelections;
      return accumulator;
    },
    {}
  );
}

function getMMRStatusSelectClassName(status: AdminPlayerListItem["mmrStatus"]) {
  const baseClassName = PLAYER_METRIC_SELECT_CLASSNAME;

  if (status === "verified") {
    return `${baseClassName} border-green-600 bg-green-500/10 text-green-600`;
  }

  if (status === "rejected") {
    return `${baseClassName} border-red-700 bg-red-500/10 text-red-600`;
  }

  return `${baseClassName} border-[#CD9C3E] bg-[#CD9C3E]/10 text-[#8A6418]`;
}

function getBehaviorScoreBadgeClassName(score: number) {
  if (score >= 4) {
    return `${PLAYER_METRIC_BADGE_CLASSNAME} border-[#CD9C3E] bg-[#CD9C3E]/10 text-[#8A6418]`;
  }

  return `${PLAYER_METRIC_BADGE_CLASSNAME} border-red-700 bg-red-900/20 text-red-600`;
}

function getOpenTaskBadgeClassName(openTaskCount: number) {
  if (openTaskCount > 0) {
    return `${PLAYER_METRIC_BADGE_CLASSNAME} border-red-700 bg-red-900/20 text-red-600`;
  }

  return `${PLAYER_METRIC_BADGE_CLASSNAME} border-gray-600 bg-transparent text-gray-500`;
}

function getMMRValueInputClassName(mmr: number | null) {
  const baseClassName =
    "h-9 w-32 border px-2 py-1 text-center text-xs font-black uppercase tracking-[0.16em] outline-none transition-colors placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-60";

  if (typeof mmr === "number") {
    return `${baseClassName} border-[#061726] bg-[#061726] text-[#CD9C3E] focus:border-[#CD9C3E]`;
  }

  return `${baseClassName} border-gray-600 bg-transparent text-gray-500 focus:border-[#CD9C3E]`;
}

async function getSocialTemplateStatus() {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: files, error } = await supabase.storage
      .from("social-templates")
      .list("", {
        limit: 100,
      });

    if (error) {
      throw error;
    }

    const fileNames = new Set((files ?? []).map((file) => file.name));

    return {
      hasStandingsBackground: fileNames.has(STANDINGS_BACKGROUND_FILE_NAME),
      hasScheduleBackground: fileNames.has(SCHEDULE_BACKGROUND_FILE_NAME),
    };
  } catch (error) {
    console.error("Social template status failed:", error);
    return null;
  }
}

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [entryTeams, setEntryTeams] = useState<AdminTournamentEntryTeam[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [profiles, setProfiles] = useState<AdminProfileListItem[]>([]);
  const [players, setPlayers] = useState<AdminPlayerListItem[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<
    Awaited<ReturnType<typeof getTeamMembers>>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageErrorMessage, setPageErrorMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [entrySectionErrorMessage, setEntrySectionErrorMessage] = useState("");
  const [matchesSectionErrorMessage, setMatchesSectionErrorMessage] = useState("");
  const [teamMembersErrorMessage, setTeamMembersErrorMessage] = useState("");
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newTournamentNumberOfGroups, setNewTournamentNumberOfGroups] = useState("1");
  const [
    newTournamentTeamsEliminatedPerGroup,
    setNewTournamentTeamsEliminatedPerGroup,
  ] = useState("2");
  const [newTournamentPlayoffFormat, setNewTournamentPlayoffFormat] = useState(
    "Single Elimination"
  );
  const [newTournamentPrizePool, setNewTournamentPrizePool] = useState("");
  const [newTournamentDates, setNewTournamentDates] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [newPlayerNickname, setNewPlayerNickname] = useState("");
  const [newPlayerPassword, setNewPlayerPassword] = useState("");
  const [selectedProfileIdToAdd, setSelectedProfileIdToAdd] = useState("");
  const [adminOverridePlayerIdentifier, setAdminOverridePlayerIdentifier] = useState("");
  const [matchForm, setMatchForm] = useState(EMPTY_MATCH_FORM);
  const [groupStageForm, setGroupStageForm] = useState(EMPTY_GROUP_STAGE_FORM);
  const [groupStageTeams, setGroupStageTeams] = useState<AdminTournamentEntryTeam[]>([]);
  const [groupStageErrorMessage, setGroupStageErrorMessage] = useState("");
  const [groupStageSuccessMessage, setGroupStageSuccessMessage] = useState("");
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isForceAddingMember, setIsForceAddingMember] = useState(false);
  const [isSavingMatch, setIsSavingMatch] = useState(false);
  const [isGeneratingGroupStage, setIsGeneratingGroupStage] = useState(false);
  const [isSwitchingTournamentId, setIsSwitchingTournamentId] = useState<
    string | null
  >(null);
  const [isSavingCheckInThresholdTournamentId, setIsSavingCheckInThresholdTournamentId] =
    useState<string | null>(null);
  const [editingTournamentDetailsId, setEditingTournamentDetailsId] = useState<
    string | null
  >(null);
  const [tournamentDetailDrafts, setTournamentDetailDrafts] = useState<
    Record<
      string,
      {
        prizePool: string;
        dates: string;
      }
    >
  >({});
  const [isSavingTournamentDetailsId, setIsSavingTournamentDetailsId] = useState<
    string | null
  >(null);
  const [isEnteringTeamId, setIsEnteringTeamId] = useState<string | null>(null);
  const [isForceConfirmingTeamId, setIsForceConfirmingTeamId] = useState<
    string | null
  >(null);
  const [isSuspendingTeamId, setIsSuspendingTeamId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [isSettingCaptainUserId, setIsSettingCaptainUserId] = useState<
    string | null
  >(null);
  const [isRemovingPlayerUserId, setIsRemovingPlayerUserId] = useState<
    string | null
  >(null);
  const [isDeletingPlayerUserId, setIsDeletingPlayerUserId] = useState<
    string | null
  >(null);
  const [isResettingDeviceUserId, setIsResettingDeviceUserId] = useState<
    string | null
  >(null);
  const [isUpdatingMMRStatusUserId, setIsUpdatingMMRStatusUserId] = useState<
    string | null
  >(null);
  const [isUpdatingPlayerMMRUserId, setIsUpdatingPlayerMMRUserId] = useState<
    string | null
  >(null);
  const [isResettingBehaviorScoreUserId, setIsResettingBehaviorScoreUserId] = useState<
    string | null
  >(null);
  const [playerMedalDrafts, setPlayerMedalDrafts] = useState<
    Record<
      string,
      {
        tournamentId: string;
        medal: AdminMedalSelectionValue;
      }
    >
  >({});
  const [isSavingPlayerMedalUserId, setIsSavingPlayerMedalUserId] = useState<
    string | null
  >(null);
  const [isDeletingTeamId, setIsDeletingTeamId] = useState<string | null>(null);
  const [isDeletingMatchId, setIsDeletingMatchId] = useState<string | null>(null);
  const [pendingTimedOutMatchAction, setPendingTimedOutMatchAction] = useState<{
    matchId: string;
    action: TimedOutMatchAction;
  } | null>(null);
  const [editingLogoTeamId, setEditingLogoTeamId] = useState<string | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [isUploadingLogoTeamId, setIsUploadingLogoTeamId] = useState<string | null>(null);
  const [editingBannerTournamentId, setEditingBannerTournamentId] = useState<string | null>(
    null
  );
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(null);
  const [isUploadingBannerTournamentId, setIsUploadingBannerTournamentId] = useState<
    string | null
  >(null);
  const [isRemovingBannerTournamentId, setIsRemovingBannerTournamentId] = useState<
    string | null
  >(null);
  const [selectedStandingsBackgroundFile, setSelectedStandingsBackgroundFile] =
    useState<File | null>(null);
  const [standingsBackgroundInputKey, setStandingsBackgroundInputKey] = useState(0);
  const [selectedScheduleBackgroundFile, setSelectedScheduleBackgroundFile] =
    useState<File | null>(null);
  const [scheduleBackgroundInputKey, setScheduleBackgroundInputKey] = useState(0);
  const [hasStandingsBackground, setHasStandingsBackground] = useState<boolean | null>(
    null
  );
  const [hasScheduleBackground, setHasScheduleBackground] = useState<boolean | null>(null);
  const [socialErrorMessage, setSocialErrorMessage] = useState("");
  const [socialSuccessMessage, setSocialSuccessMessage] = useState("");
  const [isUploadingStandingsBackground, setIsUploadingStandingsBackground] =
    useState(false);
  const [isUploadingScheduleBackground, setIsUploadingScheduleBackground] =
    useState(false);
  const [isDeletingTournamentId, setIsDeletingTournamentId] = useState<string | null>(null);
  const [isGeneratingStandingsImage, setIsGeneratingStandingsImage] = useState(false);
  const [isGeneratingScheduleDay, setIsGeneratingScheduleDay] = useState<
    ScheduleDayParam | null
  >(null);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTabId>("players");
  const [activeTournamentCheckInThresholdInput, setActiveTournamentCheckInThresholdInput] =
    useState("10");
  const [tournamentResultSelections, setTournamentResultSelections] = useState<
    Record<string, Partial<Record<TournamentPlacement, string>>>
  >({});
  const [isSavingTournamentResultKey, setIsSavingTournamentResultKey] = useState<string | null>(
    null
  );
  const [playerMMRInputs, setPlayerMMRInputs] = useState<Record<string, string>>({});
  const [openPlayerMenuId, setOpenPlayerMenuId] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(() =>
    typeof window === "undefined" ? null : getCurrentAlmatyWallClockTimeMs()
  );
  const [, startMMRUpdateTransition] = useTransition();
  const [, startTournamentDeleteTransition] = useTransition();
  const [isTournamentResultPending, startTournamentResultTransition] = useTransition();
  const playerMenuRef = useRef<HTMLDivElement | null>(null);

  async function getCurrentAdminAccessToken() {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Could not verify the current admin session.");
    }

    return session.access_token;
  }

  async function loadAdminData(accessToken: string) {
    setPageErrorMessage("");
    setEntrySectionErrorMessage("");
    setMatchesSectionErrorMessage("");

    const [
      nextTournaments,
      nextTeams,
      nextProfiles,
      nextPlayersResult,
      nextTournamentResultsResult,
    ] = await Promise.all([
      listTournaments(),
      listTeamsWithMeta(),
      listProfilesWithTeamMeta(),
      listAdminPlayers(accessToken),
      listAdminTournamentResults(accessToken),
    ]);

    if (nextPlayersResult.error) {
      throw new Error(nextPlayersResult.error);
    }

    setTournaments(nextTournaments);
    setTeams(nextTeams);
    setProfiles(nextProfiles);
    setPlayers(nextPlayersResult.players);
    setTournamentResultSelections(
      nextTournamentResultsResult.error
        ? {}
        : buildTournamentResultSelections(nextTournamentResultsResult.results)
    );

    const nextActiveTournament =
      nextTournaments.find((tournament) => tournament.is_active) ?? null;

    if (!nextActiveTournament) {
      setEntryTeams([]);
      setMatches([]);
      return;
    }

    const [entryTeamsResult, matchesResult] = await Promise.allSettled([
      listAdminTournamentEntryTeams(nextActiveTournament.id),
      getTournamentMatchesForTournament(nextActiveTournament.id),
    ]);

    if (entryTeamsResult.status === "fulfilled") {
      setEntryTeams(entryTeamsResult.value);
      setEntrySectionErrorMessage("");
    } else {
      setEntryTeams([]);
      setEntrySectionErrorMessage(
        "Tournament entry data is unavailable right now."
      );
    }

    if (matchesResult.status === "fulfilled") {
      setMatches(matchesResult.value);
      setMatchesSectionErrorMessage("");
    } else {
      setMatches([]);
      setMatchesSectionErrorMessage("Match data is unavailable right now.");
    }
  }

  async function refreshAdminData() {
    const accessToken = await getCurrentAdminAccessToken();
    await loadAdminData(accessToken);
  }

  async function loadSelectedTeamMembers(teamId: string) {
    try {
      const nextTeamMembers = await getTeamMembers(teamId);
      setSelectedTeamMembers(nextTeamMembers);
      setTeamMembersErrorMessage("");
    } catch {
      setSelectedTeamMembers([]);
      setTeamMembersErrorMessage("Team members are unavailable right now.");
    }
  }

  async function loadGroupStageTeams(tournamentId: string) {
    try {
      const nextTeams = await listAdminTournamentEntryTeams(tournamentId);
      setGroupStageTeams(nextTeams);
      setGroupStageErrorMessage("");
    } catch {
      setGroupStageTeams([]);
      setGroupStageErrorMessage(
        "Tournament teams are unavailable right now for group stage generation."
      );
    }
  }

  const loadAdminPage = useEffectEvent(async () => {
    try {
      setPageErrorMessage("");
      setErrorMessage("");
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user ?? null;
      const accessToken = session?.access_token ?? null;

      if (!user || !accessToken) {
        router.replace("/auth");
        return;
      }

      const nextProfile = await getProfileByUserId(user.id);
      setProfile(nextProfile);

      if (!nextProfile?.is_admin) {
        return;
      }

      await loadAdminData(accessToken);
    } catch (error) {
      setPageErrorMessage(
        error instanceof Error ? error.message : "Could not load admin page."
      );
    } finally {
      setIsLoading(false);
    }
  });

  const loadSocialTemplateStatus = useEffectEvent(async () => {
    const status = await getSocialTemplateStatus();

    if (!status) {
      return;
    }

    setHasStandingsBackground(status.hasStandingsBackground);
    setHasScheduleBackground(status.hasScheduleBackground);
  });

  useEffect(() => {
    void loadAdminPage();
  }, [router]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(getCurrentAlmatyWallClockTimeMs());
    }, ACTIVE_MATCH_STATUS_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!openPlayerMenuId) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (
        playerMenuRef.current &&
        event.target instanceof Node &&
        !playerMenuRef.current.contains(event.target)
      ) {
        setOpenPlayerMenuId(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openPlayerMenuId]);

  const activeTournament =
    tournaments.find((tournament) => tournament.is_active) ?? null;
  const hasAdminAccess = profile?.is_admin ?? false;
  const isEditingMatch = editingMatchId !== null;
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const enteredTeams = entryTeams.filter((team) => team.hasEntered && !team.isSuspended);
  const enteredGroupStageTeams = groupStageTeams.filter(
    (team) => team.hasEntered && !team.isSuspended
  );
  const groupStageMatchCount =
    groupStageForm.teamIds.length >= 2
      ? (groupStageForm.teamIds.length * (groupStageForm.teamIds.length - 1)) / 2
      : 0;
  const availableProfilesToAdd = profiles.filter(
    (candidate) => !candidate.currentTeamId
  );

  function getTournamentDetailDraft(tournament: Tournament) {
    return (
      tournamentDetailDrafts[tournament.id] ?? {
        prizePool: tournament.prize_pool ?? "",
        dates: tournament.dates ?? "",
      }
    );
  }

  useEffect(() => {
    if (!selectedTeamId) {
      setSelectedTeamMembers([]);
      return;
    }

    void loadSelectedTeamMembers(selectedTeamId);
  }, [selectedTeamId]);

  useEffect(() => {
    if (!hasAdminAccess) {
      return;
    }

    void loadSocialTemplateStatus();
  }, [hasAdminAccess]);

  useEffect(() => {
    const availableMatchIds = new Set(matches.map((match) => match.id));
    setSelectedMatches((current) => current.filter((matchId) => availableMatchIds.has(matchId)));
  }, [matches]);

  useEffect(() => {
    setPlayerMMRInputs(
      Object.fromEntries(
        players.map((player) => [player.id, typeof player.mmr === "number" ? String(player.mmr) : ""])
      )
    );
  }, [players]);

  useEffect(() => {
    if (tournaments.length === 0) {
      setGroupStageForm(EMPTY_GROUP_STAGE_FORM);
      setGroupStageTeams([]);
      return;
    }

    const fallbackTournamentId = activeTournament?.id ?? tournaments[0]?.id ?? "";

    setGroupStageForm((current) => {
      if (
        current.tournamentId &&
        tournaments.some((tournament) => tournament.id === current.tournamentId)
      ) {
        return current;
      }

      return {
        ...current,
        tournamentId: fallbackTournamentId,
        teamIds: [],
      };
    });
  }, [activeTournament?.id, tournaments]);

  useEffect(() => {
    setActiveTournamentCheckInThresholdInput(
      String(activeTournament?.check_in_threshold ?? 10)
    );
  }, [activeTournament?.check_in_threshold, activeTournament?.id]);

  useEffect(() => {
    if (!groupStageForm.tournamentId) {
      setGroupStageTeams([]);
      return;
    }

    void loadGroupStageTeams(groupStageForm.tournamentId);
  }, [groupStageForm.tournamentId]);

  useEffect(() => {
    const validTeamIds = new Set(
      groupStageTeams
        .filter((team) => team.hasEntered)
        .map((team) => team.id)
    );

    setGroupStageForm((current) => {
      const nextTeamIds = current.teamIds.filter((teamId) => validTeamIds.has(teamId));

      if (nextTeamIds.length === current.teamIds.length) {
        return current;
      }

      return {
        ...current,
        teamIds: nextTeamIds,
      };
    });
  }, [groupStageTeams]);

  async function handleCreateTournament() {
    const trimmedName = newTournamentName.trim();
    const trimmedPrizePool = newTournamentPrizePool.trim();
    const trimmedDates = newTournamentDates.trim();

    if (!trimmedName) {
      setErrorMessage("Tournament name is required.");
      return;
    }

    setIsCreatingTournament(true);
    setErrorMessage("");

    try {
      const createdTournament = await createTournament({
        name: trimmedName,
        numberOfGroups: Number(newTournamentNumberOfGroups),
        teamsEliminatedPerGroup: Number(newTournamentTeamsEliminatedPerGroup),
        playoffFormat: newTournamentPlayoffFormat,
        prizePool: trimmedPrizePool,
        dates: trimmedDates,
      });
      setTournaments((current) => [createdTournament, ...current]);
      setNewTournamentName("");
      setNewTournamentNumberOfGroups("1");
      setNewTournamentTeamsEliminatedPerGroup("2");
      setNewTournamentPlayoffFormat("Single Elimination");
      setNewTournamentPrizePool("");
      setNewTournamentDates("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create tournament."
      );
    } finally {
      setIsCreatingTournament(false);
    }
  }

  async function handleCreatePlayer() {
    const email = newPlayerEmail.trim();
    const nickname = newPlayerNickname.trim();

    if (!email || !nickname || !newPlayerPassword) {
      setErrorMessage("Email, nickname, and password are required.");
      return;
    }

    setIsCreatingPlayer(true);
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();

      const result = await createAdminPlayerAction({
        accessToken,
        email,
        nickname,
        password: newPlayerPassword,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      setNewPlayerEmail("");
      setNewPlayerNickname("");
      setNewPlayerPassword("");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create player."
      );
    } finally {
      setIsCreatingPlayer(false);
    }
  }

  async function handleDeletePlayer(userId: string) {
    const shouldDelete = window.confirm(
      "Delete this player account permanently? This cannot be undone."
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingPlayerUserId(userId);
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();
      const result = await deletePlayer(userId, accessToken);

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete player."
      );
    } finally {
      setIsDeletingPlayerUserId(null);
    }
  }

  async function handleResetPlayerDeviceBinding(userId: string) {
    const shouldReset = window.confirm(
      "Вы уверены, что хотите сбросить биометрию для этого игрока?"
    );

    if (!shouldReset) {
      return;
    }

    setIsResettingDeviceUserId(userId);
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();
      const result = await resetPlayerDeviceBinding(userId, accessToken);

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      window.alert("Биометрия успешно сброшена");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ошибка: не удалось сбросить биометрию";
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось сбросить биометрию."
      );
      window.alert(`Ошибка: ${message}`);
    } finally {
      setIsResettingDeviceUserId(null);
    }
  }

  async function handleUpdateMMRStatus(
    userId: string,
    newStatus: AdminPlayerListItem["mmrStatus"]
  ) {
    setIsUpdatingMMRStatusUserId(userId);
    setErrorMessage("");

    try {
      const result = await updateMMRStatus(userId, newStatus);

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось обновить статус MMR."
      );
    } finally {
      setIsUpdatingMMRStatusUserId(null);
    }
  }

  function handlePlayerMMRInputChange(userId: string, nextValue: string) {
    setPlayerMMRInputs((current) => ({
      ...current,
      [userId]: nextValue,
    }));
  }

  function handleSavePlayerMMR(userId: string) {
    if (isUpdatingPlayerMMRUserId === userId) {
      return;
    }

    const currentPlayer = players.find((player) => player.id === userId);

    if (!currentPlayer) {
      return;
    }

    const draftValue = playerMMRInputs[userId] ?? "";
    const trimmedDraftValue = draftValue.trim();
    const normalizedMMR = trimmedDraftValue === "" ? null : Number(trimmedDraftValue);

    if (
      normalizedMMR !== null &&
      (!Number.isInteger(normalizedMMR) || normalizedMMR <= 0)
    ) {
      setErrorMessage("Укажите корректный текущий MMR.");
      return;
    }

    if (currentPlayer.mmr === normalizedMMR) {
      return;
    }

    setErrorMessage("");
    setIsUpdatingPlayerMMRUserId(userId);

    startMMRUpdateTransition(() => {
      void (async () => {
        try {
          const result = await updateAdminPlayerMMR(userId, normalizedMMR);

          if (result.error) {
            throw new Error(result.error);
          }

          setPlayers((current) =>
            current.map((player) =>
              player.id === userId
                ? {
                    ...player,
                    mmr: normalizedMMR,
                  }
                : player
            )
          );
          setPlayerMMRInputs((current) => ({
            ...current,
            [userId]: normalizedMMR === null ? "" : String(normalizedMMR),
          }));

          await refreshAdminData();
          router.refresh();
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Не удалось обновить MMR игрока."
          );
          setPlayerMMRInputs((current) => ({
            ...current,
            [userId]:
              typeof currentPlayer.mmr === "number" ? String(currentPlayer.mmr) : "",
          }));
        } finally {
          setIsUpdatingPlayerMMRUserId(null);
        }
      })();
    });
  }

  async function handleResetPlayerBehaviorScore(userId: string) {
    setIsResettingBehaviorScoreUserId(userId);
    setErrorMessage("");

    try {
      const result = await resetPlayerBehaviorScore(userId);

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось сбросить балл поведения."
      );
    } finally {
      setIsResettingBehaviorScoreUserId(null);
    }
  }

  function handlePlayerMedalDraftChange(
    userId: string,
    field: "tournamentId" | "medal",
    value: string
  ) {
    setPlayerMedalDrafts((current) => ({
      ...current,
      [userId]: {
        tournamentId:
          field === "tournamentId"
            ? value
            : (current[userId]?.tournamentId ?? activeTournament?.id ?? tournaments[0]?.id ?? ""),
        medal:
          field === "medal"
            ? (value as AdminMedalSelectionValue)
            : (current[userId]?.medal ?? ""),
      },
    }));
  }

  async function handleSavePlayerMedal(userId: string) {
    const draft = playerMedalDrafts[userId];
    const tournamentId =
      draft?.tournamentId?.trim() ?? activeTournament?.id ?? tournaments[0]?.id ?? "";
    const medal = draft?.medal ?? "";

    if (!tournamentId) {
      setErrorMessage("Сначала выберите турнир для медали.");
      return;
    }

    if (!medal) {
      setErrorMessage("Сначала выберите медаль или действие очистки.");
      return;
    }

    setIsSavingPlayerMedalUserId(userId);
    setErrorMessage("");

    try {
      const result = await setPlayerMedal(
        userId,
        tournamentId,
        medal === "clear" ? null : medal
      );

      if (result.error) {
        throw new Error(result.error);
      }

      setPlayerMedalDrafts((current) => ({
        ...current,
        [userId]: {
          tournamentId,
          medal: "",
        },
      }));
      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось обновить медаль игрока."
      );
    } finally {
      setIsSavingPlayerMedalUserId(null);
    }
  }

  async function handleClearPlayerMedal(userId: string, tournamentId: string) {
    setIsSavingPlayerMedalUserId(userId);
    setErrorMessage("");

    try {
      const result = await setPlayerMedal(userId, tournamentId, null);

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось удалить медаль игрока."
      );
    } finally {
      setIsSavingPlayerMedalUserId(null);
    }
  }

  async function handleDeleteTeam(teamId: string) {
    const shouldDelete = window.confirm(
      "Delete this team and all related team memberships, entries, and matches? This cannot be undone."
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingTeamId(teamId);
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();
      const result = await deleteTeam(teamId, accessToken);

      if (result.error) {
        throw new Error(result.error);
      }

      if (selectedTeamId === teamId) {
        setSelectedTeamId(null);
        setSelectedTeamMembers([]);
      }

      if (editingLogoTeamId === teamId) {
        setEditingLogoTeamId(null);
        setSelectedLogoFile(null);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete team."
      );
    } finally {
      setIsDeletingTeamId(null);
    }
  }

  async function handleDeleteMatch(matchId: string) {
    const shouldDelete = window.confirm("Are you sure you want to delete this match?");

    if (!shouldDelete) {
      return;
    }

    setIsDeletingMatchId(matchId);
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();
      const result = await deleteMatch(matchId, accessToken);

      if (result.error) {
        throw new Error(result.error);
      }

      if (editingMatchId === matchId) {
        resetMatchForm();
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete match.";
      setErrorMessage(message);
      window.alert(message);
    } finally {
      setIsDeletingMatchId(null);
    }
  }

  async function handleEnableMatchAdminOverride(matchId: string) {
    setPendingTimedOutMatchAction({
      matchId,
      action: "override",
    });
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();
      const result = await enableTournamentMatchAdminOverride(matchId, accessToken);

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not enable admin override for this match.";
      setErrorMessage(message);
      window.alert(message);
    } finally {
      setPendingTimedOutMatchAction((current) =>
        current?.matchId === matchId && current.action === "override" ? null : current
      );
    }
  }

  async function handleResolveTimedOutMatch(matchId: string) {
    const shouldResolve = window.confirm(
      "Оформить техническое поражение и завершить этот матч?"
    );

    if (!shouldResolve) {
      return;
    }

    setPendingTimedOutMatchAction({
      matchId,
      action: "technical-defeat",
    });
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();
      const result = await resolveTimedOutTournamentMatch(matchId, accessToken);

      if (result.error) {
        throw new Error(result.error);
      }

      if (editingMatchId === matchId) {
        resetMatchForm();
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not apply a technical result to this match.";
      setErrorMessage(message);
      window.alert(message);
    } finally {
      setPendingTimedOutMatchAction((current) =>
        current?.matchId === matchId && current.action === "technical-defeat"
          ? null
          : current
      );
    }
  }

  async function handleDeleteSelectedMatches() {
    if (selectedMatches.length === 0) {
      return;
    }

    const shouldDelete = window.confirm(
      `Are you sure you want to delete these ${selectedMatches.length} matches?`
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingMatchId("__bulk__");
    setErrorMessage("");

    try {
      const accessToken = await getCurrentAdminAccessToken();
      const result = await deleteMultipleMatches(selectedMatches, accessToken);

      if (result.error) {
        throw new Error(result.error);
      }

      if (editingMatchId && selectedMatches.includes(editingMatchId)) {
        resetMatchForm();
      }

      setSelectedMatches([]);
      await refreshAdminData();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not delete selected matches.";
      setErrorMessage(message);
      window.alert(message);
    } finally {
      setIsDeletingMatchId(null);
    }
  }

  function toggleSelectedMatch(matchId: string) {
    setSelectedMatches((current) =>
      current.includes(matchId)
        ? current.filter((currentMatchId) => currentMatchId !== matchId)
        : [...current, matchId]
    );
  }

  async function handleSetActiveTournament(tournamentId: string) {
    setIsSwitchingTournamentId(tournamentId);
    setErrorMessage("");

    try {
      await setActiveTournament(tournamentId);
      await refreshAdminData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not update active tournament."
      );
    } finally {
      setIsSwitchingTournamentId(null);
    }
  }

  function handleToggleTournamentDetailsEditor(tournament: Tournament) {
    setTournamentDetailDrafts((current) => ({
      ...current,
      [tournament.id]: {
        prizePool: tournament.prize_pool ?? "",
        dates: tournament.dates ?? "",
      },
    }));
    setEditingTournamentDetailsId((current) =>
      current === tournament.id ? null : tournament.id
    );
    setErrorMessage("");
  }

  function handleTournamentDetailDraftChange(
    tournament: Tournament,
    field: TournamentDetailField,
    value: string
  ) {
    setTournamentDetailDrafts((current) => ({
      ...current,
      [tournament.id]: {
        ...(current[tournament.id] ?? {
          prizePool: tournament.prize_pool ?? "",
          dates: tournament.dates ?? "",
        }),
        [field]: value,
      },
    }));
  }

  async function handleSaveTournamentDetails(tournamentId: string) {
    const tournament = tournaments.find((item) => item.id === tournamentId);

    if (!tournament) {
      setErrorMessage("Tournament could not be found.");
      return;
    }

    const draft = tournamentDetailDrafts[tournamentId] ?? {
      prizePool: tournament.prize_pool ?? "",
      dates: tournament.dates ?? "",
    };

    setIsSavingTournamentDetailsId(tournamentId);
    setErrorMessage("");

    try {
      const updatedTournament = await updateTournamentDetails(tournamentId, {
        prizePool: draft.prizePool.trim() || null,
        dates: draft.dates.trim() || null,
      });

      setTournaments((current) =>
        current.map((currentTournament) =>
          currentTournament.id === tournamentId ? updatedTournament : currentTournament
        )
      );
      setTournamentDetailDrafts((current) => ({
        ...current,
        [tournamentId]: {
          prizePool: updatedTournament.prize_pool ?? "",
          dates: updatedTournament.dates ?? "",
        },
      }));
      setEditingTournamentDetailsId(null);

      try {
        await refreshAdminData();
      } catch (refreshError) {
        console.error("Tournament detail refresh failed:", refreshError);
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update tournament details."
      );
    } finally {
      setIsSavingTournamentDetailsId(null);
    }
  }

  function handleDeleteTournament(tournamentId: string) {
    const shouldDelete = window.confirm(
      "Вы уверены, что хотите удалить этот турнир? Это действие необратимо."
    );

    if (!shouldDelete) {
      return;
    }

    setErrorMessage("");
    setIsDeletingTournamentId(tournamentId);

    startTournamentDeleteTransition(() => {
      void (async () => {
        try {
          const result = await deleteTournament(tournamentId);

          if (result.error) {
            throw new Error(result.error);
          }

          if (editingBannerTournamentId === tournamentId) {
            setEditingBannerTournamentId(null);
            setSelectedBannerFile(null);
          }

          if (editingTournamentDetailsId === tournamentId) {
            setEditingTournamentDetailsId(null);
          }

          setTournamentDetailDrafts((current) => {
            if (!current[tournamentId]) {
              return current;
            }

            const next = { ...current };
            delete next[tournamentId];
            return next;
          });

          await refreshAdminData();
          router.refresh();
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not delete tournament."
          );
        } finally {
          setIsDeletingTournamentId(null);
        }
      })();
    });
  }

  function handleTournamentResultSelectionChange(
    tournamentId: string,
    placement: TournamentPlacement,
    teamId: string
  ) {
    setTournamentResultSelections((current) => ({
      ...current,
      [tournamentId]: {
        ...(current[tournamentId] ?? {}),
        [placement]: teamId,
      },
    }));
  }

  async function handleRecordTournamentResult(
    tournamentId: string,
    placement: TournamentPlacement
  ) {
    const teamId = tournamentResultSelections[tournamentId]?.[placement]?.trim() ?? "";
    const resultKey = `${tournamentId}:${placement}`;

    setIsSavingTournamentResultKey(resultKey);
    setErrorMessage("");

    startTournamentResultTransition(() => {
      void (async () => {
        try {
          const result = await recordTournamentResult(tournamentId, teamId || null, placement);

          if (result.error) {
            throw new Error(result.error);
          }

          setTournamentResultSelections((current) => ({
            ...current,
            [tournamentId]: {
              ...(current[tournamentId] ?? {}),
              [placement]: teamId,
            },
          }));

          await refreshAdminData();
          router.refresh();
          window.alert("Результат успешно сохранен!");
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Не удалось сохранить результат турнира."
          );
        } finally {
          setIsSavingTournamentResultKey(null);
        }
      })();
    });
  }

  async function handleSaveActiveTournamentCheckInThreshold() {
    if (!activeTournament) {
      setErrorMessage("No active tournament selected yet.");
      return;
    }

    const parsedThreshold = Number.parseInt(
      activeTournamentCheckInThresholdInput.trim(),
      10
    );

    if (!Number.isInteger(parsedThreshold) || parsedThreshold < 1) {
      setErrorMessage("Check-in threshold must be a whole number greater than 0.");
      return;
    }

    setIsSavingCheckInThresholdTournamentId(activeTournament.id);
    setErrorMessage("");

    try {
      await updateTournamentCheckInThreshold(activeTournament.id, parsedThreshold);
      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not update the active tournament check-in threshold."
      );
    } finally {
      setIsSavingCheckInThresholdTournamentId(null);
    }
  }

  async function handleCreateTeam() {
    const trimmedName = newTeamName.trim();

    if (!trimmedName) {
      setErrorMessage("Team name is required.");
      return;
    }

    if (!profile) {
      setErrorMessage("Admin profile not loaded.");
      return;
    }

    setIsCreatingTeam(true);
    setErrorMessage("");

    try {
      const createdTeam = await createTeamForAdmin({
        userId: profile.id,
        name: trimmedName,
      });

      await refreshAdminData();
      setSelectedTeamId(createdTeam.id);
      setNewTeamName("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create team."
      );
    } finally {
      setIsCreatingTeam(false);
    }
  }

  function handleToggleTeamLogoEditor(teamId: string) {
    setSelectedTeamId(teamId);
    setSelectedLogoFile(null);
    setEditingLogoTeamId((current) => (current === teamId ? null : teamId));
    setErrorMessage("");
  }

  function handleToggleTournamentBannerEditor(tournamentId: string) {
    setSelectedBannerFile(null);
    setEditingBannerTournamentId((current) =>
      current === tournamentId ? null : tournamentId
    );
    setErrorMessage("");
  }

  async function handleSaveTeamLogo(teamId: string) {
    if (!selectedLogoFile) {
      setErrorMessage("Выберите файл логотипа.");
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(selectedLogoFile.type)) {
      setErrorMessage("Поддерживаются только PNG, JPEG и WEBP.");
      return;
    }

    setIsUploadingLogoTeamId(teamId);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const extensionByType: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      };
      const fileExtension =
        extensionByType[selectedLogoFile.type] ??
        selectedLogoFile.name.split(".").pop()?.toLowerCase() ??
        "png";
      const filePath = `${teamId}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from("team-logos")
        .upload(filePath, selectedLogoFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: selectedLogoFile.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("team-logos").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("teams")
        .update({ logo_url: publicUrl })
        .eq("id", teamId);

      if (updateError) {
        throw updateError;
      }

      await refreshAdminData();
      setEditingLogoTeamId(null);
      setSelectedLogoFile(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        getSupabaseLikeErrorMessage(error, "Не удалось загрузить логотип команды.")
      );
    } finally {
      setIsUploadingLogoTeamId(null);
    }
  }

  async function handleSaveTournamentBanner(tournamentId: string) {
    if (!selectedBannerFile) {
      setErrorMessage("Выберите файл баннера.");
      window.alert("Ошибка: не удалось загрузить баннер");
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(selectedBannerFile.type)) {
      setErrorMessage("Поддерживаются только PNG, JPEG и WEBP.");
      window.alert("Ошибка: не удалось загрузить баннер");
      return;
    }

    setIsUploadingBannerTournamentId(tournamentId);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const extensionByType: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      };
      const fileExtension =
        extensionByType[selectedBannerFile.type] ??
        selectedBannerFile.name.split(".").pop()?.toLowerCase() ??
        "png";
      const filePath = `${tournamentId}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from("tournament-banners")
        .upload(filePath, selectedBannerFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: selectedBannerFile.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("tournament-banners").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("tournaments")
        .update({ banner_url: publicUrl })
        .eq("id", tournamentId);

      if (updateError) {
        throw updateError;
      }

      await refreshAdminData();
      setEditingBannerTournamentId(null);
      setSelectedBannerFile(null);
      window.alert("Баннер успешно загружен");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        getSupabaseLikeErrorMessage(error, "Не удалось загрузить баннер турнира.")
      );
      window.alert("Ошибка: не удалось загрузить баннер");
    } finally {
      setIsUploadingBannerTournamentId(null);
    }
  }

  async function handleRemoveBanner(tournamentId: string) {
    setIsRemovingBannerTournamentId(tournamentId);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from("tournaments")
        .update({ banner_url: null })
        .eq("id", tournamentId);

      if (updateError) {
        throw updateError;
      }

      if (editingBannerTournamentId === tournamentId) {
        setEditingBannerTournamentId(null);
        setSelectedBannerFile(null);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        getSupabaseLikeErrorMessage(error, "Не удалось удалить баннер турнира.")
      );
    } finally {
      setIsRemovingBannerTournamentId(null);
    }
  }

  async function handleUploadStandingsBackground() {
    if (!selectedStandingsBackgroundFile) {
      setSocialErrorMessage("Выберите PNG-файл шаблона.");
      setSocialSuccessMessage("");
      return;
    }

    if (selectedStandingsBackgroundFile.type !== "image/png") {
      setSocialErrorMessage("Для фона таблицы поддерживается только PNG.");
      setSocialSuccessMessage("");
      return;
    }

    setIsUploadingStandingsBackground(true);
    setSocialErrorMessage("");
    setSocialSuccessMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("social-templates")
        .upload(STANDINGS_BACKGROUND_FILE_NAME, selectedStandingsBackgroundFile, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/png",
        });

      if (uploadError) {
        throw uploadError;
      }

      setHasStandingsBackground(true);
      setSelectedStandingsBackgroundFile(null);
      setStandingsBackgroundInputKey((current) => current + 1);
      setSocialSuccessMessage("Фон таблицы успешно загружен.");
      void (async () => {
        const status = await getSocialTemplateStatus();

        if (!status) {
          return;
        }

        setHasStandingsBackground(status.hasStandingsBackground);
        setHasScheduleBackground(status.hasScheduleBackground);
      })();
    } catch (error) {
      setSocialErrorMessage(
        getSupabaseLikeErrorMessage(error, "Не удалось загрузить фон таблицы.")
      );
    } finally {
      setIsUploadingStandingsBackground(false);
    }
  }

  async function handleUploadScheduleBackground() {
    if (!selectedScheduleBackgroundFile) {
      setSocialErrorMessage("Выберите PNG-файл шаблона расписания.");
      setSocialSuccessMessage("");
      return;
    }

    if (selectedScheduleBackgroundFile.type !== "image/png") {
      setSocialErrorMessage("Для фона расписания поддерживается только PNG.");
      setSocialSuccessMessage("");
      return;
    }

    setIsUploadingScheduleBackground(true);
    setSocialErrorMessage("");
    setSocialSuccessMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("social-templates")
        .upload(SCHEDULE_BACKGROUND_FILE_NAME, selectedScheduleBackgroundFile, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/png",
        });

      if (uploadError) {
        throw uploadError;
      }

      setHasScheduleBackground(true);
      setSelectedScheduleBackgroundFile(null);
      setScheduleBackgroundInputKey((current) => current + 1);
      setSocialSuccessMessage("Фон расписания успешно загружен.");
      void (async () => {
        const status = await getSocialTemplateStatus();

        if (!status) {
          return;
        }

        setHasStandingsBackground(status.hasStandingsBackground);
        setHasScheduleBackground(status.hasScheduleBackground);
      })();
    } catch (error) {
      setSocialErrorMessage(
        getSupabaseLikeErrorMessage(error, "Не удалось загрузить фон расписания.")
      );
    } finally {
      setIsUploadingScheduleBackground(false);
    }
  }

  async function downloadSocialImage(params: {
    url: string;
    fileName: string;
    successMessage: string;
    fallbackErrorMessage: string;
  }) {
    const response = await fetch(params.url, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? params.fallbackErrorMessage);
      }

      const message = await response.text();
      throw new Error(message || params.fallbackErrorMessage);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = params.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    setSocialSuccessMessage(params.successMessage);
  }

  async function handleDownloadStandingsImage() {
    if (!activeTournament) {
      setSocialErrorMessage("Сначала выберите активный турнир.");
      setSocialSuccessMessage("");
      return;
    }

    setIsGeneratingStandingsImage(true);
    setSocialErrorMessage("");
    setSocialSuccessMessage("");

    try {
      await downloadSocialImage({
        url: "/api/og/standings",
        fileName: `khawater-standings-${getTimeZoneDateStamp()}.png`,
        successMessage: "Таблица успешно скачана.",
        fallbackErrorMessage: "Не удалось сгенерировать таблицу.",
      });
    } catch (error) {
      setSocialErrorMessage(
        error instanceof Error ? error.message : "Не удалось скачать таблицу."
      );
    } finally {
      setIsGeneratingStandingsImage(false);
    }
  }

  async function handleDownloadScheduleImage(day: ScheduleDayParam) {
    if (!activeTournament) {
      setSocialErrorMessage("Сначала выберите активный турнир.");
      setSocialSuccessMessage("");
      return;
    }

    setIsGeneratingScheduleDay(day);
    setSocialErrorMessage("");
    setSocialSuccessMessage("");

    try {
      await downloadSocialImage({
        url: `/api/og/schedule?day=${day}`,
        fileName: `khawater-schedule-${getTimeZoneDateStamp(
          day === "tomorrow" ? 1 : 0
        )}.png`,
        successMessage:
          day === "today"
            ? "Расписание на сегодня успешно скачано."
            : "Расписание на завтра успешно скачано.",
        fallbackErrorMessage: "Не удалось сгенерировать расписание.",
      });
    } catch (error) {
      setSocialErrorMessage(
        error instanceof Error ? error.message : "Не удалось скачать расписание."
      );
    } finally {
      setIsGeneratingScheduleDay(null);
    }
  }

  async function handleAddMemberToTeam() {
    if (!selectedTeamId || !selectedProfileIdToAdd) {
      setErrorMessage("Select a team and player first.");
      return;
    }

    setIsAddingMember(true);
    setErrorMessage("");

    try {
      await addMemberToTeamAsAdmin({
        teamId: selectedTeamId,
        userId: selectedProfileIdToAdd,
      });
      await refreshAdminData();
      await loadSelectedTeamMembers(selectedTeamId);
      setSelectedProfileIdToAdd("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not add player to team."
      );
    } finally {
      setIsAddingMember(false);
    }
  }

  async function handleSetCaptain(userId: string) {
    if (!selectedTeamId) {
      return;
    }

    setIsSettingCaptainUserId(userId);
    setErrorMessage("");

    try {
      await setTeamCaptainAsAdmin({
        teamId: selectedTeamId,
        userId,
      });
      await refreshAdminData();
      await loadSelectedTeamMembers(selectedTeamId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update captain."
      );
    } finally {
      setIsSettingCaptainUserId(null);
    }
  }

  async function handleForceAddMemberToTeam() {
    if (!selectedTeamId) {
      return;
    }

    const trimmedIdentifier = adminOverridePlayerIdentifier.trim();

    if (!trimmedIdentifier) {
      setErrorMessage("Enter a player ID, email, or username first.");
      return;
    }

    setIsForceAddingMember(true);
    setErrorMessage("");

    try {
      const result = await adminForceAddPlayerToTeam(
        selectedTeamId,
        trimmedIdentifier
      );

      if (result.error) {
        throw new Error(result.error);
      }

      setErrorMessage("");
      setAdminOverridePlayerIdentifier("");
      await refreshAdminData();
      await loadSelectedTeamMembers(selectedTeamId);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not force add player to team."
      );
    } finally {
      setIsForceAddingMember(false);
    }
  }

  async function handleRemovePlayerFromTeam(userId: string) {
    if (!selectedTeamId) {
      return;
    }

    setIsRemovingPlayerUserId(userId);
    setErrorMessage("");

    try {
      const result = await adminRemovePlayerFromTeam(selectedTeamId, userId);

      if (result.error) {
        throw new Error(result.error);
      }

      setErrorMessage("");
      await refreshAdminData();
      await loadSelectedTeamMembers(selectedTeamId);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not remove player from team."
      );
    } finally {
      setIsRemovingPlayerUserId(null);
    }
  }

  async function handleEnterTeamIntoActiveTournament(teamId: string) {
    if (!activeTournament || !profile) {
      setErrorMessage("Active tournament or admin profile is missing.");
      return;
    }

    setIsEnteringTeamId(teamId);
    setErrorMessage("");

    try {
      await createTournamentTeamEntry({
        tournamentId: activeTournament.id,
        teamId,
        enteredBy: profile.id,
      });
      await refreshAdminData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not enter team into tournament."
      );
    } finally {
      setIsEnteringTeamId(null);
    }
  }

  async function handleForceConfirmRoster(teamId: string) {
    if (!activeTournament) {
      setErrorMessage("No active tournament selected yet.");
      return;
    }

    setIsForceConfirmingTeamId(teamId);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Could not verify the current admin session.");
      }

      const result = await adminForceConfirmTeam(
        teamId,
        activeTournament.id,
        session.access_token
      );

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not force confirm this roster."
      );
    } finally {
      setIsForceConfirmingTeamId(null);
    }
  }

  async function handleToggleTeamSuspension(teamId: string, isSuspended: boolean) {
    if (!activeTournament) {
      setErrorMessage("No active tournament selected yet.");
      return;
    }

    setIsSuspendingTeamId(teamId);
    setErrorMessage("");

    try {
      const result = await toggleTeamSuspension(
        activeTournament.id,
        teamId,
        isSuspended
      );

      if (result.error) {
        throw new Error(result.error);
      }

      setErrorMessage("");
      await refreshAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not update team suspension."
      );
    } finally {
      setIsSuspendingTeamId(null);
    }
  }

  function resetMatchForm() {
    setEditingMatchId(null);
    setMatchForm(EMPTY_MATCH_FORM);
  }

  function toDateTimeLocalValue(value: string | null) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    const offsetInMs = date.getTimezoneOffset() * 60 * 1000;

    return new Date(date.getTime() - offsetInMs).toISOString().slice(0, 16);
  }

  function toUtcIsoString(value: string) {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return "";
    }

    const date = new Date(trimmedValue);

    if (Number.isNaN(date.getTime())) {
      throw new Error("Enter a valid scheduled date and time.");
    }

    return date.toISOString();
  }

  function handleEditMatch(match: TournamentMatch) {
    setEditingMatchId(match.id);
    setMatchForm({
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      roundLabel: match.roundLabel,
      scheduledAt: toDateTimeLocalValue(match.scheduledAt),
      status: match.status,
      teamAScore: match.teamAScore === null ? "" : String(match.teamAScore),
      teamBScore: match.teamBScore === null ? "" : String(match.teamBScore),
      format: match.format,
      requireLobbyPhoto: match.requireLobbyPhoto,
      lobbyPhotoMap1Only: match.requireLobbyPhoto
        ? match.lobbyPhotoMap1Only
        : false,
      requirePhotoUnconfirmedMMROnly: match.requireLobbyPhoto
        ? match.requirePhotoUnconfirmedMMROnly
        : false,
    });
  }

  async function handleSaveMatch() {
    if (!activeTournament) {
      setErrorMessage("No active tournament selected yet.");
      return;
    }

    if (!matchForm.teamAId || !matchForm.teamBId) {
      setErrorMessage("Select both Team A and Team B.");
      return;
    }

    if (!matchForm.roundLabel) {
      setErrorMessage("Select a round label.");
      return;
    }

    const enteredTeamIds = new Set(enteredTeams.map((team) => team.id));

    if (
      !enteredTeamIds.has(matchForm.teamAId) ||
      !enteredTeamIds.has(matchForm.teamBId)
    ) {
      setErrorMessage("Only teams already entered into the active tournament can be used.");
      return;
    }

    setIsSavingMatch(true);
    setErrorMessage("");

    try {
      const scheduledAtIso = toUtcIsoString(matchForm.scheduledAt);
      const requireLobbyPhoto = Boolean(matchForm.requireLobbyPhoto);
      const lobbyPhotoMap1Only = Boolean(
        requireLobbyPhoto && matchForm.lobbyPhotoMap1Only
      );
      const requirePhotoUnconfirmedMMROnly = Boolean(
        requireLobbyPhoto && matchForm.requirePhotoUnconfirmedMMROnly
      );

      if (editingMatchId) {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("Could not verify the current admin session.");
        }

        const result = await updateTournamentMatchAction({
          accessToken: session.access_token,
          matchId: editingMatchId,
          tournamentId: activeTournament.id,
          ...matchForm,
          scheduledAt: scheduledAtIso,
          requireLobbyPhoto,
          lobbyPhotoMap1Only,
          requirePhotoUnconfirmedMMROnly,
        });

        if (result.error) {
          throw new Error(result.error);
        }
      } else {
        await createTournamentMatch({
          tournamentId: activeTournament.id,
          teamAId: matchForm.teamAId,
          teamBId: matchForm.teamBId,
          roundLabel: matchForm.roundLabel,
          scheduledAt: scheduledAtIso,
          format: matchForm.format,
          requireLobbyPhoto,
          lobbyPhotoMap1Only,
          requirePhotoUnconfirmedMMROnly,
        });
      }

      await refreshAdminData();
      resetMatchForm();
    } catch (error) {
      console.error("Supabase Match Creation Error:", error);
      setErrorMessage(getSupabaseLikeErrorMessage(error, "Could not save match."));
    } finally {
      setIsSavingMatch(false);
    }
  }

  async function handleGenerateGroupStage() {
    if (!groupStageForm.tournamentId) {
      setGroupStageErrorMessage("Select a tournament.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (groupStageForm.teamIds.length < 2) {
      setGroupStageErrorMessage("Select at least two teams.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (!groupStageForm.startDate.trim()) {
      setGroupStageErrorMessage("Enter a start date.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (!groupStageForm.endDate.trim()) {
      setGroupStageErrorMessage("Enter an end date.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (!groupStageForm.dailyStartTime.trim()) {
      setGroupStageErrorMessage("Enter a daily start time.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (!groupStageForm.dailyEndTime.trim()) {
      setGroupStageErrorMessage("Enter a daily end time.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (!groupStageForm.matchIntervalMinutes.trim()) {
      setGroupStageErrorMessage("Enter the match interval in minutes.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (groupStageForm.startDate > groupStageForm.endDate) {
      setGroupStageErrorMessage("Start date must be on or before the end date.");
      setGroupStageSuccessMessage("");
      return;
    }

    if (groupStageForm.dailyStartTime >= groupStageForm.dailyEndTime) {
      setGroupStageErrorMessage(
        "Daily start time must be earlier than the daily end time."
      );
      setGroupStageSuccessMessage("");
      return;
    }

    const intervalMinutes = Number(groupStageForm.matchIntervalMinutes);

    if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
      setGroupStageErrorMessage("Enter a positive whole number for the match interval.");
      setGroupStageSuccessMessage("");
      return;
    }

    setIsGeneratingGroupStage(true);
    setGroupStageErrorMessage("");
    setGroupStageSuccessMessage("");

    try {
      const result = await generateGroupStageMatches(
        groupStageForm.tournamentId,
        groupStageForm.teamIds,
        groupStageForm.startDate,
        groupStageForm.endDate,
        groupStageForm.dailyStartTime,
        groupStageForm.dailyEndTime,
        intervalMinutes,
        groupStageForm.format
      );

      if (result.error) {
        throw new Error(result.error);
      }

      await refreshAdminData();
      setGroupStageSuccessMessage(
        `Created ${result.matchCount} group stage matches in BO3 format.`
      );
      setGroupStageForm((current) => ({
        ...current,
        teamIds: [],
      }));
      router.refresh();
    } catch (error) {
      console.error("Generate Group Stage Error:", error);
      setGroupStageErrorMessage(
        getSupabaseLikeErrorMessage(
          error,
          "Could not generate group stage matches."
        )
      );
    } finally {
      setIsGeneratingGroupStage(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-5xl text-sm text-zinc-600">
          Loading admin...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-zinc-900">

      <main className="mx-auto max-w-5xl px-6 py-8">
        {pageErrorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{pageErrorMessage}</p>
        )}
        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        {!hasAdminAccess ? (
          <section className="border border-zinc-300 bg-white p-5 shadow-md">
            <h1 className="mb-3 text-2xl font-semibold">Admin</h1>
            <p className="text-sm text-zinc-600">
              You do not have admin access for this area.
            </p>
          </section>
        ) : (
        <div className="space-y-6">
          <section className="border border-zinc-300 bg-white p-5 shadow-md">
            <h1 className="mb-4 text-2xl font-semibold">Tournament Admin</h1>
            <div className="text-sm text-zinc-600">
              Current active tournament:{" "}
              <span className="font-medium text-zinc-900">
                {activeTournament?.name ?? "No active tournament"}
              </span>
            </div>
          </section>

          <div className="flex flex-wrap gap-2 border-b border-zinc-200">
            {ADMIN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-t border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-zinc-300 bg-white text-zinc-900"
                    : "border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "players" && (
            <div className="space-y-6">
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Create Player
                </h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    type="email"
                    value={newPlayerEmail}
                    onChange={(event) => setNewPlayerEmail(event.target.value)}
                    placeholder="Player email"
                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                  <input
                    type="text"
                    value={newPlayerNickname}
                    onChange={(event) => setNewPlayerNickname(event.target.value)}
                    placeholder="Nickname"
                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                  <input
                    type="password"
                    value={newPlayerPassword}
                    onChange={(event) => setNewPlayerPassword(event.target.value)}
                    placeholder="Password"
                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => void handleCreatePlayer()}
                    disabled={isCreatingPlayer}
                    className="rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                  >
                    {isCreatingPlayer ? "Creating..." : "Create Player"}
                  </button>
                  <p className="text-sm text-zinc-600">
                    Creates a confirmed auth user and profile so the player is immediately
                    available in team management.
                  </p>
                </div>
              </section>

              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Manage Players
                </h2>

                {players.length === 0 ? (
                  <p className="text-sm text-zinc-600">No registered players found yet.</p>
                ) : (
                  <div className="overflow-visible border-[3px] border-[#061726] bg-white shadow-[4px_4px_0px_0px_#061726]">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className="relative flex flex-col items-start justify-between gap-4 border-b border-gray-700 bg-zinc-50 p-4 pr-16 last:border-b-0 md:flex-row md:items-start"
                      >
                        <div
                          ref={openPlayerMenuId === player.id ? playerMenuRef : null}
                          className="absolute right-4 top-4 z-40"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenPlayerMenuId((current) =>
                                current === player.id ? null : player.id
                              )
                            }
                            className="flex cursor-pointer select-none items-center justify-center text-3xl font-black leading-none text-[#061726] transition-transform hover:scale-105 focus:outline-none"
                            aria-label={`Управление игроком ${player.nickname}`}
                            aria-expanded={openPlayerMenuId === player.id}
                          >
                            ⋮
                          </button>

                          {openPlayerMenuId === player.id ? (
                            <div className="absolute right-0 top-10 z-50 flex min-w-[280px] flex-col gap-3 border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                              <button
                                type="button"
                                onClick={() => setOpenPlayerMenuId(null)}
                                className="mb-2 w-full border-b-2 border-black pb-2 text-right text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-black"
                              >
                                ✕ Закрыть
                              </button>
                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#061726]">
                                Статус MMR
                              </span>
                              <select
                                value={player.mmrStatus}
                                onChange={(event) =>
                                  void handleUpdateMMRStatus(
                                    player.id,
                                    event.target.value as AdminPlayerListItem["mmrStatus"]
                                  )
                                }
                                disabled={isUpdatingMMRStatusUserId === player.id}
                                className={`${getMMRStatusSelectClassName(player.mmrStatus)} min-w-full`}
                              >
                                {MMR_STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#061726]">
                                MMR игрока
                              </span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                step="1"
                                value={playerMMRInputs[player.id] ?? ""}
                                onChange={(event) =>
                                  handlePlayerMMRInputChange(player.id, event.target.value)
                                }
                                onBlur={() => handleSavePlayerMMR(player.id)}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") {
                                    return;
                                  }

                                  event.preventDefault();
                                  handleSavePlayerMMR(player.id);
                                }}
                                placeholder={
                                  isUpdatingPlayerMMRUserId === player.id
                                    ? "СОХРАНЕНИЕ..."
                                    : "ВВЕСТИ MMR"
                                }
                                disabled={isUpdatingPlayerMMRUserId === player.id}
                                aria-busy={isUpdatingPlayerMMRUserId === player.id}
                                className={`${getMMRValueInputClassName(player.mmr)} min-w-full`}
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => void handleResetPlayerDeviceBinding(player.id)}
                              disabled={isResettingDeviceUserId === player.id}
                              className={`${PLAYER_ACTION_BUTTON_YELLOW_CLASSNAME} w-full`}
                            >
                              {isResettingDeviceUserId === player.id
                                ? "Сброс..."
                                : "СБРОСИТЬ БИОМЕТРИЮ"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleResetPlayerBehaviorScore(player.id)}
                              disabled={isResettingBehaviorScoreUserId === player.id}
                              className={`${PLAYER_ACTION_BUTTON_BLUE_CLASSNAME} w-full`}
                            >
                              {isResettingBehaviorScoreUserId === player.id
                                ? "СБРОС..."
                                : "СБРОСИТЬ БАЛЛ"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeletePlayer(player.id)}
                              disabled={isDeletingPlayerUserId === player.id}
                              className={`${PLAYER_ACTION_BUTTON_DANGER_CLASSNAME} w-full`}
                            >
                              {isDeletingPlayerUserId === player.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>

                            <div className="flex w-full flex-col gap-3 border-2 border-black bg-zinc-50 p-3">
                              <div className="border-b border-gray-200 pb-1 text-center text-xs font-bold uppercase tracking-wider text-black">
                                Управление медалями
                              </div>

                              {tournaments.length === 0 ? (
                                <span className="text-center text-[10px] uppercase text-gray-500">
                                  Сначала создайте турнир, чтобы назначать медали.
                                </span>
                              ) : (
                                <>
                                  <div className="flex flex-col gap-2">
                                    <label>
                                      <select
                                        aria-label="Выбор турнира для медали"
                                        value={
                                          playerMedalDrafts[player.id]?.tournamentId ??
                                          activeTournament?.id ??
                                          tournaments[0]?.id ??
                                          ""
                                        }
                                        onChange={(event) =>
                                          handlePlayerMedalDraftChange(
                                            player.id,
                                            "tournamentId",
                                            event.target.value
                                          )
                                        }
                                        disabled={isSavingPlayerMedalUserId === player.id}
                                        className="w-full truncate border border-gray-400 bg-white p-1.5 text-xs text-black focus:border-black focus:outline-none"
                                      >
                                        {tournaments.map((tournament) => (
                                          <option key={tournament.id} value={tournament.id}>
                                            {tournament.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      <select
                                        aria-label="Выбор медали"
                                        value={playerMedalDrafts[player.id]?.medal ?? ""}
                                        onChange={(event) =>
                                          handlePlayerMedalDraftChange(
                                            player.id,
                                            "medal",
                                            event.target.value
                                          )
                                        }
                                        disabled={isSavingPlayerMedalUserId === player.id}
                                        className="w-full truncate border border-gray-400 bg-white p-1.5 text-xs text-black focus:border-black focus:outline-none"
                                      >
                                        {PLAYER_MEDAL_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => void handleSavePlayerMedal(player.id)}
                                      disabled={
                                        isSavingPlayerMedalUserId === player.id ||
                                        !(playerMedalDrafts[player.id]?.medal ?? "")
                                      }
                                      className="w-full bg-black px-3 py-2 text-xs font-bold uppercase text-white transition-colors hover:bg-gray-800"
                                    >
                                      {isSavingPlayerMedalUserId === player.id
                                        ? "СОХРАНЕНИЕ..."
                                        : "СОХРАНИТЬ"}
                                    </button>
                                  </div>

                                  <div className="mt-1 flex flex-wrap justify-center gap-2">
                                    {player.medals.length === 0 ? (
                                      <span className="text-[10px] uppercase text-gray-500">
                                        Медалей пока нет
                                      </span>
                                    ) : (
                                      player.medals.map((medal) => (
                                        <span
                                          key={medal.id}
                                          className="flex items-center gap-2 border border-black bg-gray-50 px-2 py-1 text-xs font-bold text-black"
                                        >
                                          <span title={getPlayerMedalTitle(medal)}>
                                            {PLAYER_MEDAL_META[medal.medal].icon}
                                          </span>
                                          <span>{medal.tournamentName}</span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleClearPlayerMedal(
                                                player.id,
                                                medal.tournamentId
                                              )
                                            }
                                            disabled={
                                              isSavingPlayerMedalUserId === player.id
                                            }
                                            className="ml-1 text-red-600 hover:text-red-800"
                                            aria-label={`Удалить медаль ${medal.tournamentName}`}
                                          >
                                            ✕
                                          </button>
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="min-w-0 md:w-64 md:flex-none">
                          <div className="text-lg font-black text-[#061726]">
                            {player.nickname}
                          </div>
                          <div className="mt-1 break-all text-sm text-gray-400">
                            {player.email}
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-col gap-4 md:flex-1">
                          <div className="flex flex-wrap gap-2 md:justify-center">
                            <div
                              className={getBehaviorScoreBadgeClassName(player.behaviorScore)}
                            >
                              Балл: {player.behaviorScore}
                            </div>
                            <div className={getOpenTaskBadgeClassName(player.openTaskCount)}>
                              Открытые задачи: {player.openTaskCount}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "teams" && (
            <div className="space-y-6">
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">Teams</h2>

                <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(event) => setNewTeamName(event.target.value)}
                    placeholder="Team name"
                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateTeam()}
                    disabled={isCreatingTeam}
                    className="rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                  >
                    {isCreatingTeam ? "Creating..." : "Create Team"}
                  </button>
                </div>

                {teams.length === 0 ? (
                  <p className="text-sm text-zinc-600">No teams created yet.</p>
                ) : (
                  <div className="space-y-3">
                    {teams.map((team) => (
                      <div key={team.id} className="space-y-3">
                        <div className="flex flex-col gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium">{team.name}</div>
                            <div className="mt-1 text-sm text-zinc-500">
                              Captain: {team.captainName}
                            </div>
                            <div className="text-sm text-zinc-500">
                              Members: {team.memberCount}
                            </div>
                            <div className="text-sm text-zinc-500">
                              {team.logoUrl ? "Логотип загружен" : "Логотип не загружен"}
                            </div>
                            <div className="text-sm text-gray-400">
                              Total MMR: {team.totalMmr}
                            </div>
                            {team.isLockedForActiveTournament && (
                              <div className="text-sm text-zinc-500">
                                Roster locked after tournament entry
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => setSelectedTeamId(team.id)}
                              disabled={isDeletingTeamId === team.id}
                              className={`rounded border px-4 py-2 text-sm font-medium ${
                                selectedTeamId === team.id
                                  ? "border-zinc-300 bg-zinc-100 text-zinc-500"
                                  : "border-zinc-400 bg-zinc-100 text-zinc-900"
                              }`}
                            >
                              {selectedTeamId === team.id ? "Managing" : "Manage Team"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleTeamLogoEditor(team.id)}
                              disabled={isDeletingTeamId === team.id}
                              className={`rounded border px-4 py-2 text-sm font-medium ${
                                editingLogoTeamId === team.id
                                  ? "border-[#061726] bg-[#061726] text-white"
                                  : "border-zinc-400 bg-white text-zinc-900"
                              }`}
                            >
                              {editingLogoTeamId === team.id
                                ? "Редактирование"
                                : "Редактировать"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteTeam(team.id)}
                              disabled={isDeletingTeamId === team.id}
                              className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                            >
                              {isDeletingTeamId === team.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>
                        {editingLogoTeamId === team.id && (
                          <div className="border-[3px] border-[#061726] bg-white px-4 py-4 shadow-[4px_4px_0px_0px_#061726]">
                            <div className="text-sm font-bold uppercase tracking-wide text-[#061726]">
                              Редактировать команду
                            </div>
                            <p className="mt-2 text-sm text-zinc-600">
                              Загрузить логотип
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Рекомендуется квадратное изображение 1:1. На карточке
                              команды логотип будет отображаться как ровный квадрат.
                            </p>
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                              <label className="flex-1 text-sm font-medium text-zinc-700">
                                Файл логотипа
                                <input
                                  type="file"
                                  accept="image/png, image/jpeg, image/webp"
                                  onChange={(event) =>
                                    setSelectedLogoFile(event.target.files?.[0] ?? null)
                                  }
                                  className="mt-2 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => void handleSaveTeamLogo(team.id)}
                                disabled={
                                  !selectedLogoFile || isUploadingLogoTeamId === team.id
                                }
                                className="rounded border-[3px] border-[#061726] bg-[#CD9C3E] px-4 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                              >
                                {isUploadingLogoTeamId === team.id
                                  ? "Сохранение..."
                                  : "Сохранить"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLogoTeamId(null);
                                  setSelectedLogoFile(null);
                                }}
                                disabled={isUploadingLogoTeamId === team.id}
                                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {selectedTeam && (
                <section className="border border-zinc-300 bg-white p-5 shadow-md">
                  <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                    Manage Team
                  </h2>
                  <div className="mb-5 text-sm text-zinc-700">
                    Selected team:{" "}
                    <span className="font-medium text-zinc-900">
                      {selectedTeam.name}
                    </span>
                  </div>

                  {selectedTeam.isLockedForActiveTournament ? (
                    <div className="mb-5 space-y-4">
                      <p className="text-sm text-zinc-600">
                        This team already entered the active tournament, so roster
                        changes are currently locked.
                      </p>
                      <div className="rounded border border-red-200 bg-red-50/40 p-4">
                        <div className="mb-3 text-sm font-medium text-red-700">
                          Add Player (Admin Override)
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            type="text"
                            value={adminOverridePlayerIdentifier}
                            onChange={(event) =>
                              setAdminOverridePlayerIdentifier(event.target.value)
                            }
                            placeholder="Player ID, email, or username"
                            className="w-full rounded border border-red-200 bg-white px-3 py-2 text-sm outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleForceAddMemberToTeam()}
                            disabled={isForceAddingMember || !adminOverridePlayerIdentifier.trim()}
                            className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                          >
                            {isForceAddingMember ? "Force Adding..." : "Force Add"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                      <select
                        value={selectedProfileIdToAdd}
                        onChange={(event) => setSelectedProfileIdToAdd(event.target.value)}
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                      >
                        <option value="">Select player profile</option>
                        {availableProfilesToAdd.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.nickname}
                            {candidate.isAdmin ? " (admin)" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAddMemberToTeam()}
                        disabled={isAddingMember || !selectedProfileIdToAdd}
                        className="rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                      >
                        {isAddingMember ? "Adding..." : "Add Member"}
                      </button>
                    </div>
                  )}

                  <div className="space-y-3">
                    {teamMembersErrorMessage ? (
                      <p className="text-sm text-zinc-600">
                        {teamMembersErrorMessage}
                      </p>
                    ) : selectedTeamMembers.length === 0 ? (
                      <p className="text-sm text-zinc-600">
                        No members assigned to this team yet.
                      </p>
                    ) : (
                      selectedTeamMembers.map((member) => (
                        <div
                          key={member.userId}
                          className="flex flex-col gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="font-medium">{member.nickname}</div>
                            <div className="mt-1 text-sm text-zinc-500">
                              Role: {member.isCaptain ? "Captain" : "Member"}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void handleSetCaptain(member.userId)}
                              disabled={
                                member.isCaptain || isSettingCaptainUserId === member.userId
                              }
                              className={`rounded border px-4 py-2 text-sm font-medium ${
                                member.isCaptain
                                  ? "border-zinc-300 bg-zinc-100 text-zinc-500"
                                  : "border-zinc-400 bg-zinc-100 text-zinc-900"
                              }`}
                            >
                              {member.isCaptain
                                ? "Current Captain"
                                : isSettingCaptainUserId === member.userId
                                  ? "Updating..."
                                  : "Set Captain"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemovePlayerFromTeam(member.userId)}
                              disabled={isRemovingPlayerUserId === member.userId}
                              className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                            >
                              {isRemovingPlayerUserId === member.userId
                                ? "Removing..."
                                : "Remove"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Active Tournament Entry
                </h2>

                {!activeTournament ? (
                  <p className="text-sm text-zinc-600">
                    No active tournament selected yet.
                  </p>
                ) : entrySectionErrorMessage ? (
                  <p className="text-sm text-zinc-600">{entrySectionErrorMessage}</p>
                ) : entryTeams.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    No teams available for tournament entry management yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {entryTeams.map((team) => {
                      const canForceConfirmRoster =
                        !team.hasEntered &&
                        team.captainName !== "No captain" &&
                        team.memberCount >= 5 &&
                        team.confirmedCount < 5 &&
                        !team.canEnter;

                      return (
                        <div
                          key={team.id}
                          className="flex flex-col gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="font-medium">{team.name}</div>
                            <div className="mt-1 text-sm text-zinc-500">
                              Captain: {team.captainName}
                            </div>
                            <div className="text-sm text-zinc-500">
                              Members: {team.memberCount}
                            </div>
                            <div className="text-sm text-zinc-500">
                              Confirmed players: {team.confirmedCount}
                            </div>
                            <div className="text-sm text-zinc-500">
                              Entry status: {team.hasEntered ? "Entered" : "Not entered"}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void handleEnterTeamIntoActiveTournament(team.id)
                              }
                              disabled={
                                team.hasEntered ||
                                !team.canEnter ||
                                isEnteringTeamId === team.id
                              }
                              className={`rounded border px-4 py-2 text-sm font-medium ${
                                team.hasEntered || !team.canEnter
                                  ? "border-zinc-300 bg-zinc-100 text-zinc-500"
                                  : "border-zinc-400 bg-zinc-100 text-zinc-900"
                              }`}
                            >
                              {team.hasEntered
                                ? "Already Entered"
                                : isEnteringTeamId === team.id
                                  ? "Entering..."
                                  : team.canEnter
                                    ? "Enter Team"
                                    : "Not Eligible"}
                            </button>
                            {team.hasEntered && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleToggleTeamSuspension(team.id, !team.isSuspended)
                                }
                                disabled={isSuspendingTeamId === team.id}
                                className={`rounded border px-4 py-2 text-sm font-medium ${
                                  team.isSuspended
                                    ? "border-green-500 text-green-600"
                                    : "border-red-500 text-red-500"
                                }`}
                              >
                                {isSuspendingTeamId === team.id
                                  ? "Updating..."
                                  : team.isSuspended
                                    ? "Restore Team"
                                    : "Suspend Team"}
                              </button>
                            )}
                            {canForceConfirmRoster && (
                              <button
                                type="button"
                                onClick={() => void handleForceConfirmRoster(team.id)}
                                disabled={isForceConfirmingTeamId === team.id}
                                className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
                              >
                                {isForceConfirmingTeamId === team.id
                                  ? "Force Confirming..."
                                  : "Force Confirm Roster"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "tournaments" && (
            <div className="space-y-6">
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Create Tournament
                </h2>
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={newTournamentName}
                    onChange={(event) => setNewTournamentName(event.target.value)}
                    placeholder="Tournament name"
                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-[#061726]">
                        Prize Pool
                      </span>
                      <input
                        type="text"
                        value={newTournamentPrizePool}
                        onChange={(event) => setNewTournamentPrizePool(event.target.value)}
                        placeholder="100,000 KZT"
                        className="w-full border-[4px] border-[#061726] bg-[#F4EED7] px-3 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#061726] outline-none placeholder:font-bold placeholder:uppercase placeholder:tracking-[0.08em] placeholder:text-[#061726]/55"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-[#061726]">
                        Dates
                      </span>
                      <input
                        type="text"
                        value={newTournamentDates}
                        onChange={(event) => setNewTournamentDates(event.target.value)}
                        placeholder="May 10 - May 20"
                        className="w-full border-[4px] border-[#061726] bg-[#F4EED7] px-3 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#061726] outline-none placeholder:font-bold placeholder:uppercase placeholder:tracking-[0.08em] placeholder:text-[#061726]/55"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select
                      value={newTournamentNumberOfGroups}
                      onChange={(event) => setNewTournamentNumberOfGroups(event.target.value)}
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                    >
                      {TOURNAMENT_GROUP_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          Number of Groups: {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newTournamentTeamsEliminatedPerGroup}
                      onChange={(event) =>
                        setNewTournamentTeamsEliminatedPerGroup(event.target.value)
                      }
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                    >
                      {TEAMS_ELIMINATED_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          Teams Eliminated per Group: {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newTournamentPlayoffFormat}
                      onChange={(event) => setNewTournamentPlayoffFormat(event.target.value)}
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                    >
                      {PLAYOFF_FORMAT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          Playoff Format: {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreateTournament()}
                    disabled={isCreatingTournament}
                    className="w-fit rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                  >
                    {isCreatingTournament ? "Creating..." : "Create Tournament"}
                  </button>
                </div>

                <div className="mt-6 border-t border-zinc-200 pt-6">
                  <h3 className="mb-4 text-lg font-semibold text-zinc-500">
                    Tournaments
                  </h3>

                  {tournaments.length === 0 ? (
                    <p className="text-sm text-zinc-600">No tournaments created yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {tournaments.map((tournament) => (
                        <div key={tournament.id} className="space-y-3">
                          <div className="flex flex-col gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="font-medium">{tournament.name}</div>
                              <div className="mt-1 text-sm text-zinc-500">
                                Status: {tournament.is_active ? "Active" : "Inactive"}
                              </div>
                              <div className="text-sm text-zinc-500">
                                Check-in threshold: {tournament.check_in_threshold}
                              </div>
                              <div className="text-sm text-zinc-500">
                                Prize Pool: {tournament.prize_pool?.trim() || "Not set"}
                              </div>
                              <div className="text-sm text-zinc-500">
                                Dates: {tournament.dates?.trim() || "Not set"}
                              </div>
                              <div className="text-sm text-zinc-500">
                                {tournament.banner_url
                                  ? "Баннер загружен"
                                  : "Баннер не загружен"}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleTournamentDetailsEditor(tournament)
                                }
                                className={`rounded border px-4 py-2 text-sm font-medium ${
                                  editingTournamentDetailsId === tournament.id
                                    ? "border-[#061726] bg-[#061726] text-white"
                                    : "border-zinc-400 bg-white text-zinc-900"
                                }`}
                              >
                                {editingTournamentDetailsId === tournament.id
                                  ? "Hide Details"
                                  : "Edit Details"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleTournamentBannerEditor(tournament.id)
                                }
                                className={`rounded border px-4 py-2 text-sm font-medium ${
                                  editingBannerTournamentId === tournament.id
                                    ? "border-[#061726] bg-[#061726] text-white"
                                    : "border-zinc-400 bg-white text-zinc-900"
                                }`}
                              >
                                {editingBannerTournamentId === tournament.id
                                  ? "Редактирование"
                                  : "Загрузить баннер"}
                              </button>
                              {tournament.banner_url ? (
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveBanner(tournament.id)}
                                  disabled={isRemovingBannerTournamentId === tournament.id}
                                  className="rounded border border-red-500 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isRemovingBannerTournamentId === tournament.id
                                    ? "Удаление..."
                                    : "Удалить баннер"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void handleSetActiveTournament(tournament.id)}
                                disabled={
                                  tournament.is_active ||
                                  isSwitchingTournamentId === tournament.id
                                }
                                className={`rounded border px-4 py-2 text-sm font-medium ${
                                  tournament.is_active
                                    ? "border-zinc-300 bg-zinc-100 text-zinc-500"
                                    : "border-zinc-400 bg-zinc-100 text-zinc-900"
                                }`}
                              >
                                {tournament.is_active
                                  ? "Active Tournament"
                                  : isSwitchingTournamentId === tournament.id
                                    ? "Updating..."
                                    : "Set Active"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTournament(tournament.id)}
                                disabled={isDeletingTournamentId === tournament.id}
                                className="rounded border border-red-600 px-3 py-1 text-sm font-bold uppercase text-red-500 transition-colors hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDeletingTournamentId === tournament.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          </div>
                          {editingTournamentDetailsId === tournament.id && (
                            <div className="border-[3px] border-[#061726] bg-white px-4 py-4 shadow-[4px_4px_0px_0px_#061726]">
                              <div className="text-sm font-bold uppercase tracking-wide text-[#061726]">
                                Edit Tournament Details
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
                                  <span>Prize Pool</span>
                                  <input
                                    type="text"
                                    value={getTournamentDetailDraft(tournament).prizePool}
                                    onChange={(event) =>
                                      handleTournamentDetailDraftChange(
                                        tournament,
                                        "prizePool",
                                        event.target.value
                                      )
                                    }
                                    placeholder="100,000 KZT"
                                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                                  />
                                </label>
                                <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700">
                                  <span>Dates</span>
                                  <input
                                    type="text"
                                    value={getTournamentDetailDraft(tournament).dates}
                                    onChange={(event) =>
                                      handleTournamentDetailDraftChange(
                                        tournament,
                                        "dates",
                                        event.target.value
                                      )
                                    }
                                    placeholder="May 10 - May 20"
                                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                                  />
                                </label>
                              </div>
                              <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleSaveTournamentDetails(tournament.id)
                                  }
                                  disabled={isSavingTournamentDetailsId === tournament.id}
                                  className="rounded border-[3px] border-[#061726] bg-[#CD9C3E] px-4 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                                >
                                  {isSavingTournamentDetailsId === tournament.id
                                    ? "Saving..."
                                    : "Save"}
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="border-[3px] border-[#061726] bg-[#0B3A4A] px-4 py-4 shadow-[4px_4px_0px_0px_#061726]">
                            <div className="text-sm font-black uppercase tracking-[0.18em] text-[#CD9C3E]">
                              ЗАФИКСИРОВАТЬ РЕЗУЛЬТАТЫ
                            </div>
                            <div className="mt-4 space-y-3">
                              {([
                                {
                                  placement: 1 as const,
                                  label: "1 место",
                                  selectClassName:
                                    "border-[#CD9C3E] text-[#CD9C3E] focus:border-[#CD9C3E]",
                                },
                                {
                                  placement: 2 as const,
                                  label: "2 место",
                                  selectClassName:
                                    "border-gray-400 text-gray-200 focus:border-gray-300",
                                },
                                {
                                  placement: 3 as const,
                                  label: "3 место",
                                  selectClassName:
                                    "border-amber-700 text-amber-300 focus:border-amber-500",
                                },
                              ]).map((resultRow) => {
                                const resultKey = `${tournament.id}:${resultRow.placement}`;
                                const isSavingResult =
                                  isSavingTournamentResultKey === resultKey &&
                                  isTournamentResultPending;

                                return (
                                  <div
                                    key={resultKey}
                                    className="flex flex-col gap-2 md:flex-row md:items-center"
                                  >
                                    <label className="w-full md:flex-1">
                                      <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-white/80">
                                        {resultRow.label}
                                      </span>
                                      <select
                                        value={
                                          tournamentResultSelections[tournament.id]?.[
                                            resultRow.placement
                                          ] ?? ""
                                        }
                                        onChange={(event) =>
                                          handleTournamentResultSelectionChange(
                                            tournament.id,
                                            resultRow.placement,
                                            event.target.value
                                          )
                                        }
                                        disabled={isSavingResult}
                                        className={`w-full border bg-transparent p-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 ${resultRow.selectClassName}`}
                                      >
                                        <option value="">-- ОЧИСТИТЬ (Clear) --</option>
                                        {teams.map((team) => (
                                          <option key={team.id} value={team.id}>
                                            {team.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleRecordTournamentResult(
                                          tournament.id,
                                          resultRow.placement
                                        )
                                      }
                                      disabled={isSavingResult}
                                      className="w-fit border-[3px] border-[#061726] bg-[#CD9C3E] px-4 py-2 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70"
                                    >
                                      {isSavingResult ? "СОХРАНЕНИЕ..." : "СОХРАНИТЬ"}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {editingBannerTournamentId === tournament.id && (
                            <div className="border-[3px] border-[#061726] bg-white px-4 py-4 shadow-[4px_4px_0px_0px_#061726]">
                              <div className="text-sm font-bold uppercase tracking-wide text-[#061726]">
                                Загрузить баннер
                              </div>
                              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                                <label className="flex-1 text-sm font-medium text-zinc-700">
                                  Файл баннера
                                  <input
                                    type="file"
                                    accept="image/png, image/jpeg, image/webp"
                                    onChange={(event) =>
                                      setSelectedBannerFile(
                                        event.target.files?.[0] ?? null
                                      )
                                    }
                                    className="mt-2 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleSaveTournamentBanner(tournament.id)
                                  }
                                  disabled={
                                    !selectedBannerFile ||
                                    isUploadingBannerTournamentId === tournament.id
                                  }
                                  className="rounded border-[3px] border-[#061726] bg-[#CD9C3E] px-4 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                                >
                                  {isUploadingBannerTournamentId === tournament.id
                                    ? "Загрузка..."
                                    : "Загрузить баннер"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
                <h2 className="text-lg font-black uppercase tracking-[0.18em] text-[#CD9C3E]">
                  Active Check-In Threshold
                </h2>
                {activeTournament ? (
                  <div className="mt-4 space-y-4">
                    <p className="text-sm font-bold uppercase tracking-[0.12em] text-white/85">
                      Active tournament: {activeTournament.name}
                    </p>
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <label className="flex-1">
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                          Players required for lobby unlock
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={activeTournamentCheckInThresholdInput}
                          onChange={(event) =>
                            setActiveTournamentCheckInThresholdInput(event.target.value)
                          }
                          className="mt-3 w-full border-[4px] border-[#061726] bg-white px-4 py-3 text-lg font-black text-[#0B3A4A] outline-none shadow-[4px_4px_0px_0px_#061726] placeholder:text-[#0B3A4A]/45"
                          placeholder="10"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleSaveActiveTournamentCheckInThreshold()}
                        disabled={
                          isSavingCheckInThresholdTournamentId === activeTournament.id
                        }
                        className="border-[4px] border-[#061726] bg-[#CD9C3E] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70 disabled:shadow-[4px_4px_0px_0px_#061726]"
                      >
                        {isSavingCheckInThresholdTournamentId === activeTournament.id
                          ? "Saving..."
                          : "Save Threshold"}
                      </button>
                    </div>
                    <p className="text-sm text-white/80">
                      This value controls when match check-in is considered complete
                      and when lobby details unlock.
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-medium text-white/80">
                    No active tournament selected yet.
                  </p>
                )}
              </section>

            </div>
          )}

          {activeTab === "matches" && (
            <div className="space-y-6">
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Generate Group Stage
                </h2>

                {tournaments.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    Create a tournament before generating group stage matches.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                      <label className="flex flex-col gap-1 text-sm text-zinc-700">
                        <span className="font-medium">Select Tournament</span>
                        <select
                          aria-label="Group stage tournament"
                          value={groupStageForm.tournamentId}
                          onChange={(event) => {
                            setGroupStageForm((current) => ({
                              ...current,
                              tournamentId: event.target.value,
                              teamIds: [],
                            }));
                            setGroupStageErrorMessage("");
                            setGroupStageSuccessMessage("");
                          }}
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        >
                          <option value="">Select tournament</option>
                          {tournaments.map((tournament) => (
                            <option key={tournament.id} value={tournament.id}>
                              {tournament.name}
                              {tournament.is_active ? " (Active)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-zinc-700">
                        <span className="font-medium">
                          Start Date (First day of matches)
                        </span>
                        <input
                          aria-label="Group stage start date"
                          type="date"
                          value={groupStageForm.startDate}
                          onChange={(event) => {
                            setGroupStageForm((current) => ({
                              ...current,
                              startDate: event.target.value,
                            }));
                            setGroupStageErrorMessage("");
                            setGroupStageSuccessMessage("");
                          }}
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-zinc-700">
                        <span className="font-medium">
                          End Date (Last day of matches)
                        </span>
                        <input
                          aria-label="Group stage end date"
                          type="date"
                          value={groupStageForm.endDate}
                          onChange={(event) => {
                            setGroupStageForm((current) => ({
                              ...current,
                              endDate: event.target.value,
                            }));
                            setGroupStageErrorMessage("");
                            setGroupStageSuccessMessage("");
                          }}
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-zinc-700">
                        <span className="font-medium">
                          Daily Start Time (Earliest match start)
                        </span>
                        <input
                          aria-label="Group stage daily start time"
                          type="time"
                          value={groupStageForm.dailyStartTime}
                          onChange={(event) => {
                            setGroupStageForm((current) => ({
                              ...current,
                              dailyStartTime: event.target.value,
                            }));
                            setGroupStageErrorMessage("");
                            setGroupStageSuccessMessage("");
                          }}
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-zinc-700">
                        <span className="font-medium">
                          Daily End Time (Latest match allowed to finish)
                        </span>
                        <input
                          aria-label="Group stage daily end time"
                          type="time"
                          value={groupStageForm.dailyEndTime}
                          onChange={(event) => {
                            setGroupStageForm((current) => ({
                              ...current,
                              dailyEndTime: event.target.value,
                            }));
                            setGroupStageErrorMessage("");
                            setGroupStageSuccessMessage("");
                          }}
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-zinc-700">
                        <span className="font-medium">Match Format</span>
                        <select
                          aria-label="Group stage match format"
                          value={groupStageForm.format}
                          onChange={(event) => {
                            setGroupStageForm((current) => ({
                              ...current,
                              format: event.target.value,
                            }));
                            setGroupStageErrorMessage("");
                            setGroupStageSuccessMessage("");
                          }}
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        >
                          {GROUP_STAGE_MATCH_FORMAT_OPTIONS.map((formatOption) => (
                            <option key={formatOption} value={formatOption}>
                              {formatOption}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2 lg:col-span-1">
                        <span className="font-medium">
                          Match Interval (Minutes between games)
                        </span>
                        <input
                          aria-label="Group stage match interval in minutes"
                          type="number"
                          min="1"
                          step="1"
                          value={groupStageForm.matchIntervalMinutes}
                          onChange={(event) => {
                            setGroupStageForm((current) => ({
                              ...current,
                              matchIntervalMinutes: event.target.value,
                            }));
                            setGroupStageErrorMessage("");
                            setGroupStageSuccessMessage("");
                          }}
                          placeholder="Match interval in minutes"
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>
                    </div>

                    {!groupStageForm.tournamentId ? (
                      <p className="text-sm text-zinc-600">
                        Select a tournament to load available teams.
                      </p>
                    ) : enteredGroupStageTeams.length === 0 ? (
                      <p className="text-sm text-zinc-600">
                        No entered teams are available for this tournament yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <label className="flex flex-col gap-1 text-sm text-zinc-700">
                          <span className="font-medium">
                            Select Teams for Round-Robin
                          </span>
                          <select
                            multiple
                            value={groupStageForm.teamIds}
                            onChange={(event) => {
                              setGroupStageForm((current) => ({
                                ...current,
                                teamIds: Array.from(
                                  event.target.selectedOptions,
                                  (option) => option.value
                                ),
                              }));
                              setGroupStageErrorMessage("");
                              setGroupStageSuccessMessage("");
                            }}
                            className="min-h-56 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                          >
                            {enteredGroupStageTeams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                                {team.isSuspended ? " (Suspended)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="text-sm text-zinc-600">
                          Generated matches use the existing schema defaults:
                          Group Stage and scheduled status. Scheduling uses the
                          daily Almaty-time window and rolls to the next day when
                          a slot would exceed it.
                        </p>
                      </div>
                    )}

                    <div className="text-sm text-zinc-600">
                      Selected teams: {groupStageForm.teamIds.length}. Matches to
                      create: {groupStageMatchCount}.
                    </div>

                    {groupStageErrorMessage && (
                      <p className="text-sm text-zinc-600">{groupStageErrorMessage}</p>
                    )}

                    {groupStageSuccessMessage && (
                      <p className="text-sm text-zinc-600">{groupStageSuccessMessage}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleGenerateGroupStage()}
                      disabled={
                        isGeneratingGroupStage ||
                        !groupStageForm.tournamentId ||
                        !groupStageForm.startDate.trim() ||
                        !groupStageForm.endDate.trim() ||
                        !groupStageForm.dailyStartTime.trim() ||
                        !groupStageForm.dailyEndTime.trim() ||
                        groupStageForm.startDate > groupStageForm.endDate ||
                        groupStageForm.dailyStartTime >= groupStageForm.dailyEndTime ||
                        !groupStageForm.matchIntervalMinutes.trim() ||
                        !Number.isInteger(Number(groupStageForm.matchIntervalMinutes)) ||
                        Number(groupStageForm.matchIntervalMinutes) <= 0 ||
                        groupStageForm.teamIds.length < 2
                      }
                      className="w-fit rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                    >
                      {isGeneratingGroupStage
                        ? "Generating..."
                        : "Generate Group Stage"}
                    </button>
                  </div>
                )}
              </section>

              <GroupStageStandingsTable
                title="Group Stage Standings"
                description={
                  activeTournament
                    ? `Current active tournament: ${activeTournament.name}`
                    : undefined
                }
                isLoading={isLoading}
                errorMessage={matchesSectionErrorMessage}
                matches={matches}
                emptyMessage={
                  activeTournament
                    ? "Standings will appear after finished Group Stage matches are available."
                    : "No active tournament selected yet."
                }
                variant="admin"
              />

              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Active Tournament Matches
                </h2>

                {!activeTournament ? (
                  <p className="text-sm text-zinc-600">
                    No active tournament selected yet.
                  </p>
                ) : (
                  <div className="space-y-5">
                    <div className="text-sm text-zinc-600">
                      Current active tournament:{" "}
                      <span className="font-medium text-zinc-900">
                        {activeTournament.name}
                      </span>
                    </div>

                    {enteredTeams.length === 0 ? (
                      <p className="text-sm text-zinc-600">
                        Enter teams into the active tournament before creating matches.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <select
                          value={matchForm.teamAId}
                          onChange={(event) =>
                            setMatchForm((current) => ({
                              ...current,
                              teamAId: event.target.value,
                            }))
                          }
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        >
                          <option value="">Select Team A</option>
                          {enteredTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={matchForm.teamBId}
                          onChange={(event) =>
                            setMatchForm((current) => ({
                              ...current,
                              teamBId: event.target.value,
                            }))
                          }
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        >
                          <option value="">Select Team B</option>
                          {enteredTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={matchForm.roundLabel}
                          onChange={(event) =>
                            setMatchForm((current) => ({
                              ...current,
                              roundLabel: event.target.value,
                            }))
                          }
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        >
                          <option value="">Select round</option>
                          {MATCH_ROUND_OPTIONS.map((roundLabel) => (
                            <option key={roundLabel} value={roundLabel}>
                              {roundLabel}
                            </option>
                          ))}
                        </select>

                        <select
                          value={matchForm.format}
                          onChange={(event) =>
                            setMatchForm((current) => ({
                              ...current,
                              format: event.target.value,
                            }))
                          }
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        >
                          {MATCH_FORMAT_OPTIONS.map((fmt) => (
                            <option key={fmt} value={fmt}>
                              {fmt}
                            </option>
                          ))}
                        </select>

                        <input
                          type="datetime-local"
                          value={matchForm.scheduledAt}
                          onChange={(event) =>
                            setMatchForm((current) => ({
                              ...current,
                              scheduledAt: event.target.value,
                            }))
                          }
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                        />

                        <label className="flex items-center gap-3 rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900">
                          <input
                            type="checkbox"
                            checked={matchForm.requireLobbyPhoto}
                            onChange={(event) =>
                              setMatchForm((current) => ({
                                ...current,
                                requireLobbyPhoto: event.target.checked,
                                lobbyPhotoMap1Only: event.target.checked
                                  ? current.lobbyPhotoMap1Only
                                  : false,
                                requirePhotoUnconfirmedMMROnly: event.target.checked
                                  ? current.requirePhotoUnconfirmedMMROnly
                                  : false,
                              }))
                            }
                            className="h-4 w-4 rounded border-zinc-400 text-zinc-900"
                          />
                          <span>Требовать фото лобби</span>
                        </label>

                        <label className="flex items-center gap-3 rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60">
                          <input
                            type="checkbox"
                            checked={matchForm.lobbyPhotoMap1Only}
                            disabled={!matchForm.requireLobbyPhoto}
                            onChange={(event) =>
                              setMatchForm((current) => ({
                                ...current,
                                lobbyPhotoMap1Only: event.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-zinc-400 text-zinc-900"
                          />
                          <span>Только для Карты 1</span>
                        </label>

                        <label className="flex items-center gap-3 rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60">
                          <input
                            type="checkbox"
                            checked={matchForm.requirePhotoUnconfirmedMMROnly}
                            disabled={!matchForm.requireLobbyPhoto}
                            onChange={(event) =>
                              setMatchForm((current) => ({
                                ...current,
                                requirePhotoUnconfirmedMMROnly:
                                  event.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-zinc-400 text-zinc-900"
                          />
                          <span>Только для неподтвержденного MMR</span>
                        </label>

                        {isEditingMatch && (
                          <select
                            value={matchForm.status}
                            onChange={(event) =>
                              setMatchForm((current) => ({
                                ...current,
                                status: event.target.value,
                              }))
                            }
                            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                          >
                            <option value="scheduled">scheduled</option>
                            <option value="finished">finished</option>
                          </select>
                        )}

                        {isEditingMatch && (
                          <input
                            type="number"
                            value={matchForm.teamAScore}
                            onChange={(event) =>
                              setMatchForm((current) => ({
                                ...current,
                                teamAScore: event.target.value,
                              }))
                            }
                            placeholder="Team A score"
                            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                          />
                        )}

                        {isEditingMatch && (
                          <input
                            type="number"
                            value={matchForm.teamBScore}
                            onChange={(event) =>
                              setMatchForm((current) => ({
                                ...current,
                                teamBScore: event.target.value,
                              }))
                            }
                            placeholder="Team B score"
                            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                          />
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void handleSaveMatch()}
                        disabled={
                          isSavingMatch || !activeTournament || enteredTeams.length === 0
                        }
                        className="rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                      >
                        {isSavingMatch
                          ? "Saving..."
                          : editingMatchId
                            ? "Update Match"
                            : "Create Match"}
                      </button>
                      {editingMatchId && (
                        <button
                          type="button"
                          onClick={resetMatchForm}
                          disabled={isSavingMatch}
                          className="rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>

                    {matchesSectionErrorMessage ? (
                      <p className="text-sm text-zinc-600">{matchesSectionErrorMessage}</p>
                    ) : matches.length === 0 ? (
                      <p className="text-sm text-zinc-600">
                        No matches created for the active tournament yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 rounded border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                            <input
                              type="checkbox"
                              checked={
                                selectedMatches.length > 0 &&
                                selectedMatches.length === matches.length
                              }
                              onChange={(event) =>
                                setSelectedMatches(
                                  event.target.checked
                                    ? matches.map((match) => match.id)
                                    : []
                                )
                              }
                              className="h-4 w-4 rounded border-zinc-300"
                            />
                            Select All
                          </label>
                          {selectedMatches.length > 0 && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteSelectedMatches()}
                              disabled={isDeletingMatchId === "__bulk__"}
                              className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                            >
                              {isDeletingMatchId === "__bulk__"
                                ? "Deleting..."
                                : `Delete Selected (${selectedMatches.length})`}
                            </button>
                          )}
                        </div>
                        {matches.map((match) => {
                          const isTimedOut = isTimedOutTournamentMatch(
                            match,
                            currentTimeMs
                          );
                          const isCompletedMatch = isUserTeamMatchCompleted(match);
                          const isOverridePending =
                            pendingTimedOutMatchAction?.matchId === match.id &&
                            pendingTimedOutMatchAction.action === "override";
                          const isTechnicalDefeatPending =
                            pendingTimedOutMatchAction?.matchId === match.id &&
                            pendingTimedOutMatchAction.action === "technical-defeat";
                          const isTimedOutMatchActionPending =
                            isOverridePending || isTechnicalDefeatPending;
                          const isMutatingMatch =
                            isDeletingMatchId === match.id ||
                            isDeletingMatchId === "__bulk__" ||
                            isTimedOutMatchActionPending;

                          return (
                            <div
                              key={match.id}
                              className={`flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                                isTimedOut
                                  ? "border-red-200 bg-red-50"
                                  : "border-zinc-200 bg-zinc-50"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={selectedMatches.includes(match.id)}
                                  onChange={() => toggleSelectedMatch(match.id)}
                                  className="mt-1 h-4 w-4 rounded border-zinc-300"
                                />
                                <div>
                                  <div className="font-medium">
                                    {match.teamAName} vs {match.teamBName}
                                  </div>
                                  {isTimedOut && (
                                    <div className="mt-2 inline-flex w-fit border border-red-300 bg-red-100 px-2 py-1 text-xs font-black uppercase tracking-wide text-red-700">
                                      ⚠️ ЧЕК-ИН ПРОВАЛЕН
                                    </div>
                                  )}
                                  <div className="mt-1 text-sm text-zinc-500">
                                    Round: {match.roundLabel}
                                  </div>
                                  <div className="text-sm text-zinc-500">
                                    Format: {match.format}
                                  </div>
                                  <div className="text-sm text-zinc-500">
                                    Status: {match.status}
                                  </div>
                                  {match.scheduledAt && (
                                    <div className="text-sm text-zinc-500">
                                      Scheduled: {new Date(
                                        match.scheduledAt
                                      ).toLocaleString()}
                                    </div>
                                  )}
                                  {isTimedOut && (
                                    <div className="text-sm font-medium text-red-700">
                                      Check-ins: {match.teamAName} (
                                      {match.teamACheckInCount}/{REQUIRED_TEAM_CHECK_INS}) ·{" "}
                                      {match.teamBName} ({match.teamBCheckInCount}/
                                      {REQUIRED_TEAM_CHECK_INS})
                                    </div>
                                  )}
                                  {isCompletedMatch &&
                                    match.teamAScore !== null &&
                                    match.teamBScore !== null && (
                                      <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <div className="text-sm text-zinc-500">
                                          Score: {match.teamAScore} - {match.teamBScore}
                                        </div>
                                        <TournamentMatchTechnicalBadges
                                          match={match}
                                          variant="admin"
                                        />
                                      </div>
                                    )}
                                  {isCompletedMatch &&
                                    (match.teamAScore === null || match.teamBScore === null) &&
                                    match.isForfeit && (
                                      <TournamentMatchTechnicalBadges
                                        match={match}
                                        variant="admin"
                                        className="mt-1"
                                      />
                                    )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                                {isTimedOut && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleEnableMatchAdminOverride(match.id)
                                      }
                                      disabled={isMutatingMatch}
                                      className="rounded border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-200 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                                    >
                                      {isOverridePending
                                        ? "Включение..."
                                        : "Включить Admin Override"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleResolveTimedOutMatch(match.id)
                                      }
                                      disabled={isMutatingMatch}
                                      className="rounded border border-red-300 bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-200 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                                    >
                                      {isTechnicalDefeatPending
                                        ? "Оформление..."
                                        : "Оформить Тех. Поражение"}
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleEditMatch(match)}
                                  disabled={isMutatingMatch}
                                  className="rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                                >
                                  Edit Match
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteMatch(match.id)}
                                  disabled={isMutatingMatch}
                                  className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                                >
                                  {isDeletingMatchId === match.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "social" && (
            <div className="space-y-6">
              <section className="border border-zinc-300 bg-white p-5 shadow-md">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Социальные сети
                </h2>

                <div className="space-y-4">
                  <div className="text-sm text-zinc-600">
                    Активный турнир:{" "}
                    <span className="font-medium text-zinc-900">
                      {activeTournament?.name ?? "Не выбран"}
                    </span>
                  </div>

                  <div className="border-[3px] border-[#061726] bg-white px-4 py-4 shadow-[4px_4px_0px_0px_#061726]">
                    <div className="text-sm font-bold uppercase tracking-wide text-[#061726]">
                      Фоны шаблонов
                    </div>
                    <div className="mt-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          {renderTemplateStatusBadge(hasStandingsBackground)}
                          <label className="mt-3 block text-sm font-medium text-zinc-700">
                            Фон таблицы (`standings-bg.png`)
                            <input
                              key={standingsBackgroundInputKey}
                              type="file"
                              accept="image/png"
                              onChange={(event) =>
                                setSelectedStandingsBackgroundFile(
                                  event.target.files?.[0] ?? null
                                )
                              }
                              className="mt-2 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleUploadStandingsBackground()}
                          disabled={
                            !selectedStandingsBackgroundFile || isUploadingStandingsBackground
                          }
                          className="inline-flex items-center justify-center gap-2 rounded border-[3px] border-[#061726] bg-[#CD9C3E] px-4 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                        >
                          {isUploadingStandingsBackground && (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#061726] border-t-transparent" />
                          )}
                          {isUploadingStandingsBackground ? "Загрузка..." : "Загрузить"}
                        </button>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          {renderTemplateStatusBadge(hasScheduleBackground)}
                          <label className="mt-3 block text-sm font-medium text-zinc-700">
                            Фон расписания (`schedule-bg.png`)
                            <input
                              key={scheduleBackgroundInputKey}
                              type="file"
                              accept="image/png"
                              onChange={(event) =>
                                setSelectedScheduleBackgroundFile(
                                  event.target.files?.[0] ?? null
                                )
                              }
                              className="mt-2 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm outline-none"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleUploadScheduleBackground()}
                          disabled={
                            !selectedScheduleBackgroundFile || isUploadingScheduleBackground
                          }
                          className="inline-flex items-center justify-center gap-2 rounded border-[3px] border-[#061726] bg-[#CD9C3E] px-4 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                        >
                          {isUploadingScheduleBackground && (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#061726] border-t-transparent" />
                          )}
                          {isUploadingScheduleBackground ? "Загрузка..." : "Загрузить"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-[3px] border-[#061726] bg-white px-4 py-4 shadow-[4px_4px_0px_0px_#061726]">
                    <div className="text-sm font-bold uppercase tracking-wide text-[#061726]">
                      Экспорт таблицы
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">
                      Сгенерировать PNG-баннер `1080x1440` через `next/og`.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleDownloadStandingsImage()}
                      disabled={!activeTournament || isGeneratingStandingsImage}
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded border-[3px] border-[#061726] bg-[#061726] px-4 py-2 text-sm font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#CD9C3E] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#CD9C3E] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                    >
                      {isGeneratingStandingsImage && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      )}
                      {isGeneratingStandingsImage
                        ? "Генерация..."
                        : "Скачать таблицу (3:4)"}
                    </button>
                  </div>

                  <div className="border-[3px] border-[#061726] bg-white px-4 py-4 shadow-[4px_4px_0px_0px_#061726]">
                    <div className="text-sm font-bold uppercase tracking-wide text-[#061726]">
                      Экспорт расписания
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">
                      Сгенерировать PNG-баннеры расписания матчей на даты по времени Алматы.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void handleDownloadScheduleImage("today")}
                        disabled={!activeTournament || isGeneratingScheduleDay !== null}
                        className="inline-flex items-center justify-center gap-2 rounded border-[3px] border-[#061726] bg-[#061726] px-4 py-2 text-sm font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#CD9C3E] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#CD9C3E] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                      >
                        {isGeneratingScheduleDay === "today" && (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        )}
                        {isGeneratingScheduleDay === "today"
                          ? "Генерация..."
                          : "РАСПИСАНИЕ НА СЕГОДНЯ"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadScheduleImage("tomorrow")}
                        disabled={!activeTournament || isGeneratingScheduleDay !== null}
                        className="inline-flex items-center justify-center gap-2 rounded border-[3px] border-[#061726] bg-[#061726] px-4 py-2 text-sm font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#CD9C3E] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#CD9C3E] disabled:translate-y-0 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:shadow-none"
                      >
                        {isGeneratingScheduleDay === "tomorrow" && (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        )}
                        {isGeneratingScheduleDay === "tomorrow"
                          ? "Генерация..."
                          : "РАСПИСАНИЕ НА ЗАВТРА"}
                      </button>
                    </div>
                  </div>

                  {socialErrorMessage && (
                    <p className="text-sm text-zinc-600">{socialErrorMessage}</p>
                  )}

                  {socialSuccessMessage && (
                    <p className="text-sm text-zinc-600">{socialSuccessMessage}</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
        )}
      </main>
    </div>
  );
}
