"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { OnboardingChecklist } from "@/components/profile/OnboardingChecklist";
import { PushToggleButton } from "@/components/profile/PushToggleButton";
import { getProfileByUserId, type Profile } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteTeamIfLastCaptain,
  getCurrentTeamDetails,
  leaveCurrentTeam,
} from "@/lib/supabase/teams";
import {
  confirmTournamentParticipation,
  getActiveTournament,
  getTournamentConfirmation,
  type Tournament,
} from "@/lib/supabase/tournaments";
import {
  finalizeSteamLink,
  getProfilePasskeyBindingStatus,
  getProfilePasskeyRegistrationOptions,
  updateProfileName,
  verifyProfilePasskeyRegistration,
} from "./actions";

function getWebAuthnErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "NotAllowedError") {
      return "Регистрация устройства была отменена или время ожидания истекло.";
    }

    if (error.name === "InvalidStateError") {
      return "Это устройство уже привязано к вашему аккаунту.";
    }

    if (error.name === "SecurityError") {
      return "Passkeys недоступны для текущего адреса сайта.";
    }

    if (error.message) {
      return error.message;
    }
  }

  return "Не удалось привязать устройство.";
}

type ProfilePageClientProps = {
  hasPendingSteamLink: boolean;
};

function getBehaviorScoreColorClass(score: number) {
  if (score >= 4) {
    return "text-[#CD9C3E]";
  }

  if (score >= 2) {
    return "text-[#F59E0B]";
  }

  return "text-red-500";
}

export function ProfilePageClient({
  hasPendingSteamLink: initialHasPendingSteamLink,
}: ProfilePageClientProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [localOwnerId, setLocalOwnerId] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<Awaited<
    ReturnType<typeof getCurrentTeamDetails>
  > | null>(null);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMutatingTeam, setIsMutatingTeam] = useState(false);
  const [isConfirmingParticipation, setIsConfirmingParticipation] = useState(false);
  const [isParticipationConfirmed, setIsParticipationConfirmed] = useState(false);
  const [isRegisteringDevice, setIsRegisteringDevice] = useState(false);
  const [isLinkingSteam, setIsLinkingSteam] = useState(false);
  const [isFinalizingSteam, setIsFinalizingSteam] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameValue, setNewNameValue] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasLoadedDeviceBinding, setHasLoadedDeviceBinding] = useState(false);
  const [isDeviceBound, setIsDeviceBound] = useState(false);
  const [hasPushSubscription, setHasPushSubscription] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState("");
  const [hasPendingSteamLink, setHasPendingSteamLink] = useState(
    initialHasPendingSteamLink
  );
  const isCaptain = teamData?.membership.is_captain ?? false;
  const isLastMember = (teamData?.members.length ?? 0) === 1;
  const cardClassName =
    "mb-6 flex flex-col gap-4 border-[3px] border-[#061726] bg-[#0B3A4A] p-6 shadow-[6px_6px_0px_0px_#061726]";
  const cardHeadingClassName =
    "mb-2 text-xl font-black uppercase tracking-wide text-[#CD9C3E]";
  const bodyTextClassName = "text-base font-medium text-white md:text-lg";
  const mutedStatusButtonClassName =
    "w-fit cursor-not-allowed border-[3px] border-[#061726] bg-gray-700 px-6 py-2 text-center text-sm font-bold uppercase text-gray-300";
  const primaryActionButtonClassName =
    "w-fit border-[3px] border-[#061726] bg-white px-6 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]";
  const destructiveActionButtonClassName =
    "w-fit border-[3px] border-[#061726] bg-red-600 px-6 py-2 font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]";
  const successDeviceButtonClassName =
    "bg-green-800 text-green-200 font-bold uppercase px-6 py-2 border-[3px] border-[#061726] shadow-[4px_4px_0px_0px_#061726] opacity-90 cursor-not-allowed w-fit text-sm text-center";
  const blockedDeviceButtonClassName =
    "bg-red-900 text-red-200 font-bold uppercase px-6 py-2 border-[3px] border-[#061726] shadow-[4px_4px_0px_0px_#061726] opacity-90 cursor-not-allowed w-fit text-sm text-center";
  const hasPasskey = isDeviceBound;
  const isReadyToBind = !hasPasskey && (!localOwnerId || localOwnerId === currentUserId);
  const isBoundHere = hasPasskey && Boolean(currentUserId) && localOwnerId === currentUserId;
  const isBoundElsewhere =
    hasPasskey && Boolean(currentUserId) && localOwnerId !== currentUserId;
  const isDeviceOccupied =
    !hasPasskey && Boolean(localOwnerId) && Boolean(currentUserId) && localOwnerId !== currentUserId;
  const displayName = profile?.username ?? profile?.nickname ?? "Игрок";
  const behaviorScore = profile?.behaviorScore ?? 5;
  const behaviorScoreLabel =
    behaviorScore >= 0 ? `${behaviorScore} / 5` : `${behaviorScore}`;
  const behaviorScoreColorClass = getBehaviorScoreColorClass(behaviorScore);
  const hasName = Boolean(profile?.nickname?.trim());
  const hasSteam = Boolean(profile?.steamId?.trim());
  const hasDevice = hasPasskey;
  const hasTeam = Boolean(teamData?.team.id);
  const isConfirmed = Boolean(teamData && activeTournament && isParticipationConfirmed);
  const isTournamentLocked = Boolean(activeTournament && isParticipationConfirmed);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!user) {
        router.replace("/auth");
        return;
      }

      setCurrentUserId(user.id);

      if (!session?.access_token) {
        router.replace("/auth");
        return;
      }

      const nextProfile = await getProfileByUserId(user.id);

      if (!nextProfile) {
        router.replace("/player-setup");
        return;
      }

      setProfile(nextProfile);
      const [nextTeamData, nextActiveTournament, deviceBindingStatus, pushSubscriptionCount] =
        await Promise.all([
          getCurrentTeamDetails(user.id),
          getActiveTournament(),
          getProfilePasskeyBindingStatus(session.access_token),
          supabase
            .from("push_subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

      setTeamData(nextTeamData);
      setActiveTournament(nextActiveTournament);
      setHasPushSubscription((pushSubscriptionCount.count ?? 0) > 0);

      if (deviceBindingStatus.error) {
        setHasLoadedDeviceBinding(false);
        setDeviceMessage(deviceBindingStatus.error);
      } else {
        setHasLoadedDeviceBinding(true);
        setIsDeviceBound(deviceBindingStatus.isDeviceBound);
        setDeviceMessage("");
      }

      if (nextActiveTournament && nextTeamData) {
        const confirmation = await getTournamentConfirmation(
          nextActiveTournament.id,
          user.id
        );
        setIsParticipationConfirmed(Boolean(confirmation));
      } else {
        setIsParticipationConfirmed(false);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось загрузить профиль."
      );
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const localOwner = localStorage.getItem("khawater_device_owner");
    setLocalOwnerId(localOwner);
  }, []);

  useEffect(() => {
    setHasPendingSteamLink(initialHasPendingSteamLink);
  }, [initialHasPendingSteamLink]);

  useEffect(() => {
    setNewNameValue(profile?.username ?? profile?.nickname ?? "");
  }, [profile?.nickname, profile?.username]);

  useEffect(() => {
    if (isTournamentLocked) {
      setIsEditingName(false);
    }
  }, [isTournamentLocked]);

  useEffect(() => {
    if (!hasLoadedDeviceBinding || hasPasskey || !currentUserId) {
      return;
    }

    if (localOwnerId === currentUserId) {
      localStorage.removeItem("khawater_device_owner");
      setLocalOwnerId(null);
    }
  }, [currentUserId, hasLoadedDeviceBinding, hasPasskey, localOwnerId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleLeaveTeam() {
    setIsMutatingTeam(true);
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

      await leaveCurrentTeam(user.id);
      setTeamData(null);
      setIsParticipationConfirmed(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not leave team."
      );
    } finally {
      setIsMutatingTeam(false);
    }
  }

  async function handleDeleteTeam() {
    setIsMutatingTeam(true);
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

      await deleteTeamIfLastCaptain(user.id);
      setTeamData(null);
      setIsParticipationConfirmed(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete team."
      );
    } finally {
      setIsMutatingTeam(false);
    }
  }

  async function handleConfirmParticipation() {
    setIsConfirmingParticipation(true);
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

      if (!activeTournament) {
        throw new Error("Активный турнир не найден.");
      }

      if (!teamData) {
        throw new Error(
          "Join or create a team before confirming tournament participation."
        );
      }

      await confirmTournamentParticipation(activeTournament.id, user.id);
      setIsParticipationConfirmed(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось подтвердить участие."
      );
    } finally {
      setIsConfirmingParticipation(false);
    }
  }

  async function handleRegisterDevice() {
    if (isDeviceOccupied) {
      setDeviceMessage("Это устройство уже занято другим игроком.");
      return;
    }

    if (!hasLoadedDeviceBinding || !isReadyToBind) {
      setDeviceMessage(hasPasskey ? "" : "Не удалось проверить привязку устройства.");
      return;
    }

    setIsRegisteringDevice(true);
    setDeviceMessage("");
    setErrorMessage("");

    try {
      if (!browserSupportsWebAuthn()) {
        setDeviceMessage("Ваше устройство или браузер не поддерживает Passkeys.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/auth");
        return;
      }

      const beginResult = await getProfilePasskeyRegistrationOptions(session.access_token);

      if (beginResult.error || !beginResult.options) {
        if (beginResult.error === "Аккаунт уже привязан к устройству") {
          setIsDeviceBound(true);
          setHasLoadedDeviceBinding(true);
          setDeviceMessage("");
          return;
        }

        setDeviceMessage(beginResult.error ?? "Не удалось начать регистрацию устройства.");
        return;
      }

      const response = await startRegistration({
        optionsJSON: beginResult.options,
      });

      const finishResult = await verifyProfilePasskeyRegistration(
        session.access_token,
        response
      );

      if (finishResult.error) {
        if (finishResult.error === "Аккаунт уже привязан к устройству") {
          setIsDeviceBound(true);
          setHasLoadedDeviceBinding(true);
          setDeviceMessage("");
          return;
        }

        setDeviceMessage(finishResult.error);
        return;
      }

      setIsDeviceBound(true);
      setHasLoadedDeviceBinding(true);
      setDeviceMessage("");
      if (currentUserId) {
        localStorage.setItem("khawater_device_owner", currentUserId);
        setLocalOwnerId(currentUserId);
      }
      router.refresh();
    } catch (error) {
      setDeviceMessage(getWebAuthnErrorMessage(error));
    } finally {
      setIsRegisteringDevice(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось выполнить выход."
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleLinkSteam() {
    setIsLinkingSteam(true);
    setErrorMessage("");

    try {
      window.location.href = "/api/steam/login";
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось привязать Steam."
      );
      setIsLinkingSteam(false);
    }
  }

  async function handleFinalizeSteam() {
    setIsFinalizingSteam(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const result = await finalizeSteamLink(data.session?.access_token || "");

      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      setHasPendingSteamLink(false);
      router.replace("/profile");
      await loadProfile();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось завершить привязку Steam."
      );
    } finally {
      setIsFinalizingSteam(false);
    }
  }

  function handleStartEditingName() {
    if (isTournamentLocked) {
      return;
    }

    setNewNameValue(profile?.username ?? profile?.nickname ?? "");
    setIsEditingName(true);
    setErrorMessage("");
  }

  function handleCancelEditingName() {
    setNewNameValue(profile?.username ?? profile?.nickname ?? "");
    setIsEditingName(false);
  }

  async function handleSaveProfileName() {
    setIsSavingName(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const trimmedName = newNameValue.trim();
      const result = await updateProfileName(
        data.session?.access_token || "",
        trimmedName
      );

      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              username: trimmedName,
            }
          : currentProfile
      );
      setNewNameValue(trimmedName);
      setIsEditingName(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось обновить имя."
      );
    } finally {
      setIsSavingName(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-5xl text-sm text-zinc-600">
          Загрузка профиля...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-zinc-900">

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-8 inline-block border-[3px] border-[#061726] bg-[#0B3A4A] px-6 py-3 text-4xl font-black uppercase text-[#CD9C3E] shadow-[6px_6px_0px_0px_#061726] md:text-5xl">
          Профиль
        </h1>

        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <OnboardingChecklist
              hasName={hasName}
              hasSteam={hasSteam}
              hasDevice={hasDevice}
              hasTeam={hasTeam}
              isConfirmed={isConfirmed}
              hasPushSubscription={hasPushSubscription}
            />

            <div className={cardClassName}>
              <div className="mb-2">
                {isEditingName ? (
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={newNameValue}
                      onChange={(event) => setNewNameValue(event.target.value)}
                      disabled={isSavingName}
                      maxLength={32}
                      placeholder="Введите имя"
                      className="w-full border-[3px] border-[#061726] bg-[#123C4D] px-4 py-3 text-2xl font-black text-white shadow-[4px_4px_0px_0px_#061726] outline-none placeholder:text-white/45 focus:border-[#CD9C3E] md:max-w-xl"
                    />
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void handleSaveProfileName()}
                        disabled={isSavingName}
                        className="border-[3px] border-[#061726] bg-[#CD9C3E] px-5 py-2 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70"
                      >
                        {isSavingName ? "СОХРАНЕНИЕ..." : "СОХРАНИТЬ"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditingName}
                        disabled={isSavingName}
                        className="border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-5 py-2 text-sm font-black uppercase text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-70"
                      >
                        ОТМЕНА
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">{displayName}</div>
                      {isTournamentLocked && (
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">
                          Имя заблокировано на время турнира
                        </p>
                      )}
                    </div>
                    {!isTournamentLocked && (
                      <button
                        type="button"
                        onClick={handleStartEditingName}
                        className="w-fit border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                      >
                        ИЗМЕНИТЬ
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!profile?.steamId ? (
                hasPendingSteamLink ? (
                  <div className="mt-2 border-[4px] border-[#CD9C3E] bg-[#061726] p-5 shadow-[6px_6px_0px_0px_#CD9C3E]">
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                      Steam Link
                    </p>
                    <p className="mt-3 max-w-xl text-sm font-medium text-white">
                      Авторизация в Steam завершена. Подтвердите привязку аккаунта
                      первым кликом на сайте.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleFinalizeSteam()}
                      disabled={isFinalizingSteam}
                      className="mt-4 flex w-full items-center justify-center border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-4 text-center text-base font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70 md:w-auto"
                    >
                      {isFinalizingSteam
                        ? "ПОДТВЕРЖДЕНИЕ..."
                        : "ШАГ 2: ПОДТВЕРДИТЬ ПРИВЯЗКУ"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleLinkSteam()}
                    disabled={isLinkingSteam}
                    className="flex w-full items-center justify-center gap-2 border-[3px] border-[#061726] bg-[#171A21] px-6 py-3 font-black uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-70 md:w-auto"
                  >
                    {isLinkingSteam ? "ПРИВЯЗКА STEAM..." : "ПРИВЯЗАТЬ STEAM"}
                  </button>
                )
              ) : (
                <div className="mt-2 border-[3px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#061726]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {profile.avatarUrl ? (
                      <Image
                        src={profile.avatarUrl}
                        alt={`Аватар Steam ${profile.username ?? profile.nickname}`}
                        width={64}
                        height={64}
                        unoptimized
                        className="h-16 w-16 border-[3px] border-[#061726] object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 border-[3px] border-[#061726] bg-[#0B3A4A]" />
                    )}
                    <div className="space-y-2">
                      <p className="text-lg font-black uppercase text-white">
                        {profile.username ?? profile.nickname}
                      </p>
                      <p className="text-sm font-bold text-gray-300">
                        SteamID64: {profile.steamId}
                      </p>
                      <span className="inline-flex w-fit border-[3px] border-[#061726] bg-green-800 px-4 py-2 text-sm font-black uppercase text-green-200 shadow-[4px_4px_0px_0px_#061726]">
                        STEAM ПРИВЯЗАН
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => void handleRegisterDevice()}
                  disabled={
                    isRegisteringDevice ||
                    !hasLoadedDeviceBinding ||
                    isBoundHere ||
                    isBoundElsewhere ||
                    isDeviceOccupied ||
                    !isReadyToBind
                  }
                  className={
                    isRegisteringDevice
                      ? mutedStatusButtonClassName
                      : isBoundHere
                        ? successDeviceButtonClassName
                        : isBoundElsewhere || isDeviceOccupied
                          ? blockedDeviceButtonClassName
                          : !hasLoadedDeviceBinding
                            ? mutedStatusButtonClassName
                            : primaryActionButtonClassName
                  }
                >
                  {isRegisteringDevice
                    ? "Привязка..."
                    : isBoundHere
                      ? "Устройство привязано"
                      : isBoundElsewhere
                        ? "Привязано к другому устройству"
                        : isDeviceOccupied
                          ? "Устройство занято другим игроком"
                          : isReadyToBind
                            ? "Привязать устройство"
                            : !hasLoadedDeviceBinding
                              ? "Проверяю привязку..."
                              : hasPasskey
                                ? "Устройство привязано"
                                : "Привязать устройство"}
                </button>
                {deviceMessage && (
                  <p className="text-sm text-white/80">{deviceMessage}</p>
                )}
              </div>
              <div className="mt-5 max-w-xl border-[3px] border-[#061726] bg-[#123C4D] p-5 shadow-[4px_4px_0px_0px_#061726]">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-white">
                  Зачем включать уведомления?
                </p>
                <ul className="mt-3 space-y-2 text-sm font-bold text-white/90">
                  <li className="flex items-start gap-2">
                    <span className="text-[#CD9C3E]">•</span>
                    <span>Важные анонсы турнира</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#CD9C3E]">•</span>
                    <span>Напоминания перед стартом матчей</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#CD9C3E]">•</span>
                    <span>Уведомления о готовности лобби</span>
                  </li>
                </ul>
                <div className="mt-4">
                  <PushToggleButton />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="mt-6 w-fit border-[3px] border-[#061726] bg-red-500 px-6 py-2 font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
              >
                {isSigningOut ? "Выход..." : "ВЫЙТИ ИЗ АККАУНТА"}
              </button>
            </div>

            <div className="flex flex-col gap-5 border-2 border-[#CD9C3E] bg-[#0B3A4A] p-6 text-white shadow-[6px_6px_0px_0px_#000]">
              <div className="space-y-3">
                <h2 className="text-xl font-black uppercase tracking-wide text-[#CD9C3E]">
                  БАЛЛ ПОВЕДЕНИЯ
                </h2>
                <p
                  className={`text-5xl font-black uppercase leading-none md:text-6xl ${behaviorScoreColorClass} [text-shadow:3px_3px_0_#000]`}
                >
                  {behaviorScoreLabel}
                </p>
              </div>

              <div className="border-t border-white/20 pt-5">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-white/75">
                  Как сохранить баллы:
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm font-medium leading-6 text-white/90 md:text-base">
                  <li>Не опаздывайте на чек-ин матчей.</li>
                  <li>
                    Капитаны: загружайте результаты и скриншоты лобби в течение
                    12 часов после старта.
                  </li>
                  <li>Остальные игроки: загружайте скриншоты лобби до начала игр.</li>
                </ul>
              </div>

              <div className="border-t border-white/20 pt-5">
                <p className="text-sm font-black leading-6 text-red-500">
                  ⚠️ ВНИМАНИЕ: Низкий балл поведения может привести к запрету на
                  участие в будущих турнирах Khawater.
                </p>
              </div>
            </div>

            <div className={cardClassName}>
              <h2 className={cardHeadingClassName}>Статус команды</h2>
              <div className="space-y-3">
                <div className={bodyTextClassName}>
                  Команда:{" "}
                  <span className="font-medium text-white">
                    {teamData ? teamData.team.name : "Команды пока нет"}
                  </span>
                </div>
              </div>

              {teamData && (
                <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                  <Link
                    href="/my-team"
                    className="block w-fit border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-2 text-center font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                  >
                    Перейти к управлению составом
                  </Link>
                  {isCaptain && isLastMember ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteTeam()}
                      disabled={isMutatingTeam}
                      className={destructiveActionButtonClassName}
                    >
                      {isMutatingTeam ? "Обработка..." : "Удалить команду"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleLeaveTeam()}
                      disabled={isMutatingTeam}
                      className={destructiveActionButtonClassName}
                    >
                      {isMutatingTeam ? "Обработка..." : "Покинуть команду"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={cardClassName}>
              <h2 className={cardHeadingClassName}>Участие в текущем турнире</h2>
              <div className="space-y-3">
                <div className={bodyTextClassName}>
                  Команда:{" "}
                  <span className="font-medium text-white">
                    {teamData ? teamData.team.name : "Команды пока нет"}
                  </span>
                </div>
                <div className={bodyTextClassName}>
                  Турнир:{" "}
                  <span className="font-medium text-white">
                    {activeTournament?.name ?? "Нет активного турнира"}
                  </span>
                </div>
                <div className={bodyTextClassName}>
                  Статус участия:{" "}
                  <span className="font-medium text-white">
                    {isParticipationConfirmed ? "Подтверждено" : "Не подтверждено"}
                  </span>
                </div>
              </div>

              {!teamData && (
                <p className="mt-5 text-sm text-white/80">
                  Создайте команду или вступите в существующую, прежде чем
                  подтверждать участие в турнире.
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleConfirmParticipation()}
                disabled={!activeTournament || !teamData || isConfirmingParticipation}
                className={
                  !activeTournament ||
                  !teamData ||
                  isConfirmingParticipation ||
                  isParticipationConfirmed
                    ? mutedStatusButtonClassName
                    : primaryActionButtonClassName
                }
              >
                {isParticipationConfirmed
                  ? "Участие подтверждено"
                  : isConfirmingParticipation
                    ? "Подтверждение..."
                    : "Подтвердить участие"}
              </button>
            </div>
          </section>

          {!teamData && (
            <aside className="space-y-4">
              <>
                <a href="/create-team" className={cardClassName}>
                  <div className={cardHeadingClassName}>Создать команду</div>
                  <div className={bodyTextClassName}>
                    Откройте свою команду для турниров
                  </div>
                </a>
                <a href="/join-team" className={cardClassName}>
                  <div className={cardHeadingClassName}>Вступить в команду</div>
                  <div className={bodyTextClassName}>
                    Присоединитесь к уже созданному составу
                  </div>
                </a>
              </>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
