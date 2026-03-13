"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { claimDefaultWin } from "@/app/matches/actions";

type ForfeitClaimButtonProps = {
  matchId: string;
  claimingTeamId: string;
  opponentTeamId: string;
  isMatchFinished: boolean;
  isForfeit: boolean;
  isDisabled?: boolean;
  disabledLabel?: string;
};

export function ForfeitClaimButton({
  matchId,
  claimingTeamId,
  opponentTeamId,
  isMatchFinished,
  isForfeit,
  isDisabled: isDisabledByPolicy = false,
  disabledLabel,
}: ForfeitClaimButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useMemo(
    () => ({
      error: (message: string) => setToastMessage(message),
    }),
    []
  );

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const isDisabled =
    isSubmitting || isForfeit || isMatchFinished || isDisabledByPolicy;

  async function handleConfirm() {
    if (isDisabled) {
      return;
    }

    const normalizedMatchId = matchId.trim();
    const normalizedClaimingTeamId = claimingTeamId.trim();
    const normalizedOpponentTeamId = opponentTeamId.trim();

    if (!normalizedMatchId || !normalizedClaimingTeamId || !normalizedOpponentTeamId) {
      const message = "Не удалось определить данные матча для технической победы.";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    const result = await claimDefaultWin(
      normalizedMatchId,
      normalizedClaimingTeamId,
      normalizedOpponentTeamId
    );

    if (result.error) {
      setErrorMessage(result.error);
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }

    setIsOpen(false);
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <>
      {toastMessage && (
        <div className="fixed right-4 top-4 z-[60] max-w-sm border-[3px] border-[#7F1D1D] bg-[#450A0A] px-4 py-3 text-sm font-black text-[#FCA5A5] shadow-[6px_6px_0px_0px_#061726]">
          {toastMessage}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isDisabled}
        className="border-[3px] border-[#7F1D1D] bg-[#450A0A] px-5 py-3 text-sm font-black uppercase text-[#FCA5A5] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:bg-[#5F1010] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isForfeit || isMatchFinished
          ? "Тех. победа недоступна"
          : isSubmitting
            ? "ОБРАБОТКА..."
            : isDisabledByPolicy
              ? disabledLabel ?? "Тех. победа недоступна"
            : "Запросить тех. победу"}
      </button>

      {errorMessage && <p className="mt-3 text-sm font-bold text-[#FCA5A5]">{errorMessage}</p>}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-2xl border-[4px] border-[#7F1D1D] bg-[#0B3A4A] p-6 shadow-[8px_8px_0px_0px_#000]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#FCA5A5]">
              Подтверждение
            </p>
            <h3 className="mt-2 text-2xl font-black uppercase text-white">
              Запросить тех. победу
            </h3>
            <p className="mt-4 text-sm font-bold leading-7 text-white/90">
              Вы уверены? Это необратимое действие. Матч будет завершен, вашей
              команде будет присуждена победа, а соперник получит техническое
              поражение и штраф к порядочности (Behavior Score).
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="border-[3px] border-[#CD9C3E] bg-[#0B3A4A] px-5 py-3 text-sm font-black uppercase text-[#CD9C3E] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={isSubmitting}
                className="border-[3px] border-[#7F1D1D] bg-[#450A0A] px-5 py-3 text-sm font-black uppercase text-[#FCA5A5] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:bg-[#5F1010] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-60"
              >
                {isSubmitting ? "Подтверждение..." : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
