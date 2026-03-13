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
  if (medals.length === 0) {
    return null;
  }

  const medalCounts = medals.reduce(
    (accumulator, medal) => {
      accumulator[medal.medal] = (accumulator[medal.medal] || 0) + 1;
      return accumulator;
    },
    {} as Record<PlayerMedalValue, number>
  );

  const medalTitles = medals.reduce(
    (accumulator, medal) => {
      accumulator[medal.medal] = [
        ...(accumulator[medal.medal] ?? []),
        getPlayerMedalTitle(medal),
      ];
      return accumulator;
    },
    {} as Partial<Record<PlayerMedalValue, string[]>>
  );

  const rootClassName = className
    ? `flex items-center gap-3 ${className}`
    : "flex items-center gap-3";

  return (
    <div className={rootClassName}>
      {MEDAL_DISPLAY_ORDER.map((medalType) => {
        const count = medalCounts[medalType] ?? 0;

        if (count === 0) {
          return null;
        }

        return (
          <div
            key={medalType}
            title={(medalTitles[medalType] ?? []).join("\n")}
            className="relative inline-flex items-center justify-center"
          >
            <span className="text-lg leading-none">
              {PLAYER_MEDAL_META[medalType].icon}
            </span>
            {count > 1 ? (
              <span className="absolute -top-2 -right-2 flex h-[14px] min-w-[14px] items-center justify-center border border-gray-500 bg-gray-900 px-1 text-[8px] font-bold leading-tight text-white">
                {count}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
