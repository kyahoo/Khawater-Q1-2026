"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminForceConfirmTeam,
  adminForceAddPlayerToTeam,
  adminRemovePlayerFromTeam,
  createAdminPlayerAction,
  deletePlayer,
  deleteMultipleMatches,
  deleteMatch,
  deleteTeam,
  generateGroupStageMatches,
  listAdminPlayers,
  toggleTeamSuspension,
  updateTournamentMatchAction,
  type AdminPlayerListItem,
} from "./actions";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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
  type AdminTournamentEntryTeam,
  type TournamentMatch,
  type Tournament,
} from "@/lib/supabase/tournaments";

const EMPTY_MATCH_FORM = {
  teamAId: "",
  teamBId: "",
  roundLabel: "",
  scheduledAt: "",
  status: "scheduled",
  teamAScore: "",
  teamBScore: "",
  format: "BO3",
};

const EMPTY_GROUP_STAGE_FORM = {
  tournamentId: "",
  teamIds: [] as string[],
  startDate: "",
  endDate: "",
  dailyStartTime: "18:00",
  dailyEndTime: "23:30",
  matchIntervalMinutes: "90",
};

const MATCH_FORMAT_OPTIONS = ["BO1", "BO2", "BO3"] as const;

const MATCH_ROUND_OPTIONS = [
  "Group Stage",
  "Upper Bracket Round 1",
  "Lower Bracket Round 1",
  "Upper Bracket Round 2",
  "Lower Bracket Round 2",
  "Upper Bracket Finals",
  "Lower Bracket Finals",
  "Grand Finals",
] as const;

const TOURNAMENT_GROUP_OPTIONS = [1, 2, 4] as const;
const TEAMS_ELIMINATED_OPTIONS = [0, 1, 2, 3, 4] as const;
const PLAYOFF_FORMAT_OPTIONS = [
  "Single Elimination",
  "Double Elimination",
] as const;

const ADMIN_TABS = [
  { id: "players", label: "Players" },
  { id: "teams", label: "Teams" },
  { id: "tournaments", label: "Tournaments" },
] as const;

type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

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
  const [isDeletingTeamId, setIsDeletingTeamId] = useState<string | null>(null);
  const [isDeletingMatchId, setIsDeletingMatchId] = useState<string | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTabId>("players");

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

  async function loadAdminData() {
    setPageErrorMessage("");
    setEntrySectionErrorMessage("");
    setMatchesSectionErrorMessage("");
    const accessToken = await getCurrentAdminAccessToken();

    const [nextTournaments, nextTeams, nextProfiles, nextPlayersResult] = await Promise.all([
      listTournaments(),
      listTeamsWithMeta(),
      listProfilesWithTeamMeta(),
      listAdminPlayers(accessToken),
    ]);

    if (nextPlayersResult.error) {
      throw new Error(nextPlayersResult.error);
    }

    setTournaments(nextTournaments);
    setTeams(nextTeams);
    setProfiles(nextProfiles);
    setPlayers(nextPlayersResult.players);

    const nextActiveTournament =
      nextTournaments.find((tournament) => tournament.is_active) ?? null;

    if (!nextActiveTournament) {
      setEntryTeams([]);
      setMatches([]);
      return;
    }

    try {
      const nextEntryTeams = await listAdminTournamentEntryTeams(
        nextActiveTournament.id
      );
      setEntryTeams(nextEntryTeams);
      setEntrySectionErrorMessage("");
    } catch {
      setEntryTeams([]);
      setEntrySectionErrorMessage(
        "Tournament entry data is unavailable right now."
      );
    }

    try {
      const nextMatches = await getTournamentMatchesForTournament(
        nextActiveTournament.id
      );
      setMatches(nextMatches);
      setMatchesSectionErrorMessage("");
    } catch {
      setMatches([]);
      setMatchesSectionErrorMessage("Match data is unavailable right now.");
    }
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
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      const nextProfile = await getProfileByUserId(user.id);
      setProfile(nextProfile);

      if (!nextProfile?.is_admin) {
        return;
      }

      await loadAdminData();
    } catch (error) {
      setPageErrorMessage(
        error instanceof Error ? error.message : "Could not load admin page."
      );
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadAdminPage();
  }, [router]);

  const activeTournament =
    tournaments.find((tournament) => tournament.is_active) ?? null;
  const hasAdminAccess = profile?.is_admin ?? false;
  const isEditingMatch = editingMatchId !== null;
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const enteredTeams = entryTeams.filter((team) => team.hasEntered);
  const enteredGroupStageTeams = groupStageTeams.filter((team) => team.hasEntered);
  const groupStageMatchCount =
    groupStageForm.teamIds.length >= 2
      ? (groupStageForm.teamIds.length * (groupStageForm.teamIds.length - 1)) / 2
      : 0;
  const availableProfilesToAdd = profiles.filter(
    (candidate) => !candidate.currentTeamId
  );

  useEffect(() => {
    if (!selectedTeamId) {
      setSelectedTeamMembers([]);
      return;
    }

    void loadSelectedTeamMembers(selectedTeamId);
  }, [selectedTeamId]);

  useEffect(() => {
    const availableMatchIds = new Set(matches.map((match) => match.id));
    setSelectedMatches((current) => current.filter((matchId) => availableMatchIds.has(matchId)));
  }, [matches]);

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
      });
      setTournaments((current) => [createdTournament, ...current]);
      setNewTournamentName("");
      setNewTournamentNumberOfGroups("1");
      setNewTournamentTeamsEliminatedPerGroup("2");
      setNewTournamentPlayoffFormat("Single Elimination");
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

      await loadAdminData();
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

      await loadAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete player."
      );
    } finally {
      setIsDeletingPlayerUserId(null);
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

      await loadAdminData();
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

      await loadAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete match."
      );
    } finally {
      setIsDeletingMatchId(null);
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
      await loadAdminData();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete selected matches."
      );
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
      await loadAdminData();
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

      await loadAdminData();
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
      await loadAdminData();
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
      await loadAdminData();
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
      await loadAdminData();
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
      await loadAdminData();
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
      await loadAdminData();
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

      await loadAdminData();
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
      await loadAdminData();
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
        });
      }

      await loadAdminData();
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
        intervalMinutes
      );

      if (result.error) {
        throw new Error(result.error);
      }

      await loadAdminData();
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
      <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-5xl text-sm text-zinc-600">
          Loading admin...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <div className="border-b border-zinc-300 bg-zinc-200 px-6 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold">Admin</span>
          </div>
          <div className="text-sm text-zinc-600">
            Guard: profiles.is_admin must be true
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {pageErrorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{pageErrorMessage}</p>
        )}
        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        {!hasAdminAccess ? (
          <section className="border border-zinc-300 bg-white p-5">
            <h1 className="mb-3 text-2xl font-semibold">Admin</h1>
            <p className="text-sm text-zinc-600">
              You do not have admin access for this area.
            </p>
          </section>
        ) : (
        <div className="space-y-6">
          <section className="border border-zinc-300 bg-white p-5">
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
              <section className="border border-zinc-300 bg-white p-5">
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

              <section className="border border-zinc-300 bg-white p-5">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Manage Players
                </h2>

                {players.length === 0 ? (
                  <p className="text-sm text-zinc-600">No registered players found yet.</p>
                ) : (
                  <div className="space-y-3">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className="flex flex-col gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="font-medium">{player.nickname}</div>
                          <div className="mt-1 text-sm text-zinc-500">{player.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeletePlayer(player.id)}
                          disabled={isDeletingPlayerUserId === player.id}
                          className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                        >
                          {isDeletingPlayerUserId === player.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "teams" && (
            <div className="space-y-6">
              <section className="border border-zinc-300 bg-white p-5">
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
                          {team.isLockedForActiveTournament && (
                            <div className="text-sm text-zinc-500">
                              Roster locked after tournament entry
                            </div>
                          )}
                        </div>
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
                          onClick={() => void handleDeleteTeam(team.id)}
                          disabled={isDeletingTeamId === team.id}
                          className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                        >
                          {isDeletingTeamId === team.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {selectedTeam && (
                <section className="border border-zinc-300 bg-white p-5">
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

              <section className="border border-zinc-300 bg-white p-5">
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
              <section className="border border-zinc-300 bg-white p-5">
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
              </section>

              <section className="border border-zinc-300 bg-white p-5">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Tournaments
                </h2>

                {tournaments.length === 0 ? (
                  <p className="text-sm text-zinc-600">No tournaments created yet.</p>
                ) : (
                  <div className="space-y-3">
                    {tournaments.map((tournament) => (
                      <div
                        key={tournament.id}
                        className="flex flex-col gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="font-medium">{tournament.name}</div>
                          <div className="mt-1 text-sm text-zinc-500">
                            Status: {tournament.is_active ? "Active" : "Inactive"}
                          </div>
                        </div>
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
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="border border-zinc-300 bg-white p-5">
                <h2 className="mb-4 text-lg font-semibold text-zinc-500">
                  Generate Group Stage
                </h2>

                {tournaments.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    Create a tournament before generating group stage matches.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                          Daily End Time (Latest allowed match start)
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
                          Group Stage, BO3, scheduled. Scheduling uses the
                          daily Almaty-time window and rolls to the next day
                          when a slot would exceed it.
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

              <section className="border border-zinc-300 bg-white p-5">
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
                              checked={selectedMatches.length > 0 && selectedMatches.length === matches.length}
                              onChange={(event) =>
                                setSelectedMatches(
                                  event.target.checked ? matches.map((match) => match.id) : []
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
                        {matches.map((match) => (
                          <div
                            key={match.id}
                            className="flex flex-col gap-3 border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
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
                                  Scheduled: {new Date(match.scheduledAt).toLocaleString()}
                                </div>
                              )}
                              {match.status === "finished" &&
                                match.teamAScore !== null &&
                                match.teamBScore !== null && (
                                  <div className="text-sm text-zinc-500">
                                    Score: {match.teamAScore} - {match.teamBScore}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => handleEditMatch(match)}
                                disabled={isDeletingMatchId === match.id || isDeletingMatchId === "__bulk__"}
                                className="rounded border border-zinc-400 bg-zinc-100 px-4 py-2 text-sm font-medium"
                              >
                                Edit Match
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteMatch(match.id)}
                                disabled={isDeletingMatchId === match.id || isDeletingMatchId === "__bulk__"}
                                className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                              >
                                {isDeletingMatchId === match.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
        )}
      </main>
    </div>
  );
}
