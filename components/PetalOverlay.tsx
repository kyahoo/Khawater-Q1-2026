"use client";

import { useMemo } from "react";

const PETAL_COUNT = 18;

type PetalStyle = {
  left: string;
  width: string;
  height: string;
  animationDuration: string;
  animationDelay: string;
  opacity: number;
};

export function PetalOverlay() {
  const petals = useMemo<PetalStyle[]>(
    () =>
      Array.from({ length: PETAL_COUNT }, (_, index) => ({
        left: `${Math.random() * 100}%`,
        width: `${10 + Math.random() * 6}px`,
        height: `${10 + Math.random() * 6}px`,
        animationDuration: `${10 + Math.random() * 10}s`,
        animationDelay: `${Math.random() * 12}s`,
        opacity: 0.35 + Math.random() * 0.35,
      })),
    []
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {petals.map((petal, index) => (
        <div
          key={index}
          className="absolute -top-8 rounded-tl-full rounded-br-full bg-pink-300/60 backdrop-blur-sm animate-fall"
          style={petal}
        />
      ))}
    </div>
  );
}
