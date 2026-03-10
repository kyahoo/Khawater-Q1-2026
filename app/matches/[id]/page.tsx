"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { MatchTabs } from "./match-tabs";

const LOBBY_MAP_NUMBERS = [1, 2, 3] as const;

type LobbyMapNumber = (typeof LOBBY_MAP_NUMBERS)[number];

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

function createLobbyMapRecord<T>(
  factory: (mapNumber: LobbyMapNumber) => T
): Record<LobbyMapNumber, T> {
  return Object.fromEntries(
    LOBBY_MAP_NUMBERS.map((mapNumber) => [mapNumber, factory(mapNumber)])
  ) as Record<LobbyMapNumber, T>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeResultScreenshotUrls(urls: string[] | null | undefined) {
  return Array.isArray(urls) ? urls.filter(isNonEmptyString) : [];
}

function createEmptyResultScreenshotSlot(
  partialSlot?: Partial<ResultScreenshotSlotState>
): ResultScreenshotSlotState {
  return {
    publicUrl: partialSlot?.publicUrl ?? null,
    fileName: partialSlot?.fileName ?? "",
    isUploading: partialSlot?.isUploading ?? false,
    errorMessage: partialSlot?.errorMessage ?? "",
  };
}

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

function getMatchRoomLoadErrorMessage(error: unknown) {
  const message = getErrorMessage(error, "Не удалось загрузить данные матча.");

  return message.startsWith("No tournament match found")
    ? "Матч не найден."
    : message;
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
  const [pendingLobbyMapNumber, setPendingLobbyMapNumber] =
    useState<LobbyMapNumber | null>(null);
  const [confirmingLobbyMapNumber, setConfirmingLobbyMapNumber] =
    useState<LobbyMapNumber | null>(null);
  const [uploadingLobbyMapNumber, setUploadingLobbyMapNumber] =
    useState<LobbyMapNumber | null>(null);
  const [waitingLobbyMapNumber, setWaitingLobbyMapNumber] =
    useState<LobbyMapNumber | null>(null);
  const [analyzingLobbyMapNumber, setAnalyzingLobbyMapNumber] =
    useState<LobbyMapNumber | null>(null);
  const [lobbyErrorMessagesByMap, setLobbyErrorMessagesByMap] = useState<
    Record<LobbyMapNumber, string>
  >(() => createLobbyMapRecord(() => ""));
  const [ocrDataByMap, setOcrDataByMap] = useState<
    Record<LobbyMapNumber, LobbyScreenshotVerificationData | null>
  >(() => createLobbyMapRecord(() => null));
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
          setErrorMessage(getMatchRoomLoadErrorMessage(result.error));
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
    const safeResultScreenshotUrls = normalizeResultScreenshotUrls(
      data.match?.resultScreenshotUrls ?? []
    );
    setResultScreenshotSlots(
      safeResultScreenshotUrls.map((publicUrl, index) =>
        createEmptyResultScreenshotSlot({
          publicUrl,
          fileName: `Скриншот Игры ${index + 1}`,
        })
      )
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

        return createEmptyResultScreenshotSlot();
      });
    });

    resultScreenshotInputRefs.current = resultScreenshotInputRefs.current.slice(
      0,
      Math.max(totalGames, 0)
    );
  }, [reportedTeamAScore, reportedTeamBScore]);

  useEffect(() => {
    setPendingLobbyMapNumber(null);
    setConfirmingLobbyMapNumber(null);
    setUploadingLobbyMapNumber(null);
    setWaitingLobbyMapNumber(null);
    setAnalyzingLobbyMapNumber(null);
    setLobbyErrorMessagesByMap(createLobbyMapRecord(() => ""));
    setOcrDataByMap(createLobbyMapRecord(() => null));
  }, [matchId]);

  function setLobbyMapError(mapNumber: LobbyMapNumber, message: string) {
    setLobbyErrorMessagesByMap((current) => ({
      ...current,
      [mapNumber]: message,
    }));
  }

  function clearLobbyMapError(mapNumber: LobbyMapNumber) {
    setLobbyMapError(mapNumber, "");
  }

  function clearAllLobbyMapErrors() {
    setLobbyErrorMessagesByMap(createLobbyMapRecord(() => ""));
  }

  function setLobbyMapOcrData(
    mapNumber: LobbyMapNumber,
    nextData: LobbyScreenshotVerificationData | null
  ) {
    setOcrDataByMap((current) => ({
      ...current,
      [mapNumber]: nextData,
    }));
  }

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

  function openLobbyScreenshotPicker(mapNumber: LobbyMapNumber) {
    setPendingLobbyMapNumber(mapNumber);
    openFilePicker(screenshotInputRef, (message) => setLobbyMapError(mapNumber, message), "");
  }

  function updateResultScreenshotSlot(
    slotIndex: number,
    updater: (slot: ResultScreenshotSlotState) => ResultScreenshotSlotState
  ) {
    setResultScreenshotSlots((currentSlots) =>
      currentSlots.map((slot, currentIndex) =>
        currentIndex === slotIndex
          ? updater(slot ?? createEmptyResultScreenshotSlot())
          : slot ?? createEmptyResultScreenshotSlot()
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
    clearAllLobbyMapErrors();
    setWaitingLobbyMapNumber(null);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setCheckInErrorMessage("Войдите в аккаунт для отметки.");
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

  async function handleConfirmLobby(mapNumber: LobbyMapNumber) {
    if (!matchId) {
      return;
    }

    setConfirmingLobbyMapNumber(mapNumber);
    clearLobbyMapError(mapNumber);
    setCheckInErrorMessage("");

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setLobbyMapError(mapNumber, "Войдите в аккаунт для подтверждения лобби.");
        return;
      }

      const biometricErrorMessage =
        await runMatchBiometricVerification(accessToken);

      if (biometricErrorMessage) {
        setLobbyMapError(mapNumber, biometricErrorMessage);
        return;
      }

      setWaitingLobbyMapNumber(mapNumber);
      openLobbyScreenshotPicker(mapNumber);
    } catch (error) {
      setLobbyMapError(
        mapNumber,
        getErrorMessage(error, "Не удалось подтвердить лобби.")
      );
    } finally {
      setConfirmingLobbyMapNumber(null);
    }
  }

  async function handleLobbyScreenshotChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const screenshotFile = event.target.files?.[0];
    event.target.value = "";
    const targetMapNumber = pendingLobbyMapNumber;

    if (!screenshotFile || !matchId || !currentUserId || !targetMapNumber) {
      return;
    }

    if (!screenshotFile.type.startsWith("image/")) {
      setLobbyMapError(targetMapNumber, "Загрузите изображение скриншота.");
      return;
    }

    setUploadingLobbyMapNumber(targetMapNumber);
    clearLobbyMapError(targetMapNumber);
    setLobbyMapOcrData(targetMapNumber, null);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setLobbyMapError(targetMapNumber, "Войдите в аккаунт для загрузки скриншота.");
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
        publicUrl,
        targetMapNumber
      );

      if (saveResult.error) {
        throw new Error(saveResult.error);
      }

      setWaitingLobbyMapNumber(null);
      setPendingLobbyMapNumber(null);
      await refreshMatchRoom();
    } catch (error) {
      console.error("Lobby screenshot upload failed:", error);
      setLobbyMapError(
        targetMapNumber,
        getErrorMessage(error, "Не удалось загрузить скриншот.")
      );
    } finally {
      setUploadingLobbyMapNumber(null);
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

      if (uploadResult.error || !uploadResult.publicUrl) {
        updateResultScreenshotSlot(slotIndex, (slot) => ({
          ...slot,
          isUploading: false,
          errorMessage:
            uploadResult.error ??
            "Не удалось загрузить скриншот игры.",
        }));
        return;
      }

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

  async function handleAnalyze(mapNumber: LobbyMapNumber) {
    if (!matchId) {
      return;
    }

    setAnalyzingLobbyMapNumber(mapNumber);
    clearLobbyMapError(mapNumber);
    setLobbyMapOcrData(mapNumber, null);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setLobbyMapError(mapNumber, "Войдите в аккаунт для анализа скриншота.");
        return;
      }

      const result = await analyzeLobbyScreenshot(matchId, accessToken, mapNumber);

      if (result.error || !result.data) {
        setLobbyMapError(
          mapNumber,
          result.error ?? "Не удалось проанализировать скриншот."
        );
        return;
      }

      setLobbyMapOcrData(mapNumber, result.data);
    } catch (error) {
      console.error("Lobby screenshot analysis failed:", error);
      setLobbyMapError(
        mapNumber,
        getErrorMessage(error, "Не удалось проанализировать скриншот.")
      );
    } finally {
      setAnalyzingLobbyMapNumber(null);
    }
  }

  if (!matchId) {
    return (
      <div className="min-h-screen text-white">
        <div className="min-h-screen bg-[#0B3A4A]/10 backdrop-blur-sm shadow-[0_0_60px_-10px_rgba(11,58,74,0.3)]">
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
  const currentUserTeam =
    currentUserId && data.teamA.roster.some((player) => player.userId === currentUserId)
      ? data.teamA
      : currentUserId && data.teamB.roster.some((player) => player.userId === currentUserId)
        ? data.teamB
        : null;
  const opponentTeam =
    currentUserTeam?.id === data.teamA.id
      ? data.teamB
      : currentUserTeam?.id === data.teamB.id
        ? data.teamA
        : null;
  const isCurrentUserCaptain = Boolean(
    currentUserId &&
      currentUserTeam?.roster.some(
        (player) => player.userId === currentUserId && player.isCaptain
      )
  );
  const isCurrentUserCheckedIn = Boolean(
    currentUserId && data.checkedInUserIds.includes(currentUserId)
  );
  const checkInThreshold = Math.max(data.match.checkInThreshold, 1);
  const checkInCount = data.checkedInUserIds.length;
  const allCheckedIn = checkInCount >= checkInThreshold;

  const hostTeam = data.teamA;
  const hostCaptain = hostTeam.roster.find((player) => player.isCaptain);
  const hostCaptainUserId = hostCaptain?.userId ?? null;
  const hostTeamId = hostTeam.id;
  const hostLabel = hostCaptain
    ? `${hostCaptain.nickname} (${hostTeam.name})`
    : hostTeam.name;
  const isCurrentUserLobbyHost = Boolean(
    currentUserId && hostCaptainUserId === currentUserId
  );
  const isCurrentUserHostCaptain = Boolean(
    isCurrentUserCaptain && currentUserTeam?.id === hostTeamId
  );
  const teamAHasCheckedIn = data.teamA.roster.some((player) =>
    data.checkedInUserIds.includes(player.userId)
  );
  const teamBHasCheckedIn = data.teamB.roster.some((player) =>
    data.checkedInUserIds.includes(player.userId)
  );
  const scheduledTimeMs = data.match.scheduledAt
    ? new Date(data.match.scheduledAt).getTime()
    : Number.NaN;
  const isLateCheckInLockout =
    Number.isFinite(scheduledTimeMs) &&
    Date.now() > scheduledTimeMs + 15 * 60 * 1000 &&
    !teamAHasCheckedIn &&
    !teamBHasCheckedIn;
  const currentUserLobbyPhotos = currentUserId
    ? data.lobbyPhotos.filter((photo) => photo.playerId === currentUserId)
    : [];
  const currentUserLobbyPhotoUrlByMap = createLobbyMapRecord(
    (mapNumber) =>
      currentUserLobbyPhotos.find((photo) => photo.mapNumber === mapNumber)
        ?.photoUrl ?? null
  );
  const currentLobbyMapNumber =
    LOBBY_MAP_NUMBERS.find(
      (mapNumber) => !currentUserLobbyPhotoUrlByMap[mapNumber]
    ) ?? null;
  const parsedReportedTeamAScore = reportedTeamAScore
    ? Number.parseInt(reportedTeamAScore, 10)
    : 0;
  const parsedReportedTeamBScore = reportedTeamBScore
    ? Number.parseInt(reportedTeamBScore, 10)
    : 0;
  const seriesLength = getSeriesLength(data.match.format);
  const seriesMaxWins = getSeriesMaxWins(data.match.format);
  const safeResultScreenshotUrls = normalizeResultScreenshotUrls(
    data.match?.resultScreenshotUrls ?? []
  );
  const safeResultScreenshotSlots = (Array.isArray(resultScreenshotSlots)
    ? resultScreenshotSlots
    : []
  ).map((slot, index) =>
    slot ??
    createEmptyResultScreenshotSlot({
      fileName: `Скриншот Игры ${index + 1}`,
    })
  );
  const totalGames = parsedReportedTeamAScore + parsedReportedTeamBScore;
  const reportedResultScreenshotSlotCount = Math.max(
    totalGames,
    safeResultScreenshotUrls.length
  );
  const reportedResultScreenshotSlots =
    reportedResultScreenshotSlotCount > 0
      ? Array.from({ length: reportedResultScreenshotSlotCount }, (_, index) => ({
          index,
          url: safeResultScreenshotUrls[index] ?? null,
        }))
      : [];
  const uploadedResultScreenshotCount = safeResultScreenshotSlots.filter((slot) =>
    Boolean(slot?.publicUrl)
  ).length;
  const hasReportedMatchResult =
    data.match.teamAScore !== null &&
    data.match.teamBScore !== null &&
    safeResultScreenshotUrls.length > 0;
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
    safeResultScreenshotSlots.some((slot) => slot?.isUploading) ||
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
  const roundLabelDisplay = formatRoundLabel(data.match.roundLabel);
  const scheduledAtDisplay = data.match.scheduledAt
    ? formatAlmatyDateTime(data.match.scheduledAt, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const lobbyStatusLabel = allCheckedIn
    ? "Хост должен создать"
    : "Ждем чек-ин игроков";

  return (
    <div className="min-h-screen text-white">
      <div className="min-h-screen bg-[#0B3A4A]/10 backdrop-blur-sm shadow-[0_0_60px_-10px_rgba(11,58,74,0.3)]">
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <MatchTabs
            matchId={matchId}
            match={data.match}
            teamA={data.teamA}
            teamB={data.teamB}
            checkedInUserIds={data.checkedInUserIds}
            hostLabel={hostLabel}
            checkInThreshold={checkInThreshold}
            roundLabelDisplay={roundLabelDisplay}
            scheduledAtDisplay={scheduledAtDisplay}
            lobbyStatusLabel={lobbyStatusLabel}
            lobby={{
              isCurrentUserParticipant,
              isCurrentUserCaptain,
              isCurrentUserHostCaptain,
              isCurrentUserCheckedIn,
              currentTeamId: currentUserTeam?.id ?? null,
              opponentTeamId: opponentTeam?.id ?? null,
              currentLobbyMapNumber,
              uploadedLobbyPhotoUrlByMap: currentUserLobbyPhotoUrlByMap,
              waitingLobbyMapNumber,
              uploadingLobbyMapNumber,
              confirmingLobbyMapNumber,
              analyzingLobbyMapNumber,
              checkInCount,
              allCheckedIn,
              checkInErrorMessage,
              lobbyErrorMessagesByMap,
              ocrDataByMap,
              screenshotInputRef,
              onCheckIn: handleCheckIn,
              onConfirmLobby: handleConfirmLobby,
              onOpenLobbyScreenshotPicker: openLobbyScreenshotPicker,
              onLobbyScreenshotChange: handleLobbyScreenshotChange,
              onAnalyze: handleAnalyze,
              isCheckingIn,
              opponentNotified: data.match.opponentNotified,
              isLateCheckInLockout,
            }}
            results={{
              isCurrentUserLobbyHost,
              hasReportedMatchResult,
              reportedWinnerName,
              safeResultScreenshotUrls,
              reportedResultScreenshotSlots,
              seriesLength,
              seriesMaxWins,
              totalGames,
              uploadedResultScreenshotCount,
              safeResultScreenshotSlots,
              reportedTeamAScore,
              reportedTeamBScore,
              hasInvalidResultSeriesLength,
              parsedReportedTeamAScore,
              parsedReportedTeamBScore,
              matchResultErrorMessage,
              isResultSubmitDisabled,
              isSubmittingMatchResult,
              onMatchResultSubmit: handleMatchResultSubmit,
              onReportedTeamAScoreChange: (value) =>
                setReportedTeamAScore(normalizeScoreInput(value, seriesMaxWins)),
              onReportedTeamBScoreChange: (value) =>
                setReportedTeamBScore(normalizeScoreInput(value, seriesMaxWins)),
              onSetResultScreenshotInputRef: (index, node) => {
                resultScreenshotInputRefs.current[index] = node;
              },
              onResultScreenshotSelection: handleResultScreenshotSelection,
              onOpenResultScreenshotPicker: openResultScreenshotPicker,
            }}
          />
        </main>
      </div>
    </div>
  );
}
