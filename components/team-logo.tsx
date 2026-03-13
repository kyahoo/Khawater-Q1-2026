"use client";

import Image from "next/image";

type TeamLogoProps = {
  teamName: string;
  logoUrl?: string | null;
  sizeClassName?: string;
  textClassName?: string;
};

export function TeamLogo({
  teamName,
  logoUrl,
  sizeClassName = "h-12 w-12",
  textClassName = "text-xl",
}: TeamLogoProps) {
  const placeholderLetter = teamName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden ${logoUrl ? "border-none bg-transparent outline-none" : "border-2 border-[#061726] bg-[#061726]"} ${sizeClassName}`}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={`Логотип команды ${teamName}`}
          width={48}
          height={48}
          className="aspect-square h-full w-full border-none object-cover outline-none"
        />
      ) : (
        <span
          className={`font-black uppercase text-[#CD9C3E] ${textClassName}`}
          aria-hidden="true"
        >
          {placeholderLetter}
        </span>
      )}
    </div>
  );
}
