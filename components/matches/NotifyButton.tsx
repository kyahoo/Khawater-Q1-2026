"use client";

import { useEffect, useState } from "react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsNotified(initialIsNotified);
  }, [initialIsNotified]);

  async function handleNotifyOpponent() {
    if (isNotified || isSubmitting) {
      return;
    }

    const normalizedMatchId = matchId.trim();
    const normalizedCurrentTeamId = currentTeamId.trim();

    if (!normalizedMatchId) {
      setErrorMessage("Матч не найден.");
      return;
    }

    if (!normalizedCurrentTeamId) {
      setErrorMessage("Не удалось определить текущую команду.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    const result = await notifyOpponentLobbyReady(
      normalizedMatchId,
      normalizedCurrentTeamId
    );

    if (result.error) {
      setErrorMessage(result.error);
      setIsSubmitting(false);
      return;
    }

    setIsNotified(true);
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void handleNotifyOpponent()}
        disabled={isNotified || isSubmitting}
        className={
          isNotified
            ? "border-[3px] border-[#061726] bg-gray-700 px-5 py-3 text-sm font-black uppercase text-gray-300 shadow-[4px_4px_0px_0px_#061726] opacity-90"
            : "border-[3px] border-[#061726] bg-[#CD9C3E] px-5 py-3 text-sm font-black uppercase text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-70"
        }
      >
        {isNotified
          ? "Уведомление отправлено"
          : isSubmitting
            ? "Отправка..."
            : "Уведомить соперника"}
      </button>

      {errorMessage && <p className="mt-3 text-sm font-bold text-[#FCA5A5]">{errorMessage}</p>}
    </div>
  );
}
