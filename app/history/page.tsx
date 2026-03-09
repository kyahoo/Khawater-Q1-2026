"use client";

import { SiteHeader } from "@/components/site-header";

const PAST_SEASONS = [
  {
    seasonName: "SEASON 1",
    winner: "TEAM SPIRIT KZ",
    runnerUp: "CYBER NOMADS",
    thirdPlace: "ALTYN WOLVES",
  },
  {
    seasonName: "SEASON 2",
    winner: "STEPPE TITANS",
    runnerUp: "KHANATE FIVE",
    thirdPlace: "DARK ORBIT",
  },
  {
    seasonName: "SEASON 3",
    winner: "ARAL STORM",
    runnerUp: "NOMAD LEGACY",
    thirdPlace: "EAST FALCONS",
  },
  {
    seasonName: "SEASON 4",
    winner: "GOLDEN HORDE",
    runnerUp: "TENGRI ESPORTS",
    thirdPlace: "CASPIAN RUSH",
  },
  {
    seasonName: "SEASON 5",
    winner: "KHAWATER ELITE",
    runnerUp: "ASTANA PHANTOMS",
    thirdPlace: "SARYARKA CORE",
  },
] as const;

function PodiumPlace({
  rankLabel,
  teamName,
  accentClassName,
  cardClassName,
  icon,
}: {
  rankLabel: string;
  teamName: string;
  accentClassName: string;
  cardClassName: string;
  icon: string;
}) {
  return (
    <div className={`border-[3px] border-[#061726] p-4 shadow-[4px_4px_0px_0px_#061726] ${cardClassName}`}>
      <p className={`text-sm font-black uppercase tracking-[0.2em] ${accentClassName}`}>
        {rankLabel}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-2xl md:text-3xl" aria-hidden="true">
          {icon}
        </span>
        <p className={`font-black uppercase leading-tight ${accentClassName} text-xl md:text-2xl`}>
          {teamName}
        </p>
      </div>
    </div>
  );
}

export default function RulesPage() {
  return (
    <div className="min-h-screen text-white">
      <SiteHeader />

      <main className="min-h-screen px-4 pb-12 pt-24 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="mb-10 text-center text-4xl font-black uppercase text-[#CD9C3E] md:text-6xl">
            ЗАЛ СЛАВЫ
          </h1>

          <div className="space-y-8">
            {PAST_SEASONS.map((season) => (
              <section
                key={season.seasonName}
                className="bg-[#0B3A4A] border-[3px] border-[#061726] p-6 shadow-[6px_6px_0px_0px_#061726] md:p-8"
              >
                <h2 className="text-2xl font-black uppercase tracking-[0.2em] text-[#CD9C3E] md:text-3xl">
                  {season.seasonName}
                </h2>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <PodiumPlace
                    rankLabel="1 МЕСТО"
                    teamName={season.winner}
                    accentClassName="text-[#CD9C3E]"
                    cardClassName="bg-[#061726]"
                    icon="🏆"
                  />
                  <PodiumPlace
                    rankLabel="2 МЕСТО"
                    teamName={season.runnerUp}
                    accentClassName="text-gray-200"
                    cardClassName="bg-[#0A2D39]"
                    icon="🥈"
                  />
                  <PodiumPlace
                    rankLabel="3 МЕСТО"
                    teamName={season.thirdPlace}
                    accentClassName="text-[#C47A3A]"
                    cardClassName="bg-[#102A33]"
                    icon="🥉"
                  />
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
