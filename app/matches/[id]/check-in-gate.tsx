"use client";

import { useEffect, useState } from "react";

const CHECK_IN_WINDOW_MS = 30 * 60 * 1000;

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

type CheckInGateProps = {
  scheduledAt: string | null;
  isEligible: boolean;
  isCheckedIn: boolean;
  isCheckingIn: boolean;
  checkedInCount: number;
  checkInThreshold: number;
  onCheckIn: () => void;
};

export function CheckInGate({
  scheduledAt,
  isEligible,
  isCheckedIn,
  isCheckingIn,
  checkedInCount,
  checkInThreshold,
  onCheckIn,
}: CheckInGateProps) {
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const scheduledTimeMs = scheduledAt ? new Date(scheduledAt).getTime() : null;
  const hasValidScheduledTime =
    typeof scheduledTimeMs === "number" && !Number.isNaN(scheduledTimeMs);

  if (!isEligible && !isCheckedIn) {
    return null;
  }

  const counterLabel = `ОЖИДАНИЕ ИГРОКОВ (${checkedInCount}/${checkInThreshold})`;

  if (isCheckedIn) {
    return (
      <div className="mt-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
              Пре-матч
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase text-white">
              Чек-ин подтвержден
            </h2>
          </div>
          <span className="w-fit border-[3px] border-[#061726] bg-[#163f1d] px-4 py-2 text-sm font-black uppercase text-[#D9F99D] shadow-[4px_4px_0px_0px_#061726]">
            Готов
          </span>
        </div>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[#CD9C3E]">
          {counterLabel}
        </p>
      </div>
    );
  }

  if (!hasValidScheduledTime) {
    return (
      <div className="mt-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
          Пре-матч
        </p>
        <h2 className="mt-2 text-2xl font-black uppercase text-white">Чек-ин</h2>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[#CD9C3E]">
          {counterLabel}
        </p>
        <button
          type="button"
          disabled
          className="mt-4 border-[3px] border-[#061726] bg-[#3B5561] px-6 py-3 text-sm font-black uppercase text-[#D4D4D8] shadow-[4px_4px_0px_0px_#061726]"
        >
          Чек-ин откроется позже
        </button>
        <p className="mt-3 text-sm text-white/80">Время матча еще не назначено.</p>
      </div>
    );
  }

  const checkInOpensAtMs = scheduledTimeMs - CHECK_IN_WINDOW_MS;
  const millisecondsUntilOpen = checkInOpensAtMs - currentTimeMs;
  const isWindowOpen = millisecondsUntilOpen <= 0;

  if (!isWindowOpen) {
    return (
      <div className="mt-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
          Пре-матч
        </p>
        <h2 className="mt-2 text-2xl font-black uppercase text-white">Чек-ин</h2>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[#CD9C3E]">
          {counterLabel}
        </p>
        <button
          type="button"
          disabled
          className="mt-4 border-[3px] border-[#061726] bg-[#3B5561] px-6 py-3 text-sm font-black uppercase text-[#D4D4D8] shadow-[4px_4px_0px_0px_#061726]"
        >
          Чек-ин закрыт
        </button>
        <p className="mt-3 text-sm text-white/80">
          До открытия чекина: {formatCountdown(millisecondsUntilOpen)}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-[4px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
            Пре-матч
          </p>
          <h2 className="mt-2 text-2xl font-black uppercase text-white">Чек-ин</h2>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-[#CD9C3E]">
            {counterLabel}
          </p>
        </div>
        <p className="max-w-sm text-sm text-white/80">
          Нажмите кнопку, чтобы подтвердить готовность к игре.
        </p>
      </div>
      <button
        type="button"
        onClick={onCheckIn}
        disabled={isCheckingIn}
        className="mt-5 border-[3px] border-[#061726] bg-[#CD9C3E] px-6 py-3 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:bg-[#8A6A2C] disabled:text-[#061726]/70 disabled:shadow-[4px_4px_0px_0px_#061726]"
      >
        {isCheckingIn ? "Сохранение..." : "ГОТОВ К ИГРЕ"}
      </button>
    </div>
  );
}
