"use client";

const champions = [
  {
    tournament: "KHAWATER SEASON 1",
    team: "🏆 ASD",
    roster: "ALMAS1Q, ADLA PRIME, BERSERK, XO, ♡",
  },
  {
    tournament: "KHAWATER SEASON 2",
    team: "🏆 Jackson 5",
    roster: "Ебаш Кудайберген, VG, MAUnster, WW, yoyoy099",
  },
  {
    tournament: "KHAWATER DERBY 1",
    team: "🏆 smeshar1ki^",
    roster: "WinG2Kana, 770, Judar, 神靈, 死在我手上",
  },
  {
    tournament: "KHAWATER SEASON 3",
    team: "🏆 KANA+4",
    roster: "Wing2Kana, molodoy, MAUnster, Sumira, Warrior, Asylstyle",
  },
  {
    tournament: "KHAWATER SEASON 4",
    team: "🏆 Meet Your Makers",
    roster: "Kazakh na Travelakh, Insomnia, T_Razy, ♡, Kaiba",
  },
  {
    tournament: "KHAWATER DERBY 2",
    team: "🏆 Учпучмак на четверке",
    roster: "JereMiah-, DLZ, Bobby Fisher, Dodger, Chawot-",
  },
  {
    tournament: "KHAWATER SEASON 5 (1st Place)",
    team: "🏆 3+2 TEAM",
    roster: "Maunster, Alina, DONI, KON, Dake",
  },
] as const;

export default function HistoryPage() {
  return (
    <div className="min-h-screen text-white">
      <main className="min-h-screen px-4 pb-12 pt-24 md:px-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-center text-4xl font-black uppercase text-[#CD9C3E] [text-shadow:3px_3px_0_#000] md:text-6xl">
            ЗАЛ СЛАВЫ
          </h1>
          <p className="mt-4 text-center text-sm font-black uppercase tracking-[0.28em] text-[#CD9C3E] [text-shadow:3px_3px_0_#000] md:text-base">
            ЧЕМПИОНЫ KHAWATER
          </p>

          <div className="mt-10 space-y-5">
            {champions.map((champion) => (
              <section
                key={`${champion.tournament}-${champion.team}`}
                className="border-2 border-[#CD9C3E] bg-[#0B3A4A] px-5 py-5 shadow-[6px_6px_0px_0px_#061726] md:px-6"
              >
                <p className="text-xs font-black uppercase tracking-[0.24em] text-white/65">
                  {champion.tournament}
                </p>
                <h2 className="mt-3 text-2xl font-black uppercase text-[#CD9C3E] md:text-3xl">
                  {champion.team}
                </h2>
                <p className="mt-4 text-sm font-bold uppercase tracking-[0.08em] text-white md:text-base">
                  {champion.roster}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
