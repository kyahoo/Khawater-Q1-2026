"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
  analyzeLobbyScreenshot,
  checkInToMatch,
  confirmMatchResult,
  getMatchBiometricVerificationOptions,
  saveMatchLobbyScreenshot,
  uploadMatchResultGameScreenshot,
  verifyMatchBiometricAuthentication,
  verifyMatchBiometricRegistration,
} from "@/app/matches/actions";
import { CheckInGate } from "./check-in-gate";
import { SiteHeader } from "@/components/site-header";

const TOTAL_MATCH_PLAYERS = 1;
const MATCH_ROOM_OPEN_WINDOW_MS = 30 * 60 * 1000;
const almatyWallClockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Almaty",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type LobbyScreenshotVerificationData = {
  is_host_found: boolean;
  is_uploader_found: boolean;
};

type ResultScreenshotSlotState = {
  publicUrl: string | null;
  fileName: string;
  isUploading: boolean;
  errorMessage: string;
};

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

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function getFileExtension(file: File) {
  const extensionByType: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };

  return (
    extensionByType[file.type] ??
    file.name.split(".").pop()?.toLowerCase() ??
    "png"
  );
}

function getAlmatyWallClockTimeMs(dateInput: string | Date) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = almatyWallClockFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);

  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function isMatchRoomAccessible(match: MatchRoomData["match"]) {
  if (match.status === "live" || match.status === "finished" || match.status === "completed") {
    return true;
  }

  if (!match.scheduledAt) {
    return true;
  }

  const scheduledTimeMs = getAlmatyWallClockTimeMs(match.scheduledAt);
  const currentTimeMs = getAlmatyWallClockTimeMs(new Date());

  if (scheduledTimeMs === null || currentTimeMs === null) {
    return true;
  }

  return currentTimeMs >= scheduledTimeMs - MATCH_ROOM_OPEN_WINDOW_MS;
}

function getSeriesLength(format: string) {
  const match = format.trim().toUpperCase().match(/^BO(\d+)$/);

  if (!match) {
    return null;
  }

  const parsedLength = Number(match[1]);
  return Number.isInteger(parsedLength) && parsedLength > 0 ? parsedLength : null;
}

function getSeriesMaxWins(format: string) {
  const seriesLength = getSeriesLength(format);

  return seriesLength ? Math.floor(seriesLength / 2) + 1 : null;
}

function normalizeScoreInput(value: string, maxWins: number | null) {
  const digitsOnly = value.replace(/[^\d]/g, "");

  if (!digitsOnly) {
    return "";
  }

  const parsedValue = Number.parseInt(digitsOnly, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return "";
  }

  if (maxWins !== null) {
    return String(Math.min(parsedValue, maxWins));
  }

  return String(parsedValue);
}

function PlayerRow({
  nickname,
  isCaptain,
  isCheckedIn,
}: {
  nickname: string;
  isCaptain: boolean;
  isCheckedIn: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t-[3px] border-[#061726] bg-[#061726]/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-black uppercase tracking-wide text-white">
          {nickname}
        </span>
        {isCaptain && (
          <span className="border-[2px] border-[#061726] bg-[#CD9C3E] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#061726]">
            Капитан
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isCheckedIn ? (
          <span className="border-[2px] border-[#061726] bg-[#163f1d] px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#D9F99D]">
            Чек-ин
          </span>
        ) : (
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
            Ожидание
          </span>
        )}
      </div>
    </div>
  );
}

export default function MatchRoomPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = typeof params.id === "string" ? params.id : null;
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const resultScreenshotInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const initializedResultDraftMatchIdRef = useRef<string | null>(null);

  const [data, setData] = useState<MatchRoomData | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [fetchError, setFetchError] = useState<unknown>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInErrorMessage, setCheckInErrorMessage] = useState("");
  const [isConfirmingLobby, setIsConfirmingLobby] = useState(false);
  const [isUploadingLobbyScreenshot, setIsUploadingLobbyScreenshot] =
    useState(false);
  const [isWaitingForLobbyScreenshot, setIsWaitingForLobbyScreenshot] =
    useState(false);
  const [lobbyErrorMessage, setLobbyErrorMessage] = useState("");
  const [ocrData, setOcrData] = useState<LobbyScreenshotVerificationData | null>(
    null
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reportedTeamAScore, setReportedTeamAScore] = useState("");
  const [reportedTeamBScore, setReportedTeamBScore] = useState("");
  const [resultScreenshotSlots, setResultScreenshotSlots] = useState<
    ResultScreenshotSlotState[]
  >([]);
  const [isSubmittingMatchResult, setIsSubmittingMatchResult] = useState(false);
  const [matchResultErrorMessage, setMatchResultErrorMessage] = useState("");

  const loadMatchRoom = useCallback(
    async (nextMatchId: string, options?: { showLoading?: boolean }) => {
      if (options?.showLoading) {
        setIsLoading(true);
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setCurrentUserId(user?.id ?? null);

        const result = await getMatchRoomData(nextMatchId);
        setData(result.data);

        if (!result.data) {
          setFetchError(result.error);
          setErrorMessage("Матч не найден.");
          return;
        }

        if (!isMatchRoomAccessible(result.data.match)) {
          setData(null);
          setFetchError(new Error("Match room is not open yet."));
          setErrorMessage("Матч не найден.");
          return;
        }

        setFetchError(null);
        setErrorMessage("");
      } catch (error) {
        setFetchError(error);
        setErrorMessage("Не удалось загрузить данные матча.");
      } finally {
        if (options?.showLoading) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!matchId) {
      setIsLoading(false);
      return;
    }

    void loadMatchRoom(matchId, { showLoading: true });
  }, [matchId, loadMatchRoom]);

  useEffect(() => {
    if (!matchId) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let reloadTimeoutId: number | null = null;
    const scheduleReload = () => {
      if (reloadTimeoutId !== null) {
        window.clearTimeout(reloadTimeoutId);
      }

      reloadTimeoutId = window.setTimeout(() => {
        void loadMatchRoom(matchId);
      }, 150);
    };

    const channel = supabase
      .channel(`match-room-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_check_ins",
          filter: `match_id=eq.${matchId}`,
        },
        scheduleReload
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournament_matches",
          filter: `id=eq.${matchId}`,
        },
        scheduleReload
      )
      .subscribe();

    return () => {
      if (reloadTimeoutId !== null) {
        window.clearTimeout(reloadTimeoutId);
      }

      void supabase.removeChannel(channel);
    };
  }, [matchId, loadMatchRoom]);

  useEffect(() => {
    if (!data) {
      return;
    }

    if (initializedResultDraftMatchIdRef.current === data.match.id) {
      return;
    }

    initializedResultDraftMatchIdRef.current = data.match.id;
    setReportedTeamAScore(
      data.match.teamAScore !== null ? String(data.match.teamAScore) : ""
    );
    setReportedTeamBScore(
      data.match.teamBScore !== null ? String(data.match.teamBScore) : ""
    );
    setResultScreenshotSlots(
      data.match.resultScreenshotUrls.map((publicUrl, index) => ({
        publicUrl,
        fileName: `Скриншот Игры ${index + 1}`,
        isUploading: false,
        errorMessage: "",
      }))
    );
    setMatchResultErrorMessage("");
  }, [data]);

  useEffect(() => {
    const totalGames =
      (reportedTeamAScore ? Number(reportedTeamAScore) : 0) +
      (reportedTeamBScore ? Number(reportedTeamBScore) : 0);

    setResultScreenshotSlots((currentSlots) => {
      if (totalGames <= 0) {
        return [];
      }

      return Array.from({ length: totalGames }, (_, index) => {
        const currentSlot = currentSlots[index];

        if (currentSlot) {
          return currentSlot;
        }

        return {
          publicUrl: null,
          fileName: "",
          isUploading: false,
          errorMessage: "",
        };
      });
    });

    resultScreenshotInputRefs.current = resultScreenshotInputRefs.current.slice(
      0,
      Math.max(totalGames, 0)
    );
  }, [reportedTeamAScore, reportedTeamBScore]);

  async function getSessionAccessToken() {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }

  async function refreshMatchRoom() {
    if (!matchId) {
      return;
    }

    await loadMatchRoom(matchId);
    router.refresh();
  }

  async function runMatchBiometricVerification(accessToken: string) {
    if (!matchId) {
      return "Матч не найден.";
    }

    try {
      if (!browserSupportsWebAuthn()) {
        return "Этот браузер не поддерживает passkeys.";
      }

      const beginResult = await getMatchBiometricVerificationOptions(
        matchId,
        accessToken
      );

      if (beginResult.error) {
        return beginResult.error;
      }

      let finishResult;

      if (beginResult.ceremony === "registration") {
        const response: RegistrationResponseJSON = await startRegistration({
          optionsJSON: beginResult.options,
        });

        finishResult = await verifyMatchBiometricRegistration(
          matchId,
          accessToken,
          response
        );
      } else {
        if (beginResult.ceremony !== "authentication") {
          return "Не удалось определить сценарий биометрической проверки.";
        }

        const response: AuthenticationResponseJSON = await startAuthentication({
          optionsJSON: beginResult.options,
        });

        finishResult = await verifyMatchBiometricAuthentication(
          matchId,
          accessToken,
          response
        );
      }

      return finishResult.error;
    } catch (error) {
      console.error("Match biometric verification failed:", error);
      return getWebAuthnErrorMessage(error);
    }
  }

  function openFilePicker(
    inputRef: { current: HTMLInputElement | null },
    setFormErrorMessage: (message: string) => void,
    fallbackMessage: string
  ) {
    const fileInput = inputRef.current;

    if (!fileInput) {
      setFormErrorMessage("Не удалось открыть выбор файла.");
      return;
    }

    fileInput.value = "";

    try {
      const pickerInput = fileInput as HTMLInputElement & {
        showPicker?: () => void;
      };

      if (typeof pickerInput.showPicker === "function") {
        pickerInput.showPicker();
        return;
      }

      fileInput.click();
    } catch (error) {
      console.error("Hidden file picker open failed:", error);
      setFormErrorMessage(fallbackMessage);
    }
  }

  function openLobbyScreenshotPicker() {
    openFilePicker(
      screenshotInputRef,
      setLobbyErrorMessage,
      "Биометрия подтверждена. Выберите скриншот вручную."
    );
  }

  function updateResultScreenshotSlot(
    slotIndex: number,
    updater: (slot: ResultScreenshotSlotState) => ResultScreenshotSlotState
  ) {
    setResultScreenshotSlots((currentSlots) =>
      currentSlots.map((slot, currentIndex) =>
        currentIndex === slotIndex ? updater(slot) : slot
      )
    );
  }

  function openResultScreenshotPicker(slotIndex: number) {
    openFilePicker(
      {
        current: resultScreenshotInputRefs.current[slotIndex] ?? null,
      },
      (message) => {
        updateResultScreenshotSlot(slotIndex, (slot) => ({
          ...slot,
          errorMessage: message,
        }));
      },
      "Выберите скриншот игры вручную."
    );
  }

  async function handleCheckIn() {
    if (!matchId) {
      return;
    }

    setIsCheckingIn(true);
    setCheckInErrorMessage("");
    setLobbyErrorMessage("");
    setIsWaitingForLobbyScreenshot(false);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setCheckInErrorMessage("Войдите в аккаунт для отметки.");
        return;
      }

      const biometricErrorMessage =
        await runMatchBiometricVerification(accessToken);

      if (biometricErrorMessage) {
        setCheckInErrorMessage(biometricErrorMessage);
        return;
      }

      const result = await checkInToMatch(matchId, accessToken);

      if (result.error) {
        setCheckInErrorMessage(result.error);
        return;
      }

      await refreshMatchRoom();
    } catch (error) {
      setCheckInErrorMessage(
        getErrorMessage(error, "Не удалось выполнить чек-ин.")
      );
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleConfirmLobby() {
    if (!matchId) {
      return;
    }

    setIsConfirmingLobby(true);
    setLobbyErrorMessage("");
    setCheckInErrorMessage("");

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setLobbyErrorMessage("Войдите в аккаунт для подтверждения лобби.");
        return;
      }

      const biometricErrorMessage =
        await runMatchBiometricVerification(accessToken);

      if (biometricErrorMessage) {
        setLobbyErrorMessage(biometricErrorMessage);
        return;
      }

      setIsWaitingForLobbyScreenshot(true);
      openLobbyScreenshotPicker();
    } catch (error) {
      setLobbyErrorMessage(
        getErrorMessage(error, "Не удалось подтвердить лобби.")
      );
    } finally {
      setIsConfirmingLobby(false);
    }
  }

  async function handleLobbyScreenshotChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const screenshotFile = event.target.files?.[0];
    event.target.value = "";

    if (!screenshotFile || !matchId || !currentUserId) {
      return;
    }

    if (!screenshotFile.type.startsWith("image/")) {
      setLobbyErrorMessage("Загрузите изображение скриншота.");
      return;
    }

    setIsUploadingLobbyScreenshot(true);
    setLobbyErrorMessage("");
    setOcrData(null);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setLobbyErrorMessage("Войдите в аккаунт для загрузки скриншота.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const filePath = `${currentUserId}/${matchId}/${Date.now()}-${crypto.randomUUID()}.${getFileExtension(
        screenshotFile
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("match-screenshots")
        .upload(filePath, screenshotFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: screenshotFile.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("match-screenshots").getPublicUrl(filePath);

      if (!publicUrl) {
        throw new Error("Не удалось получить ссылку на скриншот.");
      }

      const saveResult = await saveMatchLobbyScreenshot(
        matchId,
        accessToken,
        publicUrl
      );

      if (saveResult.error) {
        throw new Error(saveResult.error);
      }

      setIsWaitingForLobbyScreenshot(false);
      await refreshMatchRoom();
    } catch (error) {
      console.error("Lobby screenshot upload failed:", error);
      setLobbyErrorMessage(
        getErrorMessage(error, "Не удалось загрузить скриншот.")
      );
    } finally {
      setIsUploadingLobbyScreenshot(false);
    }
  }

  async function handleResultScreenshotSelection(
    slotIndex: number,
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = "";
    setMatchResultErrorMessage("");

    if (!nextFile) {
      return;
    }

    if (!nextFile.type.startsWith("image/")) {
      updateResultScreenshotSlot(slotIndex, (slot) => ({
        ...slot,
        errorMessage: "Загрузите изображение скриншота игры.",
      }));
      return;
    }

    updateResultScreenshotSlot(slotIndex, (slot) => ({
      ...slot,
      fileName: nextFile.name,
      isUploading: true,
      errorMessage: "",
    }));

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken || !matchId) {
        updateResultScreenshotSlot(slotIndex, (slot) => ({
          ...slot,
          isUploading: false,
          errorMessage: "Войдите в аккаунт для загрузки скриншота игры.",
        }));
        return;
      }

      const formData = new FormData();
      formData.append("accessToken", accessToken);
      formData.append("slotIndex", String(slotIndex + 1));
      formData.append("resultScreenshot", nextFile);

      const uploadResult = await uploadMatchResultGameScreenshot(matchId, formData);

      updateResultScreenshotSlot(slotIndex, (slot) => ({
        ...slot,
        publicUrl: uploadResult.publicUrl,
        fileName: nextFile.name,
        isUploading: false,
        errorMessage: "",
      }));
    } catch (error) {
      console.error("Game result screenshot upload failed:", error);
      updateResultScreenshotSlot(slotIndex, (slot) => ({
        ...slot,
        isUploading: false,
        errorMessage: getErrorMessage(
          error,
          "Не удалось загрузить скриншот игры."
        ),
      }));
    }
  }

  async function handleMatchResultSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!matchId) {
      return;
    }

    if (resultScreenshotSlots.some((slot) => slot.isUploading)) {
      setMatchResultErrorMessage("Дождитесь завершения загрузки всех скриншотов.");
      return;
    }

    const screenshotUrls = resultScreenshotSlots
      .map((slot) => slot.publicUrl)
      .filter((publicUrl): publicUrl is string => Boolean(publicUrl));

    if (screenshotUrls.length !== totalGames) {
      setMatchResultErrorMessage(
        "Загрузите скриншоты всех сыгранных карт перед подтверждением результата."
      );
      return;
    }

    setIsSubmittingMatchResult(true);
    setMatchResultErrorMessage("");

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setMatchResultErrorMessage(
          "Войдите в аккаунт для подтверждения результата матча."
        );
        return;
      }

      const formData = new FormData();
      formData.append("accessToken", accessToken);
      formData.append("teamAScore", String(parsedReportedTeamAScore));
      formData.append("teamBScore", String(parsedReportedTeamBScore));
      screenshotUrls.forEach((url) => formData.append("screenshotUrls", url));

      await confirmMatchResult(matchId, formData);
      await refreshMatchRoom();
    } catch (error) {
      console.error("Match result confirmation failed:", error);
      setMatchResultErrorMessage(
        getErrorMessage(error, "Не удалось подтвердить результат матча.")
      );
    } finally {
      setIsSubmittingMatchResult(false);
    }
  }

  async function handleAnalyze() {
    if (!matchId) {
      return;
    }

    setIsAnalyzing(true);
    setLobbyErrorMessage("");
    setOcrData(null);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setLobbyErrorMessage("Войдите в аккаунт для анализа скриншота.");
        return;
      }

      const result = await analyzeLobbyScreenshot(matchId, accessToken);

      if (result.error || !result.data) {
        setLobbyErrorMessage(
          result.error ?? "Не удалось проанализировать скриншот."
        );
        return;
      }

      setOcrData(result.data);
    } catch (error) {
      console.error("Lobby screenshot analysis failed:", error);
      setLobbyErrorMessage(
        getErrorMessage(error, "Не удалось проанализировать скриншот.")
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  if (!matchId) {
    return (
      <div className="min-h-screen text-white">
        <div className="min-h-screen bg-[#0B3A4A]/10 backdrop-blur-sm shadow-[0_0_60px_-10px_rgba(11,58,74,0.3)]">
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-6 py-8">
            <p className="text-sm text-white/75">Invalid match.</p>
          </main>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen text-white">
        <div className="min-h-screen bg-[#0B3A4A]/10 backdrop-blur-sm shadow-[0_0_60px_-10px_rgba(11,58,74,0.3)]">
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-6 py-8">
            <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
              Загрузка матча...
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!data) {
    if (fetchError) {
      console.error("Match fetch failed:", fetchError);
    }

    return (
      <div className="min-h-screen text-white">
        <div className="min-h-screen bg-[#0B3A4A]/10 backdrop-blur-sm shadow-[0_0_60px_-10px_rgba(11,58,74,0.3)]">
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-6 py-8">
            <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
              <p className="text-sm text-white/80">{errorMessage}</p>
              <Link
                href="/tournament"
                className="mt-4 inline-block text-sm font-black uppercase tracking-[0.18em] text-[#CD9C3E]"
              >
                ← Назад к турниру
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const isCurrentUserParticipant = Boolean(
    currentUserId &&
      (data.teamA.roster.some((player) => player.userId === currentUserId) ||
        data.teamB.roster.some((player) => player.userId === currentUserId))
  );
  const isCurrentUserCheckedIn = Boolean(
    currentUserId && data.checkedInUserIds.includes(currentUserId)
  );
  const isCurrentUserLobbyConfirmed = Boolean(
    currentUserId && data.screenshotUploadedUserIds.includes(currentUserId)
  );
  const checkInCount = Math.min(data.checkedInUserIds.length, TOTAL_MATCH_PLAYERS);
  const allCheckedIn = checkInCount >= TOTAL_MATCH_PLAYERS;

  const teamAName = data.teamA.name;
  const teamBName = data.teamB.name;
  const hostTeamName =
    teamAName.localeCompare(teamBName) <= 0 ? teamAName : teamBName;
  const hostTeam = data.teamA.name === hostTeamName ? data.teamA : data.teamB;
  const hostCaptain = hostTeam.roster.find((player) => player.isCaptain);
  const hostCaptainUserId = hostCaptain?.userId ?? null;
  const hostLabel = hostCaptain
    ? `${hostCaptain.nickname} (${hostTeamName})`
    : hostTeamName;
  const isCurrentUserLobbyHost = Boolean(
    currentUserId && hostCaptainUserId === currentUserId
  );
  const isLobbyActionBusy =
    isConfirmingLobby ||
    isUploadingLobbyScreenshot ||
    isWaitingForLobbyScreenshot ||
    isCurrentUserLobbyConfirmed;
  const parsedReportedTeamAScore = reportedTeamAScore
    ? Number.parseInt(reportedTeamAScore, 10)
    : 0;
  const parsedReportedTeamBScore = reportedTeamBScore
    ? Number.parseInt(reportedTeamBScore, 10)
    : 0;
  const seriesLength = getSeriesLength(data.match.format);
  const seriesMaxWins = getSeriesMaxWins(data.match.format);
  const totalGames = parsedReportedTeamAScore + parsedReportedTeamBScore;
  const uploadedResultScreenshotCount = resultScreenshotSlots.filter((slot) =>
    Boolean(slot.publicUrl)
  ).length;
  const hasReportedMatchResult =
    data.match.teamAScore !== null &&
    data.match.teamBScore !== null &&
    data.match.resultScreenshotUrls.length > 0;
  const hasInvalidResultSeriesLength =
    seriesLength !== null && totalGames > seriesLength;
  const hasInvalidResultWinner =
    totalGames > 0 &&
    (parsedReportedTeamAScore === parsedReportedTeamBScore ||
      (seriesMaxWins !== null &&
        (parsedReportedTeamAScore > seriesMaxWins ||
          parsedReportedTeamBScore > seriesMaxWins ||
          Math.max(parsedReportedTeamAScore, parsedReportedTeamBScore) !==
            seriesMaxWins)));
  const isResultSubmitDisabled =
    isSubmittingMatchResult ||
    totalGames <= 0 ||
    uploadedResultScreenshotCount !== totalGames ||
    resultScreenshotSlots.some((slot) => slot.isUploading) ||
    hasInvalidResultSeriesLength ||
    hasInvalidResultWinner;
  const reportedWinnerTeamId =
    data.match.winnerTeamId ??
    (data.match.teamAScore !== null &&
    data.match.teamBScore !== null &&
    data.match.teamAScore !== data.match.teamBScore
      ? data.match.teamAScore > data.match.teamBScore
        ? data.teamA.id
        : data.teamB.id
      : null);
  const reportedWinnerName =
    reportedWinnerTeamId === data.teamA.id
      ? data.teamA.name
      : reportedWinnerTeamId === data.teamB.id
        ? data.teamB.name
        : null;

  return (
    <div className="min-h-screen text-white">
      <div className="min-h-screen bg-[#0B3A4A]/10 backdrop-blur-sm shadow-[0_0_60px_-10px_rgba(11,58,74,0.3)]">
        <SiteHeader />

        <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <Link
            href="/tournament"
            className="mb-5 inline-block text-sm font-black uppercase tracking-[0.2em] text-[#CD9C3E]"
          >
            ← Назад к турниру
          </Link>

          <section className="border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726] md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                Комната матча
              </p>
              <h1 className="mt-2 text-3xl font-black uppercase text-white md:text-4xl">
                {formatRoundLabel(data.match.roundLabel)} · {data.match.format}
              </h1>
              {data.match.scheduledAt && (
                <p className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-white/75">
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
                  <p className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-white/75">
                    Счет: {data.match.teamAScore} - {data.match.teamBScore}
                  </p>
                )}
            </div>

            <div className="w-fit border-[3px] border-[#061726] bg-[#061726] px-4 py-3 shadow-[4px_4px_0px_0px_#CD9C3E]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                Статус лобби
              </p>
              <p className="mt-1 text-lg font-black uppercase text-white">
                {allCheckedIn ? "Хост должен создать" : "Ждем чек-ин игроков"}
              </p>
            </div>
          </div>

          <CheckInGate
            scheduledAt={data.match.scheduledAt}
            isEligible={isCurrentUserParticipant}
            isCheckedIn={isCurrentUserCheckedIn}
            isCheckingIn={isCheckingIn}
            checkedInCount={checkInCount}
            totalPlayers={TOTAL_MATCH_PLAYERS}
            onCheckIn={() => void handleCheckIn()}
          />

          {checkInErrorMessage && (
            <p className="mt-3 text-sm font-bold text-[#FCA5A5]">
              {checkInErrorMessage}
            </p>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="overflow-hidden border-[4px] border-[#061726] bg-[#0B3A4A] shadow-[6px_6px_0px_0px_#061726]">
            <div className="border-b-[4px] border-[#061726] bg-[#061726] px-4 py-3 text-lg font-black uppercase tracking-[0.18em] text-[#CD9C3E]">
              {data.teamA.name}
            </div>
            <div>
              {data.teamA.roster.map((player) => (
                <PlayerRow
                  key={player.userId}
                  nickname={player.nickname}
                  isCaptain={player.isCaptain}
                  isCheckedIn={data.checkedInUserIds.includes(player.userId)}
                />
              ))}
              {data.teamA.roster.length === 0 && (
                <div className="px-4 py-4 text-sm text-white/75">
                  Игроков пока нет
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden border-[4px] border-[#061726] bg-[#0B3A4A] shadow-[6px_6px_0px_0px_#061726]">
            <div className="border-b-[4px] border-[#061726] bg-[#061726] px-4 py-3 text-lg font-black uppercase tracking-[0.18em] text-[#CD9C3E]">
              {data.teamB.name}
            </div>
            <div>
              {data.teamB.roster.map((player) => (
                <PlayerRow
                  key={player.userId}
                  nickname={player.nickname}
                  isCaptain={player.isCaptain}
                  isCheckedIn={data.checkedInUserIds.includes(player.userId)}
                />
              ))}
              {data.teamB.roster.length === 0 && (
                <div className="px-4 py-4 text-sm text-white/75">
                  Игроков пока нет
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726] md:p-6">
          {!allCheckedIn ? (
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                Этап 2
              </p>
              <h2 className="mt-2 text-2xl font-black uppercase text-white">
                Ожидание лобби
              </h2>
              <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[#CD9C3E]">
                ОЖИДАНИЕ ИГРОКОВ ({checkInCount}/{TOTAL_MATCH_PLAYERS})
              </p>
              <p className="mt-3 max-w-2xl text-sm text-white/80">
                Детали лобби откроются сразу после того, как все 10 игроков
                завершат первый чек-ин.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                  Этап 2
                </p>
                <h2 className="mt-2 text-2xl font-black uppercase text-white">
                  Детали лобби
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="border-[3px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                    Название лобби
                  </p>
                  <p className="mt-3 text-lg font-black uppercase text-white">
                    {data.match.lobbyName ?? "—"}
                  </p>
                </div>

                <div className="border-[3px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                    Пароль
                  </p>
                  <p className="mt-3 text-lg font-black uppercase text-white">
                    {data.match.lobbyPassword ?? "—"}
                  </p>
                </div>

                <div className="border-[3px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                    Хост
                  </p>
                  <p className="mt-3 text-lg font-black uppercase text-white">
                    {hostLabel}
                  </p>
                </div>
              </div>

              {isCurrentUserParticipant && (
                <div className="border-[4px] border-[#061726] bg-[#123C4D] p-5 shadow-[6px_6px_0px_0px_#061726]">
                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => void handleLobbyScreenshotChange(event)}
                  />

                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                    Этап 2
                  </p>
                  <h3 className="mt-2 text-2xl font-black uppercase text-white">
                    ФОТО ЛОББИ
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm text-white/80">
                    Сначала пройдите биометрию повторно, затем загрузите
                    скриншот лобби. Задание обязательное, но не блокирует доступ
                    к данным лобби.
                  </p>

                  {isCurrentUserLobbyConfirmed ? (
                    <>
                      <div className="mt-5 border-[3px] border-[#061726] bg-[#163f1d] px-4 py-4 text-sm font-black uppercase tracking-[0.18em] text-[#D9F99D] shadow-[4px_4px_0px_0px_#061726]">
                        ФОТО ЗАГРУЖЕНО ✅
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleAnalyze()}
                        disabled={isAnalyzing}
                        className="mt-4 border-[3px] border-[#061726] bg-[#0B3A4A] px-6 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-50"
                      >
                        {isAnalyzing ? "Анализ..." : "АНАЛИЗ СЕКРЕТНЫХ ДАННЫХ"}
                      </button>
                      {ocrData && (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="border-[3px] border-[#061726] bg-black p-4 text-xs font-mono text-[#39FF14] shadow-[4px_4px_0px_0px_#061726]">
                            <p className="uppercase tracking-[0.18em] text-white/70">
                              Host Match
                            </p>
                            <p
                              className={`mt-3 text-2xl font-black uppercase ${
                                ocrData.is_host_found
                                  ? "text-[#39FF14]"
                                  : "text-[#F87171]"
                              }`}
                            >
                              {String(ocrData.is_host_found)}
                            </p>
                          </div>
                          <div className="border-[3px] border-[#061726] bg-black p-4 text-xs font-mono text-[#39FF14] shadow-[4px_4px_0px_0px_#061726]">
                            <p className="uppercase tracking-[0.18em] text-white/70">
                              Uploader Match
                            </p>
                            <p
                              className={`mt-3 text-2xl font-black uppercase ${
                                ocrData.is_uploader_found
                                  ? "text-[#39FF14]"
                                  : "text-[#F87171]"
                              }`}
                            >
                              {String(ocrData.is_uploader_found)}
                            </p>
                          </div>
                        </div>
                      )}
                      {lobbyErrorMessage && (
                        <p className="mt-3 text-sm font-bold text-[#FCA5A5]">
                          {lobbyErrorMessage}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleConfirmLobby()}
                        disabled={isLobbyActionBusy || !isCurrentUserCheckedIn}
                        className="mt-5 border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-3 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70 disabled:shadow-[4px_4px_0px_0px_#061726]"
                      >
                        {isConfirmingLobby
                          ? "Проверка..."
                          : isUploadingLobbyScreenshot
                            ? "Загрузка..."
                            : "ПОДТВЕРДИТЕ ДЕВАЙС"}
                      </button>

                      {!isCurrentUserCheckedIn && (
                        <p className="mt-3 text-sm text-white/80">
                          Сначала завершите пре-матч чек-ин.
                        </p>
                      )}

                      {isWaitingForLobbyScreenshot &&
                        !isUploadingLobbyScreenshot && (
                          <button
                            type="button"
                            onClick={openLobbyScreenshotPicker}
                            className="mt-3 block border-[3px] border-[#061726] bg-white px-5 py-2 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                          >
                            СДЕЛАТЬ ФОТО ЛОББИ
                          </button>
                        )}

                      {lobbyErrorMessage && (
                        <p className="mt-3 text-sm font-bold text-[#FCA5A5]">
                          {lobbyErrorMessage}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          </section>

          {isCurrentUserLobbyHost && (
            <section className="mt-6 border-[4px] border-[#CD9C3E] bg-[#061726] p-5 shadow-[6px_6px_0px_0px_#CD9C3E] md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                    Пост-матч
                  </p>
                  <h2 className="mt-2 text-2xl font-black uppercase text-white">
                    РЕЗУЛЬТАТЫ МАТЧА
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm text-white/80">
                    Этот блок доступен только хосту лобби. Зафиксируйте итоговый
                    счет серии и загрузите скриншот каждой сыгранной карты.
                  </p>
                </div>

                <div className="w-fit border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[4px_4px_0px_0px_#061726]">
                  ХОСТ ЛОББИ: <span className="text-[#CD9C3E]">{hostLabel}</span>
                </div>
              </div>

              {hasReportedMatchResult ? (
                <div className="mt-5 space-y-5">
                  <div className="border-[4px] border-[#CD9C3E] bg-[#163f1d] px-4 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-[6px_6px_0px_0px_#061726]">
                    РЕЗУЛЬТАТ ПОДТВЕРЖДЕН ✅
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-4 shadow-[4px_4px_0px_0px_#061726]">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                        СЧЕТ СЕРИИ
                      </p>
                      <p className="mt-4 text-4xl font-black uppercase text-[#CD9C3E]">
                        {data.match.teamAScore} : {data.match.teamBScore}
                      </p>
                    </div>

                    <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-4 shadow-[4px_4px_0px_0px_#061726]">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                        ПОБЕДИТЕЛЬ
                      </p>
                      <p className="mt-4 text-2xl font-black uppercase text-white">
                        {reportedWinnerName ?? "Определен по счету"}
                      </p>
                    </div>

                    <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-4 shadow-[4px_4px_0px_0px_#061726]">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                        СКРИНШОТЫ
                      </p>
                      <p className="mt-4 text-2xl font-black uppercase text-white">
                        {data.match.resultScreenshotUrls.length}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {data.match.resultScreenshotUrls.map((screenshotUrl, index) => (
                      <div
                        key={`${screenshotUrl}-${index}`}
                        className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] p-4 shadow-[6px_6px_0px_0px_#061726]"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                          Скриншот Игры {index + 1}
                        </p>
                        <Image
                          src={screenshotUrl}
                          alt={`Скриншот Игры ${index + 1}`}
                          width={1600}
                          height={900}
                          className="mt-4 h-auto w-full border-[3px] border-[#061726] bg-black object-contain"
                        />
                        <a
                          href={screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-block border-[3px] border-[#CD9C3E] bg-[#061726] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                        >
                          ОТКРЫТЬ СКРИНШОТ
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <form
                  className="mt-5 space-y-6"
                  onSubmit={(event) => void handleMatchResultSubmit(event)}
                >
                  <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                          СЧЕТ СЕРИИ
                        </p>
                        <p className="mt-3 text-sm text-white/80">
                          Укажите финальный счет серии в формате {data.match.format}.
                        </p>
                      </div>
                      {seriesMaxWins !== null && (
                        <div className="border-[3px] border-[#CD9C3E] bg-[#061726] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726]">
                          ДО {seriesMaxWins} ПОБЕД
                        </div>
                      )}
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="border-[4px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                        <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
                          {data.teamA.name}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={seriesMaxWins ?? undefined}
                          value={reportedTeamAScore}
                          onChange={(event) =>
                            setReportedTeamAScore(
                              normalizeScoreInput(event.target.value, seriesMaxWins)
                            )
                          }
                          className="mt-4 h-24 w-full border-[4px] border-[#061726] bg-[#0B3A4A] px-5 text-center text-5xl font-black text-[#CD9C3E] outline-none placeholder:text-[#CD9C3E]/35"
                          placeholder="0"
                        />
                      </label>

                      <label className="border-[4px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                        <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
                          {data.teamB.name}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={seriesMaxWins ?? undefined}
                          value={reportedTeamBScore}
                          onChange={(event) =>
                            setReportedTeamBScore(
                              normalizeScoreInput(event.target.value, seriesMaxWins)
                            )
                          }
                          className="mt-4 h-24 w-full border-[4px] border-[#061726] bg-[#0B3A4A] px-5 text-center text-5xl font-black text-[#CD9C3E] outline-none placeholder:text-[#CD9C3E]/35"
                          placeholder="0"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                          СКРИНШОТЫ ИГР
                        </p>
                        <p className="mt-3 text-sm text-white/80">
                          Загружено {uploadedResultScreenshotCount} из {totalGames}.
                        </p>
                      </div>

                      {totalGames > 0 && (
                        <div className="border-[3px] border-[#CD9C3E] bg-[#061726] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726]">
                          СЫГРАНО КАРТ: {totalGames}
                        </div>
                      )}
                    </div>

                    {totalGames === 0 ? (
                      <div className="mt-5 border-[4px] border-[#CD9C3E] bg-[#061726] px-4 py-4 text-sm font-bold text-white shadow-[4px_4px_0px_0px_#061726]">
                        Укажите итоговый счет, чтобы загрузить скриншоты.
                      </div>
                    ) : (
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {resultScreenshotSlots.map((slot, index) => (
                          <div
                            key={`result-slot-${index}`}
                            className="border-[4px] border-[#CD9C3E] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#061726]"
                          >
                            <input
                              ref={(node) => {
                                resultScreenshotInputRefs.current[index] = node;
                              }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) =>
                                void handleResultScreenshotSelection(index, event)
                              }
                            />

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                                  Скриншот Игры {index + 1}
                                </p>
                                <p className="mt-2 text-sm font-bold text-white/80">
                                  {slot.publicUrl
                                    ? "Скриншот загружен."
                                    : "Скриншот еще не загружен."}
                                </p>
                              </div>

                              {slot.publicUrl && (
                                <a
                                  href={slot.publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:bg-[#145268] hover:shadow-[2px_2px_0px_0px_#061726]"
                                >
                                  ОТКРЫТЬ
                                </a>
                              )}
                            </div>

                            {slot.fileName && (
                              <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                                Файл: {slot.fileName}
                              </p>
                            )}

                            <button
                              type="button"
                              onClick={() => openResultScreenshotPicker(index)}
                              disabled={slot.isUploading || isSubmittingMatchResult}
                              className="mt-4 border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-5 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:bg-[#145268] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-50"
                            >
                              {slot.isUploading
                                ? "ЗАГРУЗКА..."
                                : slot.publicUrl
                                  ? "ЗАМЕНИТЬ СКРИНШОТ"
                                  : "ЗАГРУЗИТЬ СКРИНШОТ"}
                            </button>

                            {slot.errorMessage && (
                              <p className="mt-3 text-sm font-bold text-[#FCA5A5]">
                                {slot.errorMessage}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {hasInvalidResultSeriesLength && seriesLength !== null && (
                    <p className="text-sm font-bold text-[#FCA5A5]">
                      Серия {data.match.format} не может содержать больше {seriesLength} игр.
                    </p>
                  )}

                  {!hasInvalidResultSeriesLength &&
                    totalGames > 0 &&
                    parsedReportedTeamAScore === parsedReportedTeamBScore && (
                      <p className="text-sm font-bold text-[#FCA5A5]">
                        Итоговый счет серии не может быть ничейным.
                      </p>
                    )}

                  {!hasInvalidResultSeriesLength &&
                    totalGames > 0 &&
                    parsedReportedTeamAScore !== parsedReportedTeamBScore &&
                    seriesMaxWins !== null &&
                    Math.max(parsedReportedTeamAScore, parsedReportedTeamBScore) !==
                      seriesMaxWins && (
                      <p className="text-sm font-bold text-[#FCA5A5]">
                        Победитель должен набрать {seriesMaxWins} карт(ы) в формате{" "}
                        {data.match.format}.
                      </p>
                    )}

                  {matchResultErrorMessage && (
                    <p className="text-sm font-bold text-[#FCA5A5]">
                      {matchResultErrorMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isResultSubmitDisabled}
                    className="border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:bg-[#145268] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-50"
                  >
                    {isSubmittingMatchResult
                      ? "ПОДТВЕРЖДЕНИЕ..."
                      : "ПОДТВЕРДИТЬ РЕЗУЛЬТАТ"}
                  </button>
                </form>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
