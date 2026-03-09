"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyOpponentLobbyReady } from "@/app/matches/actions";

type NotifyButtonProps = {
  matchId: string;
  currentTeamId: string;
  initialIsNotified: boolean;
};

export function NotifyButton({
  matchId,
  currentTeamId,
  initialIsNotified,
}: NotifyButtonProps) {
  const router = useRouter();
  const [isNotified, setIsNotified] = useState(initialIsNotified);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleNotifyOpponent() {
    if (isNotified || isPending) {
      return;
    }

    setErrorMessage("");

    startTransition(async () => {
      const result = await notifyOpponentLobbyReady(matchId, currentTeamId);

      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      setIsNotified(true);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleNotifyOpponent}
        disabled={isNotified || isPending}
        className={
          isNotified
            ? "border-[3px] border-[#061726] bg-gray-700 px-5 py-3 text-sm font-black uppercase text-gray-300 shadow-[4px_4px_0px_0px_#061726] opacity-90"
            : "border-[3px] border-[#061726] bg-[#CD9C3E] px-5 py-3 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-70"
        }
      >
        {isNotified
          ? "Уведомление отправлено"
          : isPending
            ? "Отправка..."
            : "Уведомить соперника"}
      </button>

      {errorMessage && <p className="mt-3 text-sm font-bold text-[#FCA5A5]">{errorMessage}</p>}
    </div>
  );
}
