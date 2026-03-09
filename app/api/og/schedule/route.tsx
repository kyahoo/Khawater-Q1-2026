import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Schedule banner";
export const contentType = "image/png";
export const size = {
  width: 1080,
  height: 1440,
};

const ALMATY_TIME_ZONE = "Asia/Almaty";
const GOLD = "#CD9C3E";
const NAVY = "#061726";
const TEAL = "#0B3A4A";
const TITLE = "РАСПИСАНИЕ МАТЧЕЙ";
const EMPTY_STATE = "НЕТ ЗАПЛАНИРОВАННЫХ МАТЧЕЙ";

type DayParam = "today" | "tomorrow";
type MatchRow = Database["public"]["Tables"]["tournament_matches"]["Row"];
type TeamRow = Pick<Database["public"]["Tables"]["teams"]["Row"], "id" | "name">;

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment configuration.");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getTimeZoneParts(date: Date, timeZone: string): TimeZoneParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "0"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0"),
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
    second: Number(parts.find((part) => part.type === "second")?.value ?? "0"),
  };
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(params: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeZone: string;
}) {
  const utcGuess = Date.UTC(
    params.year,
    params.month - 1,
    params.day,
    params.hour,
    params.minute,
    params.second
  );
  const firstPass =
    utcGuess - getTimeZoneOffsetMilliseconds(new Date(utcGuess), params.timeZone);
  const finalTimestamp =
    utcGuess -
    getTimeZoneOffsetMilliseconds(new Date(firstPass), params.timeZone);

  return new Date(finalTimestamp);
}

function getTargetDateParts(day: DayParam) {
  const dayOffset = day === "tomorrow" ? 1 : 0;
  const nowInAlmaty = getTimeZoneParts(new Date(), ALMATY_TIME_ZONE);
  const date = new Date(
    Date.UTC(nowInAlmaty.year, nowInAlmaty.month - 1, nowInAlmaty.day + dayOffset, 12)
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getDayRange(day: DayParam) {
  const target = getTargetDateParts(day);

  return {
    target,
    start: zonedDateTimeToUtc({
      ...target,
      hour: 0,
      minute: 0,
      second: 0,
      timeZone: ALMATY_TIME_ZONE,
    }),
    end: zonedDateTimeToUtc({
      ...target,
      hour: 23,
      minute: 59,
      second: 59,
      timeZone: ALMATY_TIME_ZONE,
    }),
  };
}

function formatRussianDate(parts: { year: number; month: number; day: number }) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  })
    .format(date)
    .toUpperCase();
}

function formatMatchTime(dateString: string | null) {
  if (!dateString) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ALMATY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(dateString));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedDay = searchParams.get("day");

    if (requestedDay !== "today" && requestedDay !== "tomorrow") {
      return Response.json(
        {
          error: "Параметр day должен быть today или tomorrow.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase = getAdminClient();
    const { target, start, end } = getDayRange(requestedDay);

    const { data: activeTournament, error: activeTournamentError } = await supabase
      .from("tournaments")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeTournamentError) {
      throw new Error(activeTournamentError.message);
    }

    if (!activeTournament) {
      return Response.json(
        {
          error: "Активный турнир не найден.",
        },
        {
          status: 404,
        }
      );
    }

    const [{ data: backgroundData }, { data: matches, error: matchesError }] =
      await Promise.all([
        supabase.storage.from("social-templates").createSignedUrl("schedule-bg.png", 60),
        supabase
          .from("tournament_matches")
          .select(
            "id, tournament_id, team_a_id, team_b_id, round_label, scheduled_at, status, team_a_score, team_b_score, display_order, format, created_at, lobby_name, lobby_password"
          )
          .eq("tournament_id", activeTournament.id)
          .gte("scheduled_at", start.toISOString())
          .lte("scheduled_at", end.toISOString())
          .order("scheduled_at", { ascending: true })
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (matchesError) {
      throw new Error(matchesError.message);
    }

    const typedMatches = ((matches ?? []) as MatchRow[]).filter(
      (match): match is MatchRow & { scheduled_at: string } => Boolean(match.scheduled_at)
    );
    const teamIds = Array.from(
      new Set(typedMatches.flatMap((match) => [match.team_a_id, match.team_b_id]))
    );
    const { data: teams, error: teamsError } =
      teamIds.length === 0
        ? { data: [] satisfies TeamRow[], error: null }
        : await supabase.from("teams").select("id, name").in("id", teamIds);

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    const teamNameById = new Map(
      ((teams ?? []) as TeamRow[]).map((team) => [team.id, team.name] as const)
    );
    const visibleMatches = typedMatches.slice(0, 8).map((match) => ({
      id: match.id,
      teamAName: teamNameById.get(match.team_a_id) ?? "Команда А",
      teamBName: teamNameById.get(match.team_b_id) ?? "Команда Б",
      timeLabel: formatMatchTime(match.scheduled_at),
    }));

    return new ImageResponse(
      (
        <div
          tw="relative flex h-full w-full"
          style={{
            backgroundColor: TEAL,
          }}
        >
          {backgroundData?.signedUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={backgroundData.signedUrl}
                alt=""
                tw="absolute inset-0 h-full w-full"
                style={{
                  objectFit: "cover",
                }}
              />
              <div
                tw="absolute inset-0 flex"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(6, 23, 38, 0.18) 0%, rgba(6, 23, 38, 0.58) 100%)",
                }}
              />
            </>
          ) : null}

          <div
            tw="relative flex h-full w-full flex-col px-16 pt-16 pb-14"
            style={{
              gap: 28,
            }}
          >
            <div tw="flex w-full flex-col items-center justify-center">
              <div
                tw="flex items-center justify-center border-4 px-10 py-5"
                style={{
                  borderColor: NAVY,
                  backgroundColor: "rgba(6, 23, 38, 0.88)",
                  boxShadow: `12px 12px 0 ${NAVY}`,
                }}
              >
                <span
                  style={{
                    color: GOLD,
                    fontSize: 60,
                    fontWeight: 900,
                    letterSpacing: 4,
                    textAlign: "center",
                  }}
                >
                  {TITLE}
                </span>
              </div>

              <span
                style={{
                  marginTop: 18,
                  color: "#FFFFFF",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: 2,
                  textAlign: "center",
                }}
              >
                {formatRussianDate(target)}
              </span>
            </div>

            {visibleMatches.length === 0 ? (
              <div
                tw="flex flex-1 items-center justify-center border-4 px-12 py-10"
                style={{
                  borderColor: NAVY,
                  backgroundColor: "rgba(11, 58, 74, 0.92)",
                  boxShadow: `12px 12px 0 ${NAVY}`,
                }}
              >
                <span
                  style={{
                    color: "#FFFFFF",
                    fontSize: 42,
                    fontWeight: 900,
                    letterSpacing: 2,
                    textAlign: "center",
                  }}
                >
                  {EMPTY_STATE}
                </span>
              </div>
            ) : (
              <div
                tw="flex flex-1 flex-col"
                style={{
                  gap: 18,
                }}
              >
                {visibleMatches.map((match) => (
                  <div
                    key={match.id}
                    tw="flex items-center justify-between border-[3px] px-8 py-6"
                    style={{
                      minHeight: 120,
                      borderColor: NAVY,
                      backgroundColor: TEAL,
                      boxShadow: `8px 8px 0 ${NAVY}`,
                    }}
                  >
                    <div
                      tw="flex flex-1 items-center justify-start"
                      style={{
                        paddingRight: 20,
                      }}
                    >
                      <span
                        style={{
                          color: "#FFFFFF",
                          fontSize: 28,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {match.teamAName}
                      </span>
                    </div>

                    <div
                      tw="flex items-center justify-center"
                      style={{
                        width: 180,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          color: GOLD,
                          fontSize: 32,
                          fontWeight: 900,
                          letterSpacing: 1,
                          textAlign: "center",
                        }}
                      >
                        {match.timeLabel}
                      </span>
                    </div>

                    <div
                      tw="flex flex-1 items-center justify-end"
                      style={{
                        paddingLeft: 20,
                      }}
                    >
                      <span
                        style={{
                          color: "#FFFFFF",
                          fontSize: 28,
                          fontWeight: 800,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {match.teamBName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
      size
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось сгенерировать расписание.",
      },
      {
        status: 500,
      }
    );
  }
}
