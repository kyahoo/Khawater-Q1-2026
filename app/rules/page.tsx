import { SiteHeader } from "@/components/site-header";

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <SiteHeader />

      {/* Top bar */}
      <div className="border-b border-zinc-300 bg-zinc-200 px-6 py-3">
        <div className="mx-auto max-w-6xl text-sm">
          Tournament Rules and Participation Guidelines
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-8 text-3xl font-semibold">Rules</h1>

        <div className="space-y-10 text-sm leading-7 text-zinc-700">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-zinc-900">
              General Participation
            </h2>
            <p>
              All participating teams are expected to register with accurate
              player information and remain reachable throughout the season.
              Teams should keep their roster current and follow all published
              deadlines for confirmation, scheduling, and tournament entry.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-zinc-900">
              Team Eligibility
            </h2>
            <p>
              Each team must meet the roster requirements defined for the
              current season. A player may only belong to one active team at a
              time. Tournament administrators may review roster changes and may
              reject entries that do not comply with season rules.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-zinc-900">
              Match Scheduling
            </h2>
            <p>
              Match times are published through the tournament schedule. Teams
              are expected to be ready before the listed start time. Delays,
              no-shows, or repeated scheduling conflicts may result in warnings,
              default losses, or administrative decisions.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-zinc-900">
              Competitive Conduct
            </h2>
            <p>
              Players and team captains must treat opponents, admins, and event
              staff respectfully. Unsportsmanlike behavior, abuse, cheating, or
              attempts to manipulate results may lead to match penalties or
              removal from the tournament.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-zinc-900">
              Reporting and Decisions
            </h2>
            <p>
              Teams should report match results through the platform workflow
              used for the season. In case of disputes, tournament admins may
              request screenshots, lobby evidence, or additional context before
              issuing a final ruling. Administrative decisions are considered
              final for phase 1.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
