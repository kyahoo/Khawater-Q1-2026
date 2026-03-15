"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  getPlayerMedalTitle,
  PLAYER_MEDAL_META,
  type PlayerMedalValue,
  type PlayerMedalWithTournament,
} from "@/lib/supabase/player-medals";

const MEDAL_DISPLAY_ORDER: PlayerMedalValue[] = ["gold", "silver", "bronze"];

type PlayerMedalsProps = {
  medals: PlayerMedalWithTournament[];
  className?: string;
};

export function PlayerMedals({
  medals,
  className,
}: PlayerMedalsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeMedalType, setActiveMedalType] = useState<PlayerMedalValue | null>(
    null
  );
  const modalTitleId = useId();

  function closeModal() {
    setIsModalOpen(false);
    setActiveMedalType(null);
  }

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModalOpen(false);
        setActiveMedalType(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  if (medals.length === 0) {
    return null;
  }

  const medalsByType = medals.reduce(
    (accumulator, medal) => {
      accumulator[medal.medal] = [...(accumulator[medal.medal] ?? []), medal];
      return accumulator;
    },
    {} as Partial<Record<PlayerMedalValue, PlayerMedalWithTournament[]>>
  );

  const activeMedals = activeMedalType ? (medalsByType[activeMedalType] ?? []) : [];

  const rootClassName = className
    ? `flex items-center gap-3 ${className}`
    : "flex items-center gap-3";

  return (
    <>
      <div className={rootClassName}>
        {MEDAL_DISPLAY_ORDER.map((medalType) => {
          const medalsForType = medalsByType[medalType] ?? [];
          const count = medalsForType.length;

          if (count === 0) {
            return null;
          }

          return (
            <button
              key={medalType}
              type="button"
              title={medalsForType.map((medal) => getPlayerMedalTitle(medal)).join("\n")}
              aria-label={`Показать историю ${PLAYER_MEDAL_META[medalType].label}`}
              onClick={() => {
                setActiveMedalType(medalType);
                setIsModalOpen(true);
              }}
              className="relative inline-flex items-center justify-center transition-transform hover:-translate-y-0.5"
            >
              <span className="text-lg leading-none">
                {PLAYER_MEDAL_META[medalType].icon}
              </span>
              {count > 1 ? (
                <span className="absolute -top-2 -right-2 flex h-[14px] min-w-[14px] items-center justify-center border border-gray-500 bg-gray-900 px-1 text-[8px] font-bold leading-tight text-white">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {isModalOpen && activeMedalType
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
              onClick={closeModal}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={modalTitleId}
                className="w-full max-sm:max-h-[80vh] max-sm:overflow-y-auto max-sm:rounded-t-2xl sm:max-w-md border-[4px] border-[#061726] bg-[#F4EED7] p-5 text-black shadow-[0_-4px_24px_rgba(0,0,0,0.3)] sm:shadow-[8px_8px_0px_0px_#061726]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0B3A4A]">
                      История медалей
                    </p>
                    <h3
                      id={modalTitleId}
                      className="mt-1 text-xl font-black uppercase text-[#061726]"
                    >
                      {PLAYER_MEDAL_META[activeMedalType].icon}{" "}
                      {PLAYER_MEDAL_META[activeMedalType].label}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="border-[3px] border-[#061726] bg-[#0B3A4A] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#F4EED7] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
                  >
                    ✕ ЗАКРЫТЬ
                  </button>
                </div>
                <div className="space-y-2">
                  {activeMedals.map((medal) => (
                    <div
                      key={medal.id}
                      className="flex items-center gap-2 border border-black bg-gray-50 px-2 py-1 text-xs font-bold text-black"
                    >
                      <span title={getPlayerMedalTitle(medal)}>
                        {PLAYER_MEDAL_META[medal.medal].icon}
                      </span>
                      <span>{medal.tournamentName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
