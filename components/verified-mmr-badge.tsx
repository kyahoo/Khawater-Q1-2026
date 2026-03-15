"use client";

import { useEffect, useRef, useState } from "react";

type VerifiedMMRBadgeProps = {
  mmr: number | null;
  isVerified: boolean;
};

export function VerifiedMMRBadge({
  mmr,
  isVerified,
}: VerifiedMMRBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (containerRef.current?.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (mmr === null) {
    return null;
  }

  const badgeContent = (
    <span
      className={`inline-flex items-center border-2 px-2 py-0.5 text-[10px] font-black uppercase leading-none tracking-[0.14em] ${
        isVerified
          ? "border-green-400 text-white/90 transition-colors hover:border-green-300"
          : "border-white/25 text-white/75"
      }`}
      title={isVerified ? "MMR аккаунта подтвержден" : "MMR аккаунта ожидает подтверждения"}
    >
      <span className="inline-flex items-center gap-1">
        <span>[ MMR: {mmr}</span>
        {isVerified ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-[14px] w-[14px] text-green-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5 6.5 11.5 12.5 5.5" />
          </svg>
        ) : null}
        <span>]</span>
      </span>
    </span>
  );

  if (!isVerified) {
    return <div className="relative z-20 flex items-center">{badgeContent}</div>;
  }

  return (
    <div ref={containerRef} className="relative z-20 flex items-center">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CD9C3E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B3A4A]"
      >
        {badgeContent}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full mt-2 w-56 border-[2px] border-white/15 bg-[#061726]/95 px-3 py-2 text-[10px] font-black uppercase leading-relaxed tracking-[0.12em] text-white/90 shadow-[0_12px_32px_rgba(6,23,38,0.5)] backdrop-blur-md">
          MMR подтвержден администратором
        </div>
      ) : null}
    </div>
  );
}
