"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getMatchRoomData,
  type MatchRoomData,
} from "@/lib/supabase/matches";
import {
  checkInToMatch,
  getMatchBiometricVerificationOptions,
  verifyMatchBiometricAuthentication,
  verifyMatchBiometricRegistration,
} from "@/app/matches/actions";
import { CheckInGate } from "./check-in-gate";
import { SiteHeader } from "@/components/site-header";

function formatAlmatyDateTime(
  dateInput: string,
  options: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    ...options,
  }).format(new Date(dateInput));
}

function formatRoundLabel(roundLabel: string) {
  if (roundLabel === "Group Stage") {
    return "Групповой этап";
  }
  return roundLabel;
}

function PlayerRow({
  nickname,
  isCaptain,
  isCheckedIn,
  isBiometricVerified,
}: {
  nickname: string;
  isCaptain: boolean;
  isCheckedIn: boolean;
  isBiometricVerified: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-200 px-3 py-2">
      <span className="text-sm">
        {nickname}
        {isCaptain && (
          <span className="ml-2 text-xs text-zinc-500">(C)</span>
        )}
      </span>
      <div className="flex items-center gap-2">
        {isCheckedIn ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Ready
          </span>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
        {isBiometricVerified && (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            ID OK
          </span>
        )}
      </div>
    </div>
  );
}

function getWebAuthnErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "NotAllowedError") {
      return "Проверка личности была отменена или время ожидания истекло.";
    }

    if (error.name === "InvalidStateError") {
      return "Этот passkey уже зарегистрирован. Попробуйте снова подтвердить личность.";
    }

    if (error.name === "SecurityError") {
      return "Passkeys недоступны для текущего адреса сайта.";
    }

    if (error.message) {
      return error.message;
    }
  }

  return "Не удалось подтвердить личность.";
}

export default function MatchRoomPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = typeof params.id === "string" ? params.id : null;

  const [data, setData] = useState<MatchRoomData | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [fetchError, setFetchError] = useState<unknown>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [identityErrorMessage, setIdentityErrorMessage] = useState("");
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);

  useEffect(() => {
    if (!matchId) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setCurrentUserId(user?.id ?? null);
        setFetchError(null);

        const result = await getMatchRoomData(matchId);
        setData(result.data);

        if (!result.data) {
          setFetchError(result.error);
          setErrorMessage("Матч не найден.");
        }
      } catch (error) {
        setFetchError(error);
        setErrorMessage("Не удалось загрузить данные матча.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [matchId]);

  const isCurrentUserParticipant = Boolean(
    currentUserId &&
      data &&
      (data.teamA.roster.some((player) => player.userId === currentUserId) ||
        data.teamB.roster.some((player) => player.userId === currentUserId))
  );
  const isCurrentUserCheckedIn = Boolean(
    currentUserId && data?.checkedInUserIds.includes(currentUserId)
  );
  const isCurrentUserBiometricVerified = Boolean(
    currentUserId && data?.biometricVerifiedUserIds.includes(currentUserId)
  );
  const canCheckIn = isCurrentUserParticipant && !isCurrentUserCheckedIn;
  const canVerifyIdentity =
    isCurrentUserParticipant &&
    isCurrentUserCheckedIn &&
    !isCurrentUserBiometricVerified;

  async function handleCheckIn() {
    if (!matchId || !currentUserId || !canCheckIn) return;

    setIsCheckingIn(true);
    setErrorMessage("");
    setIdentityErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setErrorMessage("Войдите в аккаунт для отметки.");
        return;
      }

      const result = await checkInToMatch(matchId, session.access_token);

      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      const refreshed = await getMatchRoomData(matchId);
      setData(refreshed.data);
      setFetchError(refreshed.error);
      router.refresh();
    } catch {
      setErrorMessage("Не удалось отметиться.");
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleVerifyIdentity() {
    if (!matchId || !currentUserId || !canVerifyIdentity) return;

    setIsVerifyingIdentity(true);
    setIdentityErrorMessage("");

    try {
      if (!browserSupportsWebAuthn()) {
        setIdentityErrorMessage("Этот браузер не поддерживает passkeys.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setIdentityErrorMessage("Войдите в аккаунт для подтверждения личности.");
        return;
      }

      const beginResult = await getMatchBiometricVerificationOptions(
        matchId,
        session.access_token
      );

      if (beginResult.error) {
        setIdentityErrorMessage(beginResult.error);
        return;
      }

      let finishResult;

      if (beginResult.ceremony === "registration") {
        const response: RegistrationResponseJSON = await startRegistration({
          optionsJSON: beginResult.options,
        });

        finishResult = await verifyMatchBiometricRegistration(
          matchId,
          session.access_token,
          response
        );
      } else {
        if (beginResult.ceremony !== "authentication") {
          setIdentityErrorMessage(
            "Не удалось определить сценарий биометрической проверки."
          );
          return;
        }

        const response: AuthenticationResponseJSON = await startAuthentication({
          optionsJSON: beginResult.options,
        });

        finishResult = await verifyMatchBiometricAuthentication(
          matchId,
          session.access_token,
          response
        );
      }

      if (finishResult.error) {
        setIdentityErrorMessage(finishResult.error);
        return;
      }

      const refreshed = await getMatchRoomData(matchId);
      setData(refreshed.data);
      setFetchError(refreshed.error);
      router.refresh();
    } catch (error) {
      setIdentityErrorMessage(getWebAuthnErrorMessage(error));
    } finally {
      setIsVerifyingIdentity(false);
    }
  }

  if (!matchId) {
    return (
      <div className="min-h-screen bg-zinc-100 text-zinc-900">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm text-zinc-600">Invalid match.</p>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-100 text-zinc-900">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="border border-zinc-300 bg-white p-5 text-sm text-zinc-600">
            Загрузка матча...
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    if (fetchError) {
      console.error("Match fetch failed:", fetchError);
    }

    return (
      <div className="min-h-screen bg-zinc-100 text-zinc-900">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="border border-zinc-300 bg-white p-5">
            <p className="text-sm text-zinc-600">{errorMessage}</p>
            <Link
              href="/tournament"
              className="mt-3 inline-block text-sm text-zinc-600 underline"
            >
              ← Назад к турниру
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const checkInCount = data.checkedInUserIds.length;
  const allCheckedIn = checkInCount >= 10;

  const teamAName = data.teamA.name;
  const teamBName = data.teamB.name;
  const hostTeamName =
    teamAName.localeCompare(teamBName) <= 0 ? teamAName : teamBName;
  const hostTeam = data.teamA.name === hostTeamName ? data.teamA : data.teamB;
  const hostCaptain = hostTeam.roster.find((p) => p.isCaptain);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link
          href="/tournament"
          className="mb-4 inline-block text-sm text-zinc-600 underline"
        >
          ← Назад к турниру
        </Link>

        <section className="border border-zinc-300 bg-white p-5">
          <h1 className="text-xl font-semibold">
            {formatRoundLabel(data.match.roundLabel)} · {data.match.format}
          </h1>
          {data.match.scheduledAt && (
            <p className="mt-1 text-sm text-zinc-500">
              {formatAlmatyDateTime(data.match.scheduledAt, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          {data.match.status === "finished" &&
            data.match.teamAScore !== null &&
            data.match.teamBScore !== null && (
              <p className="mt-1 text-sm text-zinc-600">
                Счет: {data.match.teamAScore} - {data.match.teamBScore}
              </p>
            )}

          <CheckInGate
            scheduledAt={data.match.scheduledAt}
            isEligible={isCurrentUserParticipant}
            isCheckedIn={isCurrentUserCheckedIn}
            isCheckingIn={isCheckingIn}
            onCheckIn={() => void handleCheckIn()}
          />

          {errorMessage && (
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          )}

          {isCurrentUserCheckedIn && (
            <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-900">
                  Биометрическая проверка
                </span>
                {isCurrentUserBiometricVerified ? (
                  <span className="rounded bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                    Личность подтверждена
                  </span>
                ) : (
                  <span className="rounded bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700">
                    Ожидается
                  </span>
                )}
              </div>

              {!isCurrentUserBiometricVerified && (
                <>
                  <p className="mt-2 text-sm text-zinc-600">
                    Подтвердите личность через passkey, Face ID или Touch ID.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleVerifyIdentity()}
                    disabled={isVerifyingIdentity}
                    className="mt-3 rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {isVerifyingIdentity
                      ? "Ожидаю подтверждение..."
                      : "Подтвердить личность"}
                  </button>
                </>
              )}
            </div>
          )}

          {identityErrorMessage && (
            <p className="mt-2 text-sm text-red-600">{identityErrorMessage}</p>
          )}
        </section>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section className="border border-zinc-300 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 font-medium">
              {data.teamA.name}
            </div>
            <div className="divide-y divide-zinc-100">
              {(data.teamA.roster ?? []).map((player) => (
                <PlayerRow
                  key={player.userId}
                  nickname={player.nickname}
                  isCaptain={player.isCaptain}
                  isCheckedIn={data.checkedInUserIds.includes(player.userId)}
                  isBiometricVerified={data.biometricVerifiedUserIds.includes(
                    player.userId
                  )}
                />
              ))}
              {(!data.teamA.roster || data.teamA.roster.length === 0) && (
                <div className="px-4 py-3 text-sm text-zinc-500">
                  Игроков пока нет
                </div>
              )}
            </div>
          </section>

          <section className="border border-zinc-300 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 font-medium">
              {data.teamB.name}
            </div>
            <div className="divide-y divide-zinc-100">
              {(data.teamB.roster ?? []).map((player) => (
                <PlayerRow
                  key={player.userId}
                  nickname={player.nickname}
                  isCaptain={player.isCaptain}
                  isCheckedIn={data.checkedInUserIds.includes(player.userId)}
                  isBiometricVerified={data.biometricVerifiedUserIds.includes(
                    player.userId
                  )}
                />
              ))}
              {(!data.teamB.roster || data.teamB.roster.length === 0) && (
                <div className="px-4 py-3 text-sm text-zinc-500">
                  Игроков пока нет
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 border border-zinc-300 bg-white p-5">
          {!allCheckedIn ? (
            <p className="text-sm text-zinc-600">
              Ожидание отметки всех игроков... ({checkInCount}/10)
            </p>
          ) : (
            <div className="space-y-3">
              <h2 className="font-semibold text-zinc-900">
                Данные лобби
              </h2>
              <div className="rounded border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm">
                  <span className="text-zinc-500">Название:</span>{" "}
                  {data.match.lobbyName ?? "—"}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-zinc-500">Пароль:</span>{" "}
                  {data.match.lobbyPassword ?? "—"}
                </p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">
                  Designated Lobby Host (капитан команды, идущей первой по алфавиту):
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {hostCaptain?.nickname ?? "—"} ({hostTeamName})
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
