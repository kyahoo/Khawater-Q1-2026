"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { OnboardingChecklist } from "@/components/profile/OnboardingChecklist";
import { PushToggleButton } from "@/components/profile/PushToggleButton";
import { PetalOverlay } from "@/components/PetalOverlay";
import { getProfileByUserId, type Profile } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getPlayerMedalTitle,
  PLAYER_MEDAL_META,
} from "@/lib/supabase/player-medals";
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
  updatePlayerMMR,
  updateProfileName,
  verifyProfilePasskeyRegistration,
} from "./actions";

function getWebAuthnErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "NotAllowedError") {
      return "Подключение биометрии было отменено или время ожидания истекло.";
    }

    if (error.name === "InvalidStateError") {
      return "Биометрия уже подключена к вашему аккаунту.";
    }

    if (error.name === "SecurityError") {
      return "Биометрия (Passkeys) недоступна для текущего адреса сайта.";
    }

    if (error.message) {
      return error.message;
    }
  }

  return "Не удалось подключить биометрию.";
}

function sanitizeProfileErrorMessage(message: string | null) {
  if (!message) {
    return null;
  }

  if (
    message.includes("Lock broken by another request") ||
    message.includes("steal")
  ) {
    return null;
  }

  return message;
}

type ProfilePageClientProps = {
  hasPendingSteamLink: boolean;
};

function TeamIdentityRow({
  teamName,
  teamLogoUrl,
  bodyTextClassName,
}: {
  teamName: string | null;
  teamLogoUrl: string | null;
  bodyTextClassName: string;
}) {
  if (!teamName) {
    return (
      <div className={bodyTextClassName}>
        Команда: <span className="font-medium text-white">Команды пока нет</span>
      </div>
    );
  }

  const teamInitial = teamName.trim().charAt(0).toUpperCase() || "К";

  return (
    <div className={bodyTextClassName}>
      <div className="mb-2 flex items-center gap-4">
        {teamLogoUrl ? (
          <Image
            src={teamLogoUrl}
            alt={`Логотип команды ${teamName}`}
            width={56}
            height={56}
            className="h-14 w-14 rounded-sm border border-gray-600 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-gray-600 bg-[#123C4D] text-base font-black uppercase text-white">
            {teamInitial}
          </div>
        )}
        <div>
          <span className="text-white/80">Команда: </span>
          <span className="font-medium text-white">{teamName}</span>
        </div>
      </div>
    </div>
  );
}

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
  const [teamData, setTeamData] = useState<Awaited<
    ReturnType<typeof getCurrentTeamDetails>
  > | null>(null);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMutatingTeam, setIsMutatingTeam] = useState(false);
  const [isConfirmingParticipation, setIsConfirmingParticipation] = useState(false);
  const [isParticipationConfirmed, setIsParticipationConfirmed] = useState(false);
  const [isRegisteringDevice, setIsRegisteringDevice] = useState(false);
  const [isLinkingSteam, setIsLinkingSteam] = useState(false);
  const [isFinalizingSteam, setIsFinalizingSteam] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameValue, setNewNameValue] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [newMMRValue, setNewMMRValue] = useState("");
  const [isSavingMMR, setIsSavingMMR] = useState(false);
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
  const settingsPanelClassName =
    "border-[3px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#061726]";
  const settingsPanelLabelClassName =
    "mb-2 text-xs font-bold uppercase text-gray-400";
  const bodyTextClassName = "text-base font-medium text-white md:text-lg";
  const mutedStatusButtonClassName =
    "w-fit cursor-not-allowed border-[3px] border-[#061726] bg-gray-700 px-6 py-2 text-center text-sm font-bold uppercase text-gray-300";
  const disabledDestructiveActionButtonClassName =
    "w-fit cursor-not-allowed border-[3px] border-[#061726] bg-gray-600 px-6 py-2 font-extrabold uppercase text-gray-400 shadow-[4px_4px_0px_0px_#061726]";
  const primaryActionButtonClassName =
    "w-fit border-[3px] border-[#061726] bg-white px-6 py-2 text-sm font-extrabold uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]";
  const destructiveActionButtonClassName =
    "w-fit border-[3px] border-[#061726] bg-red-600 px-6 py-2 font-extrabold uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]";
  const hasPasskey = isDeviceBound;
  const displayName = profile?.username ?? profile?.nickname ?? "Игрок";
  const behaviorScore = profile?.behaviorScore ?? 5;
  const behaviorScoreLabel =
    behaviorScore >= 0 ? `${behaviorScore} / 5` : `${behaviorScore}`;
  const behaviorScoreColorClass = getBehaviorScoreColorClass(behaviorScore);
  const hasName = Boolean(profile?.nickname?.trim());
  const hasSteam = Boolean(profile?.steamId?.trim());
  const hasDevice = hasPasskey;
  const hasMMR = profile?.mmr !== null && profile?.mmr !== undefined;
  const hasTeam = Boolean(teamData?.team.id);
  const isConfirmed = Boolean(teamData && activeTournament && isParticipationConfirmed);
  const isTournamentLocked = Boolean(activeTournament && isParticipationConfirmed);
  const profileMedals = profile?.medals ?? [];
  const formattedMMR =
    typeof profile?.mmr === "number" ? profile.mmr.toLocaleString("ru-RU") : null;

  function setVisibleErrorMessage(message: string | null) {
    setErrorMessage(sanitizeProfileErrorMessage(message));
  }

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
      setVisibleErrorMessage(
        error instanceof Error ? error.message : "Не удалось загрузить профиль."
      );
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    setHasPendingSteamLink(initialHasPendingSteamLink);
  }, [initialHasPendingSteamLink]);

  useEffect(() => {
    setNewNameValue(profile?.username ?? profile?.nickname ?? "");
  }, [profile?.nickname, profile?.username]);

  useEffect(() => {
    setNewMMRValue(typeof profile?.mmr === "number" ? String(profile.mmr) : "");
  }, [profile?.mmr]);

  useEffect(() => {
    if (isTournamentLocked) {
      setIsEditingName(false);
    }
  }, [isTournamentLocked]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleLeaveTeam() {
    if (isParticipationConfirmed) {
      return;
    }

    setIsMutatingTeam(true);
    setErrorMessage(null);

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
      setVisibleErrorMessage(
        error instanceof Error ? error.message : "Could not leave team."
      );
    } finally {
      setIsMutatingTeam(false);
    }
  }

  async function handleDeleteTeam() {
    if (isParticipationConfirmed) {
      return;
    }

    setIsMutatingTeam(true);
    setErrorMessage(null);

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
      setVisibleErrorMessage(
        error instanceof Error ? error.message : "Could not delete team."
      );
    } finally {
      setIsMutatingTeam(false);
    }
  }

  async function handleConfirmParticipation() {
    setIsConfirmingParticipation(true);
    setErrorMessage(null);

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

      if (!profile?.mmr) {
        throw new Error(
          "Укажите текущий MMR в профиле перед подтверждением участия."
        );
      }

      await confirmTournamentParticipation(activeTournament.id, user.id);
      setIsParticipationConfirmed(true);
    } catch (error) {
      setVisibleErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось подтвердить участие."
      );
    } finally {
      setIsConfirmingParticipation(false);
    }
  }

  async function handleRegisterDevice() {
    if (!hasLoadedDeviceBinding || hasPasskey) {
      setDeviceMessage(hasPasskey ? "" : "Не удалось проверить статус биометрии.");
      return;
    }

    setIsRegisteringDevice(true);
    setDeviceMessage("");
    setErrorMessage(null);

    try {
      if (!browserSupportsWebAuthn()) {
        setDeviceMessage("Ваше устройство или браузер не поддерживает биометрию.");
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
        if (beginResult.error === "К этому аккаунту уже привязана биометрия.") {
          setIsDeviceBound(true);
          setHasLoadedDeviceBinding(true);
          setDeviceMessage("");
          return;
        }

        setDeviceMessage(beginResult.error ?? "Не удалось начать подключение биометрии.");
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
        if (finishResult.error === "К этому аккаунту уже привязана биометрия.") {
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
      router.refresh();
    } catch (error) {
      setDeviceMessage(getWebAuthnErrorMessage(error));
    } finally {
      setIsRegisteringDevice(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (error) {
      setVisibleErrorMessage(
        error instanceof Error ? error.message : "Не удалось выполнить выход."
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleLinkSteam() {
    setIsLinkingSteam(true);
    setErrorMessage(null);

    try {
      window.location.href = "/api/steam/login";
    } catch (error) {
      setVisibleErrorMessage(
        error instanceof Error ? error.message : "Не удалось привязать Steam."
      );
      setIsLinkingSteam(false);
    }
  }

  async function handleFinalizeSteam() {
    setIsFinalizingSteam(true);
    setErrorMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const result = await finalizeSteamLink(data.session?.access_token || "");

      if (result.error) {
        setVisibleErrorMessage(result.error);
        return;
      }

      setHasPendingSteamLink(false);
      router.replace("/profile");
      await loadProfile();
      router.refresh();
    } catch (error) {
      setVisibleErrorMessage(
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
    setErrorMessage(null);
  }

  function handleCancelEditingName() {
    setNewNameValue(profile?.username ?? profile?.nickname ?? "");
    setIsEditingName(false);
  }

  async function handleSaveProfileName() {
    setIsSavingName(true);
    setErrorMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const trimmedName = newNameValue.trim();
      const result = await updateProfileName(
        data.session?.access_token || "",
        trimmedName
      );

      if (result.error) {
        setVisibleErrorMessage(result.error);
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
      setVisibleErrorMessage(
        error instanceof Error ? error.message : "Не удалось обновить имя."
      );
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleSavePlayerMMR() {
    setIsSavingMMR(true);
    setErrorMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const parsedMMR = Number(newMMRValue);
      const result = await updatePlayerMMR(
        data.session?.access_token || "",
        parsedMMR
      );

      if (result.error) {
        setVisibleErrorMessage(result.error);
        return;
      }

      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              mmr: parsedMMR,
            }
          : currentProfile
      );
      setNewMMRValue(String(parsedMMR));
      router.refresh();
    } catch (error) {
      setVisibleErrorMessage(
        error instanceof Error ? error.message : "Не удалось обновить MMR."
      );
    } finally {
      setIsSavingMMR(false);
    }
  }

  if (isLoading) {
    return (
      <div className="relative min-h-screen bg-transparent px-6 py-10 text-zinc-900">
        <PetalOverlay />
        <div className="relative z-10 mx-auto max-w-5xl text-sm text-zinc-600">
          Загрузка профиля...
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-transparent text-zinc-900">
      <PetalOverlay />
      <main className="relative z-10 mx-auto max-w-5xl px-6 py-10">
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
              hasMMR={hasMMR}
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
                      <div className="mb-2 flex flex-wrap items-center gap-3">
                        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                          {displayName}
                        </h2>
                        {profile?.mmrStatus === "verified" ? (
                          <span
                            title="MMR аккаунта подтвержден"
                            className="ml-2 border border-green-600 px-1 py-0.5 text-xs uppercase tracking-wider text-green-500"
                          >
                            [ ✓ MMR ]
                          </span>
                        ) : null}
                        {profileMedals.map((medal) => (
                          <span
                            key={medal.id}
                            title={getPlayerMedalTitle(medal)}
                            className="text-xl leading-none"
                          >
                            {PLAYER_MEDAL_META[medal.medal].icon}
                          </span>
                        ))}
                      </div>
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
              <div className="mt-5 space-y-5">
                <div className={settingsPanelClassName}>
                  {!profile?.steamId ? (
                    hasPendingSteamLink ? (
                      <div className="border-[4px] border-[#CD9C3E] bg-[#061726] p-5 shadow-[6px_6px_0px_0px_#CD9C3E]">
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
                  )}
                </div>

                <div className={settingsPanelClassName}>
                  <p className={settingsPanelLabelClassName}>Биометрия</p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {hasPasskey ? (
                      <div className="w-fit border-[3px] border-[#061726] bg-green-800 px-6 py-2 text-sm font-extrabold uppercase text-green-200 shadow-[4px_4px_0px_0px_#061726]">
                        БИОМЕТРИЯ ПОДКЛЮЧЕНА
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleRegisterDevice()}
                        disabled={isRegisteringDevice || !hasLoadedDeviceBinding}
                        className={
                          isRegisteringDevice
                            ? mutedStatusButtonClassName
                            : !hasLoadedDeviceBinding
                              ? mutedStatusButtonClassName
                              : primaryActionButtonClassName
                        }
                      >
                        {isRegisteringDevice
                          ? "ПОДКЛЮЧЕНИЕ..."
                          : !hasLoadedDeviceBinding
                            ? "ПРОВЕРЯЮ БИОМЕТРИЮ..."
                            : "ПОДКЛЮЧИТЬ БИОМЕТРИЮ"}
                      </button>
                    )}
                  </div>
                  {deviceMessage && <p className="mt-3 text-sm text-white/80">{deviceMessage}</p>}
                </div>

                <div className={settingsPanelClassName}>
                  <p className={settingsPanelLabelClassName}>Текущий MMR</p>
                  {!hasMMR ? (
                    <>
                      <p className="text-sm font-medium text-white/80">
                        Укажите текущий MMR. Без этого нельзя вступить в команду и
                        подтвердить участие в турнире.
                      </p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                          type="number"
                          value={newMMRValue}
                          onChange={(event) => setNewMMRValue(event.target.value)}
                          disabled={isSavingMMR}
                          min={1}
                          step={1}
                          inputMode="numeric"
                          placeholder="Например 4500"
                          className="w-full border border-gray-600 bg-transparent p-2 text-white outline-none placeholder:text-white/40 sm:max-w-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSavePlayerMMR()}
                          disabled={isSavingMMR}
                          className="w-fit border-[3px] border-[#061726] bg-[#CD9C3E] px-5 py-2 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70"
                        >
                          {isSavingMMR ? "СОХРАНЕНИЕ..." : "СОХРАНИТЬ"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-lg font-black uppercase text-white">
                        ТЕКУЩИЙ MMR: {formattedMMR}
                      </p>
                      <p className="mt-2 text-[10px] uppercase text-gray-500">
                        Для изменения MMR обратитесь к администратору
                      </p>
                    </div>
                  )}
                </div>

                <div className={settingsPanelClassName}>
                  <details>
                    <summary className="text-xs text-gray-400 uppercase font-bold mb-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between">
                      Уведомления
                      <span className="border border-gray-600 px-1 rounded text-[10px] ml-2">
                        [ ? ]
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-gray-500">
                      <li>Важные анонсы турнира</li>
                      <li>Напоминания перед стартом матчей</li>
                      <li>Уведомления о готовности лобби</li>
                    </ul>
                  </details>
                  <div className="mt-4">
                    <PushToggleButton
                      initialHasPushSubscription={hasPushSubscription}
                      onSubscribed={() => setHasPushSubscription(true)}
                    />
                  </div>
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
                <TeamIdentityRow
                  teamName={teamData?.team.name ?? null}
                  teamLogoUrl={teamData?.team.logo_url ?? null}
                  bodyTextClassName={bodyTextClassName}
                />
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
                      onClick={
                        isParticipationConfirmed
                          ? undefined
                          : () => void handleDeleteTeam()
                      }
                      disabled={isMutatingTeam || isParticipationConfirmed}
                      className={
                        isParticipationConfirmed
                          ? disabledDestructiveActionButtonClassName
                          : destructiveActionButtonClassName
                      }
                    >
                      {isMutatingTeam ? "Обработка..." : "Удалить команду"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={
                        isParticipationConfirmed
                          ? undefined
                          : () => void handleLeaveTeam()
                      }
                      disabled={isMutatingTeam || isParticipationConfirmed}
                      className={
                        isParticipationConfirmed
                          ? disabledDestructiveActionButtonClassName
                          : destructiveActionButtonClassName
                      }
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
                <TeamIdentityRow
                  teamName={teamData?.team.name ?? null}
                  teamLogoUrl={teamData?.team.logo_url ?? null}
                  bodyTextClassName={bodyTextClassName}
                />
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

              {!profile?.mmr && (
                <p className="mt-5 text-sm text-[#CD9C3E]">
                  Укажите текущий MMR в профиле, чтобы разблокировать
                  подтверждение участия.
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleConfirmParticipation()}
                disabled={
                  !activeTournament ||
                  !teamData ||
                  !profile?.mmr ||
                  isParticipationConfirmed ||
                  isConfirmingParticipation
                }
                className={
                  !activeTournament ||
                  !teamData ||
                  !profile?.mmr ||
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
