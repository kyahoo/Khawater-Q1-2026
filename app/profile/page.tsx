"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
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
import { SiteHeader } from "@/components/site-header";
import {
  getProfilePasskeyBindingStatus,
  getProfilePasskeyRegistrationOptions,
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

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deviceOwnerId, setDeviceOwnerId] = useState<string | null>(null);
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasLoadedDeviceBinding, setHasLoadedDeviceBinding] = useState(false);
  const [isDeviceBound, setIsDeviceBound] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState("");
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
    "w-fit border-[3px] border-[#061726] bg-red-600 px-6 py-2 text-white font-extrabold uppercase shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]";
  const occupiedDeviceButtonClassName =
    "bg-red-900/50 text-red-200 font-bold uppercase px-6 py-2 border-[3px] border-[#061726] cursor-not-allowed w-fit text-sm text-center";
  const isDeviceClaimedByCurrentUser =
    Boolean(deviceOwnerId) && Boolean(currentUserId) && deviceOwnerId === currentUserId;
  const isDeviceClaimedByAnotherUser =
    Boolean(deviceOwnerId) && Boolean(currentUserId) && deviceOwnerId !== currentUserId;

  useEffect(() => {
    const owner = localStorage.getItem("khawater_device_owner");

    if (owner) {
      setDeviceOwnerId(owner);
    }
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
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
        const [nextTeamData, nextActiveTournament, deviceBindingStatus] = await Promise.all([
          getCurrentTeamDetails(user.id),
          getActiveTournament(),
          getProfilePasskeyBindingStatus(session.access_token),
        ]);

        setTeamData(nextTeamData);
        setActiveTournament(nextActiveTournament);

        if (deviceBindingStatus.error) {
          setHasLoadedDeviceBinding(false);
          setDeviceMessage(deviceBindingStatus.error);
        } else {
          setHasLoadedDeviceBinding(true);
          setIsDeviceBound(deviceBindingStatus.isDeviceBound);
          if (!deviceBindingStatus.isDeviceBound) {
            localStorage.removeItem("khawater_device_owner");
            setDeviceOwnerId(null);
          }
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
    };

    void loadProfile();
  }, [router]);

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
    if (isDeviceClaimedByAnotherUser) {
      setDeviceMessage("Это устройство уже занято другим игроком.");
      return;
    }

    if (!hasLoadedDeviceBinding || isDeviceBound || isDeviceClaimedByCurrentUser) {
      setDeviceMessage(isDeviceBound ? "" : "Не удалось проверить привязку устройства.");
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
        setDeviceOwnerId(currentUserId);
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
      router.replace("/auth");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось выполнить выход."
      );
    } finally {
      setIsSigningOut(false);
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
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-8 inline-block border-[3px] border-[#061726] bg-[#061726]/90 px-6 py-3 text-4xl font-black uppercase text-[#CD9C3E] shadow-[6px_6px_0px_0px_#061726] md:text-5xl">
          Профиль
        </h1>

        {errorMessage && (
          <p className="mb-6 text-sm leading-7 text-red-600">{errorMessage}</p>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className={cardClassName}>
              <div className="mb-2 text-2xl font-bold text-white">
                {profile?.nickname ?? "Игрок"}
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => void handleRegisterDevice()}
                  disabled={
                    isRegisteringDevice ||
                    !hasLoadedDeviceBinding ||
                    isDeviceBound ||
                    isDeviceClaimedByCurrentUser ||
                    isDeviceClaimedByAnotherUser
                  }
                  className={
                    isDeviceClaimedByAnotherUser
                      ? occupiedDeviceButtonClassName
                      : isRegisteringDevice ||
                          !hasLoadedDeviceBinding ||
                          isDeviceBound ||
                          isDeviceClaimedByCurrentUser
                        ? mutedStatusButtonClassName
                      : primaryActionButtonClassName
                  }
                >
                  {isDeviceClaimedByAnotherUser
                    ? "Устройство занято другим игроком"
                    : isDeviceBound || isDeviceClaimedByCurrentUser
                      ? "Аккаунт уже привязан к устройству"
                    : isRegisteringDevice
                      ? "Привязка..."
                      : hasLoadedDeviceBinding
                        ? "Привязать устройство"
                        : "Проверяю привязку..."}
                </button>
                {deviceMessage && (
                  <p className="text-sm text-white/80">{deviceMessage}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="mt-6 bg-red-500 text-white font-extrabold uppercase px-6 py-2 border-[3px] border-[#061726] shadow-[4px_4px_0px_0px_#061726] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] transition-all w-fit"
              >
                {isSigningOut ? "Выход..." : "ВЫЙТИ"}
              </button>
            </div>

            <div className={cardClassName}>
              <h2 className={cardHeadingClassName}>
                Статус команды
              </h2>
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
              <h2 className={cardHeadingClassName}>
                Участие в текущем турнире
              </h2>
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
                  !activeTournament || !teamData || isConfirmingParticipation || isParticipationConfirmed
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
                <a
                  href="/create-team"
                  className={cardClassName}
                >
                  <div className={cardHeadingClassName}>Создать команду</div>
                  <div className={bodyTextClassName}>Откройте свою команду для турниров</div>
                </a>
                <a
                  href="/join-team"
                  className={cardClassName}
                >
                  <div className={cardHeadingClassName}>Вступить в команду</div>
                  <div className={bodyTextClassName}>Присоединитесь к уже созданному составу</div>
                </a>
              </>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
