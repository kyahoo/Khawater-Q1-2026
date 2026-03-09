"use client";

import type { ChangeEvent, FormEvent, RefObject } from "react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { MatchRoomData } from "@/lib/supabase/matches";
import { CheckInGate } from "./check-in-gate";

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

type MatchTabsProps = {
  match: MatchRoomData["match"];
  teamA: MatchRoomData["teamA"];
  teamB: MatchRoomData["teamB"];
  checkedInUserIds: string[];
  hostLabel: string;
  totalPlayers: number;
  roundLabelDisplay: string;
  scheduledAtDisplay: string | null;
  lobbyStatusLabel: string;
  lobby: {
    isCurrentUserParticipant: boolean;
    isCurrentUserCheckedIn: boolean;
    isCurrentUserLobbyConfirmed: boolean;
    isLobbyActionBusy: boolean;
    isWaitingForLobbyScreenshot: boolean;
    isUploadingLobbyScreenshot: boolean;
    isConfirmingLobby: boolean;
    isAnalyzing: boolean;
    checkInCount: number;
    allCheckedIn: boolean;
    checkInErrorMessage: string;
    lobbyErrorMessage: string;
    ocrData: LobbyScreenshotVerificationData | null;
    screenshotInputRef: RefObject<HTMLInputElement | null>;
    onCheckIn: () => void;
    onConfirmLobby: () => void;
    onOpenLobbyScreenshotPicker: () => void;
    onLobbyScreenshotChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onAnalyze: () => void;
    isCheckingIn: boolean;
  };
  results: {
    isCurrentUserLobbyHost: boolean;
    hasReportedMatchResult: boolean;
    reportedWinnerName: string | null;
    safeResultScreenshotUrls: string[];
    reportedResultScreenshotSlots: Array<{
      index: number;
      url: string | null;
    }>;
    seriesLength: number | null;
    seriesMaxWins: number | null;
    totalGames: number;
    uploadedResultScreenshotCount: number;
    safeResultScreenshotSlots: ResultScreenshotSlotState[];
    reportedTeamAScore: string;
    reportedTeamBScore: string;
    hasInvalidResultSeriesLength: boolean;
    parsedReportedTeamAScore: number;
    parsedReportedTeamBScore: number;
    matchResultErrorMessage: string;
    isResultSubmitDisabled: boolean;
    isSubmittingMatchResult: boolean;
    onMatchResultSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onReportedTeamAScoreChange: (value: string) => void;
    onReportedTeamBScoreChange: (value: string) => void;
    onSetResultScreenshotInputRef: (
      index: number,
      node: HTMLInputElement | null
    ) => void;
    onResultScreenshotSelection: (
      index: number,
      event: ChangeEvent<HTMLInputElement>
    ) => void;
    onOpenResultScreenshotPicker: (index: number) => void;
  };
};

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

export function MatchTabs({
  match,
  teamA,
  teamB,
  checkedInUserIds,
  hostLabel,
  totalPlayers,
  roundLabelDisplay,
  scheduledAtDisplay,
  lobbyStatusLabel,
  lobby,
  results,
}: MatchTabsProps) {
  const [activeTab, setActiveTab] = useState<"lobby" | "results">("lobby");

  const showTieError =
    !results.hasInvalidResultSeriesLength &&
    results.totalGames > 0 &&
    results.parsedReportedTeamAScore === results.parsedReportedTeamBScore;
  const showSeriesWinnerError =
    !results.hasInvalidResultSeriesLength &&
    results.totalGames > 0 &&
    results.parsedReportedTeamAScore !== results.parsedReportedTeamBScore &&
    results.seriesMaxWins !== null &&
    Math.max(
      results.parsedReportedTeamAScore,
      results.parsedReportedTeamBScore
    ) !== results.seriesMaxWins;

  const tabButtonClass = (tab: "lobby" | "results") =>
    `border-[3px] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] shadow-[4px_4px_0px_0px_#061726] transition-all ${
      activeTab === tab
        ? "border-[#CD9C3E] bg-[#CD9C3E] text-[#061726]"
        : "border-[#061726] bg-[#0B3A4A] text-white hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
    }`;

  return (
    <>
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
              {roundLabelDisplay} · {match.format}
            </h1>
            {scheduledAtDisplay && (
              <p className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-white/75">
                {scheduledAtDisplay}
              </p>
            )}
            {match.status === "finished" &&
              match.teamAScore !== null &&
              match.teamBScore !== null && (
                <p className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-white/75">
                  Счет: {match.teamAScore} - {match.teamBScore}
                </p>
              )}
          </div>

          <div className="w-fit border-[3px] border-[#061726] bg-[#061726] px-4 py-3 shadow-[4px_4px_0px_0px_#CD9C3E]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
              Статус лобби
            </p>
            <p className="mt-1 text-lg font-black uppercase text-white">
              {lobbyStatusLabel}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setActiveTab("lobby")}
          className={tabButtonClass("lobby")}
        >
          ЛОББИ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("results")}
          className={tabButtonClass("results")}
        >
          РЕЗУЛЬТАТЫ
        </button>
      </div>

      {activeTab === "lobby" ? (
        <>
          <CheckInGate
            scheduledAt={match.scheduledAt}
            isEligible={lobby.isCurrentUserParticipant}
            isCheckedIn={lobby.isCurrentUserCheckedIn}
            isCheckingIn={lobby.isCheckingIn}
            checkedInCount={lobby.checkInCount}
            totalPlayers={totalPlayers}
            onCheckIn={lobby.onCheckIn}
          />

          {lobby.checkInErrorMessage && (
            <p className="mt-3 text-sm font-bold text-[#FCA5A5]">
              {lobby.checkInErrorMessage}
            </p>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden border-[4px] border-[#061726] bg-[#0B3A4A] shadow-[6px_6px_0px_0px_#061726]">
              <div className="border-b-[4px] border-[#061726] bg-[#061726] px-4 py-3 text-lg font-black uppercase tracking-[0.18em] text-[#CD9C3E]">
                {teamA.name}
              </div>
              <div>
                {teamA.roster.map((player) => (
                  <PlayerRow
                    key={player.userId}
                    nickname={player.nickname}
                    isCaptain={player.isCaptain}
                    isCheckedIn={checkedInUserIds.includes(player.userId)}
                  />
                ))}
                {teamA.roster.length === 0 && (
                  <div className="px-4 py-4 text-sm text-white/75">
                    Игроков пока нет
                  </div>
                )}
              </div>
            </section>

            <section className="overflow-hidden border-[4px] border-[#061726] bg-[#0B3A4A] shadow-[6px_6px_0px_0px_#061726]">
              <div className="border-b-[4px] border-[#061726] bg-[#061726] px-4 py-3 text-lg font-black uppercase tracking-[0.18em] text-[#CD9C3E]">
                {teamB.name}
              </div>
              <div>
                {teamB.roster.map((player) => (
                  <PlayerRow
                    key={player.userId}
                    nickname={player.nickname}
                    isCaptain={player.isCaptain}
                    isCheckedIn={checkedInUserIds.includes(player.userId)}
                  />
                ))}
                {teamB.roster.length === 0 && (
                  <div className="px-4 py-4 text-sm text-white/75">
                    Игроков пока нет
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="mt-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726] md:p-6">
            {!lobby.allCheckedIn ? (
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                  Этап 2
                </p>
                <h2 className="mt-2 text-2xl font-black uppercase text-white">
                  Ожидание лобби
                </h2>
                <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[#CD9C3E]">
                  ОЖИДАНИЕ ИГРОКОВ ({lobby.checkInCount}/{totalPlayers})
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
                      {match.lobbyName ?? "—"}
                    </p>
                  </div>

                  <div className="border-[3px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                      Пароль
                    </p>
                    <p className="mt-3 text-lg font-black uppercase text-white">
                      {match.lobbyPassword ?? "—"}
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

                {lobby.isCurrentUserParticipant && (
                  <div className="border-[4px] border-[#061726] bg-[#123C4D] p-5 shadow-[6px_6px_0px_0px_#061726]">
                    <input
                      ref={lobby.screenshotInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(event) => void lobby.onLobbyScreenshotChange(event)}
                    />

                    <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                      Этап 2
                    </p>
                    <h3 className="mt-2 text-2xl font-black uppercase text-white">
                      ФОТО ЛОББИ
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm text-white/80">
                      Обязательно сделайте фото лобби. На нем должно быть видно
                      ваше имя, а также имя хоста.
                    </p>
                    {lobby.isCurrentUserLobbyConfirmed ? (
                      <>
                        <div className="mt-5 border-[3px] border-[#061726] bg-[#163f1d] px-4 py-4 text-sm font-black uppercase tracking-[0.18em] text-[#D9F99D] shadow-[4px_4px_0px_0px_#061726]">
                          ФОТО ЗАГРУЖЕНО ✅
                        </div>
                        <button
                          type="button"
                          onClick={lobby.onAnalyze}
                          disabled={lobby.isAnalyzing}
                          className="mt-4 border-[3px] border-[#061726] bg-[#0B3A4A] px-6 py-3 text-sm font-black uppercase text-white shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-50"
                        >
                          {lobby.isAnalyzing ? "Анализ..." : "АНАЛИЗ СЕКРЕТНЫХ ДАННЫХ"}
                        </button>
                        {lobby.ocrData && (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="border-[3px] border-[#061726] bg-black p-4 text-xs font-mono text-[#39FF14] shadow-[4px_4px_0px_0px_#061726]">
                              <p className="uppercase tracking-[0.18em] text-white/70">
                                Host Match
                              </p>
                              <p
                                className={`mt-3 text-2xl font-black uppercase ${
                                  lobby.ocrData.is_host_found
                                    ? "text-[#39FF14]"
                                    : "text-[#F87171]"
                                }`}
                              >
                                {String(lobby.ocrData.is_host_found)}
                              </p>
                            </div>
                            <div className="border-[3px] border-[#061726] bg-black p-4 text-xs font-mono text-[#39FF14] shadow-[4px_4px_0px_0px_#061726]">
                              <p className="uppercase tracking-[0.18em] text-white/70">
                                Uploader Match
                              </p>
                              <p
                                className={`mt-3 text-2xl font-black uppercase ${
                                  lobby.ocrData.is_uploader_found
                                    ? "text-[#39FF14]"
                                    : "text-[#F87171]"
                                }`}
                              >
                                {String(lobby.ocrData.is_uploader_found)}
                              </p>
                            </div>
                          </div>
                        )}
                        {lobby.lobbyErrorMessage && (
                          <p className="mt-3 text-sm font-bold text-[#FCA5A5]">
                            {lobby.lobbyErrorMessage}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={lobby.onConfirmLobby}
                          disabled={
                            lobby.isLobbyActionBusy ||
                            !lobby.isCurrentUserCheckedIn
                          }
                          className="mt-5 border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-3 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70 disabled:shadow-[4px_4px_0px_0px_#061726]"
                        >
                          {lobby.isConfirmingLobby
                            ? "Проверка..."
                            : lobby.isUploadingLobbyScreenshot
                              ? "Загрузка..."
                              : "ПОДТВЕРДИТЕ ДЕВАЙС"}
                        </button>

                        {!lobby.isCurrentUserCheckedIn && (
                          <p className="mt-3 text-sm text-white/80">
                            Сначала завершите пре-матч чек-ин.
                          </p>
                        )}

                        {lobby.isWaitingForLobbyScreenshot &&
                          !lobby.isUploadingLobbyScreenshot && (
                            <button
                              type="button"
                              onClick={lobby.onOpenLobbyScreenshotPicker}
                              className="mt-3 block border-[3px] border-[#061726] bg-white px-5 py-2 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                            >
                              СДЕЛАТЬ ФОТО ЛОББИ
                            </button>
                          )}

                        {lobby.lobbyErrorMessage && (
                          <p className="mt-3 text-sm font-bold text-[#FCA5A5]">
                            {lobby.lobbyErrorMessage}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      ) : results.isCurrentUserLobbyHost ? (
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
                Этот блок доступен только хосту лобби. Зафиксируйте итоговый счет
                серии и загрузите скриншот каждой сыгранной карты.
              </p>
            </div>

            <div className="w-fit border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[4px_4px_0px_0px_#061726]">
              ХОСТ ЛОББИ: <span className="text-[#CD9C3E]">{hostLabel}</span>
            </div>
          </div>

          {results.hasReportedMatchResult ? (
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
                    {match.teamAScore} : {match.teamBScore}
                  </p>
                </div>

                <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-4 shadow-[4px_4px_0px_0px_#061726]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                    ПОБЕДИТЕЛЬ
                  </p>
                  <p className="mt-4 text-2xl font-black uppercase text-white">
                    {results.reportedWinnerName ?? "Определен по счету"}
                  </p>
                </div>

                <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-4 shadow-[4px_4px_0px_0px_#061726]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                    СКРИНШОТЫ
                  </p>
                  <p className="mt-4 text-2xl font-black uppercase text-white">
                    {results.safeResultScreenshotUrls.length}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {results.reportedResultScreenshotSlots.length > 0 ? (
                  results.reportedResultScreenshotSlots.map(({ index, url }) => (
                    <div
                      key={`reported-screenshot-${index}`}
                      className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] p-4 shadow-[6px_6px_0px_0px_#061726]"
                    >
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
                        Скриншот Игры {index + 1}
                      </p>
                      {url ? (
                        <>
                          <Image
                            src={url}
                            alt={`Скриншот Игры ${index + 1}`}
                            width={1600}
                            height={900}
                            className="mt-4 h-auto w-full border-[3px] border-[#061726] bg-black object-contain"
                          />
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-block border-[3px] border-[#CD9C3E] bg-[#061726] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                          >
                            ОТКРЫТЬ СКРИНШОТ
                          </a>
                        </>
                      ) : (
                        <div className="mt-4 border-[3px] border-[#061726] bg-[#061726] px-4 py-6 text-sm font-bold text-white/80 shadow-[4px_4px_0px_0px_#061726]">
                          Скриншот еще не загружен.
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] px-4 py-4 text-sm font-bold text-white shadow-[4px_4px_0px_0px_#061726]">
                    Скриншоты серии пока недоступны.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <form
              className="mt-5 space-y-6"
              onSubmit={(event) => void results.onMatchResultSubmit(event)}
            >
              <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
                      СЧЕТ СЕРИИ
                    </p>
                    <p className="mt-3 text-sm text-white/80">
                      Укажите финальный счет серии в формате {match.format}.
                    </p>
                  </div>
                  {results.seriesMaxWins !== null && (
                    <div className="border-[3px] border-[#CD9C3E] bg-[#061726] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726]">
                      ДО {results.seriesMaxWins} ПОБЕД
                    </div>
                  )}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="border-[4px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                    <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
                      {teamA.name}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={results.seriesMaxWins ?? undefined}
                      value={results.reportedTeamAScore}
                      onChange={(event) =>
                        results.onReportedTeamAScoreChange(event.target.value)
                      }
                      className="mt-4 h-24 w-full border-[4px] border-[#061726] bg-[#0B3A4A] px-5 text-center text-5xl font-black text-[#CD9C3E] outline-none placeholder:text-[#CD9C3E]/35"
                      placeholder="0"
                    />
                  </label>

                  <label className="border-[4px] border-[#061726] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#CD9C3E]">
                    <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
                      {teamB.name}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={results.seriesMaxWins ?? undefined}
                      value={results.reportedTeamBScore}
                      onChange={(event) =>
                        results.onReportedTeamBScoreChange(event.target.value)
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
                      Загружено {results.uploadedResultScreenshotCount} из{" "}
                      {results.totalGames}.
                    </p>
                  </div>

                  {results.totalGames > 0 && (
                    <div className="border-[3px] border-[#CD9C3E] bg-[#061726] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726]">
                      СЫГРАНО КАРТ: {results.totalGames}
                    </div>
                  )}
                </div>

                {results.totalGames === 0 ? (
                  <div className="mt-5 border-[4px] border-[#CD9C3E] bg-[#061726] px-4 py-4 text-sm font-bold text-white shadow-[4px_4px_0px_0px_#061726]">
                    Укажите итоговый счет, чтобы загрузить скриншоты.
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {results.safeResultScreenshotSlots.map((slot, index) => (
                      <div
                        key={`result-slot-${index}`}
                        className="border-[4px] border-[#CD9C3E] bg-[#061726] p-4 shadow-[4px_4px_0px_0px_#061726]"
                      >
                        <input
                          ref={(node) => {
                            results.onSetResultScreenshotInputRef(index, node);
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) =>
                            void results.onResultScreenshotSelection(index, event)
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
                          onClick={() => results.onOpenResultScreenshotPicker(index)}
                          disabled={slot.isUploading || results.isSubmittingMatchResult}
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

              {results.hasInvalidResultSeriesLength &&
                results.seriesLength !== null && (
                  <p className="text-sm font-bold text-[#FCA5A5]">
                    Серия {match.format} не может содержать больше{" "}
                    {results.seriesLength} игр.
                  </p>
                )}

              {showTieError && (
                <p className="text-sm font-bold text-[#FCA5A5]">
                  Итоговый счет серии не может быть ничейным.
                </p>
              )}

              {showSeriesWinnerError && results.seriesMaxWins !== null && (
                <p className="text-sm font-bold text-[#FCA5A5]">
                  Победитель должен набрать {results.seriesMaxWins} карт(ы) в
                  формате {match.format}.
                </p>
              )}

              {results.matchResultErrorMessage && (
                <p className="text-sm font-bold text-[#FCA5A5]">
                  {results.matchResultErrorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={results.isResultSubmitDisabled}
                className="border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:bg-[#145268] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-50"
              >
                {results.isSubmittingMatchResult
                  ? "ПОДТВЕРЖДЕНИЕ..."
                  : "ПОДТВЕРДИТЬ РЕЗУЛЬТАТ"}
              </button>
            </form>
          )}
        </section>
      ) : (
        <section className="mt-6 border-[4px] border-[#CD9C3E] bg-[#061726] p-5 shadow-[6px_6px_0px_0px_#CD9C3E] md:p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
            Пост-матч
          </p>
          <h2 className="mt-2 text-2xl font-black uppercase text-white">
            РЕЗУЛЬТАТЫ МАТЧА
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-white/80">
            Этот блок доступен только хосту лобби.
          </p>
        </section>
      )}
    </>
  );
}
