"use client";

import { useEffect, useMemo, useState } from "react";

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
  onCheckIn: () => void;
};

export function CheckInGate({
  scheduledAt,
  isEligible,
  isCheckedIn,
  isCheckingIn,
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

  const scheduledTimeMs = useMemo(() => {
    if (!scheduledAt) {
      return null;
    }

    const parsedTime = new Date(scheduledAt).getTime();
    return Number.isNaN(parsedTime) ? null : parsedTime;
  }, [scheduledAt]);

  if (!isEligible && !isCheckedIn) {
    return null;
  }

  if (isCheckedIn) {
    return (
      <div className="mt-4">
        <span className="inline-flex rounded bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800">
          Вы готовы
        </span>
      </div>
    );
  }

  if (!scheduledTimeMs) {
    return (
      <div className="mt-4 space-y-2">
        <button
          type="button"
          disabled
          className="rounded border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500"
        >
          Чекин откроется за 30 минут до начала
        </button>
        <p className="text-sm text-zinc-500">Время матча еще не назначено.</p>
      </div>
    );
  }

  const checkInOpensAtMs = scheduledTimeMs - CHECK_IN_WINDOW_MS;
  const millisecondsUntilOpen = checkInOpensAtMs - currentTimeMs;
  const isWindowOpen = millisecondsUntilOpen <= 0;

  if (!isWindowOpen) {
    return (
      <div className="mt-4 space-y-2">
        <button
          type="button"
          disabled
          className="rounded border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500"
        >
          Чекин откроется за 30 минут до начала
        </button>
        <p className="text-sm text-zinc-500">
          До открытия чекина: {formatCountdown(millisecondsUntilOpen)}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onCheckIn}
        disabled={isCheckingIn}
        className="rounded border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
      >
        {isCheckingIn ? "Отмечаюсь..." : "Чекин"}
      </button>
    </div>
  );
}
