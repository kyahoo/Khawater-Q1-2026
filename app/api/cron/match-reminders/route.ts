import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendNotificationToUsers } from "@/lib/notifications/push";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderField = "reminder_1h_sent" | "reminder_30m_sent";
type AdminClient = SupabaseClient<Database>;

type ReminderMatchRow = Pick<
  Database["public"]["Tables"]["tournament_matches"]["Row"],
  "id" | "team_a_id" | "team_b_id" | "scheduled_at"
> & {
  reminder_1h_sent: boolean;
  reminder_30m_sent: boolean;
};

async function getUserIdsForMatchTeams(
  adminClient: AdminClient,
  teamIds: string[]
) {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));

  if (uniqueTeamIds.length === 0) {
    return [] as string[];
  }

  const { data: memberships, error: membershipsError } = await adminClient
    .from("team_members")
    .select("user_id")
    .in("team_id", uniqueTeamIds);

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const userIds = Array.from(
    new Set((memberships ?? []).map((membership) => membership.user_id))
  );

  return userIds;
}

async function sendReminderBatch(params: {
  adminClient: AdminClient;
  matches: ReminderMatchRow[];
  title: string;
  body: string;
}) {
  let notificationsSent = 0;
  let expiredSubscriptionsDeleted = 0;
  let inboxNotificationsCreated = 0;

  for (const match of params.matches) {
    const userIds = await getUserIdsForMatchTeams(params.adminClient, [
      match.team_a_id,
      match.team_b_id,
    ]);
    const sendResult = await sendNotificationToUsers({
      adminClient: params.adminClient,
      userIds,
      payload: {
        title: params.title,
        body: params.body,
        linkUrl: `/matches/${match.id}`,
      },
    });

    notificationsSent += sendResult.notificationsSent;
    expiredSubscriptionsDeleted += sendResult.expiredSubscriptionsDeleted;
    inboxNotificationsCreated += sendResult.inboxNotificationsCreated;
  }

  return {
    notificationsSent,
    expiredSubscriptionsDeleted,
    inboxNotificationsCreated,
  };
}

const GRACE_PERIOD_MINUTES = 10;

async function processReminderWindow(params: {
  adminClient: AdminClient;
  reminderField: ReminderField;
  minutesAhead: number;
  minutesNoCloserThan?: number;
  title: string;
  body: string;
}) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + params.minutesAhead * 60 * 1000);
  const windowStart =
    params.minutesNoCloserThan != null
      ? new Date(now.getTime() + params.minutesNoCloserThan * 60 * 1000)
      : new Date(now.getTime() - GRACE_PERIOD_MINUTES * 60 * 1000);

  const { data: matches, error: matchesError } = await params.adminClient
    .from("tournament_matches")
    .select(
      "id, team_a_id, team_b_id, scheduled_at, reminder_1h_sent, reminder_30m_sent"
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", windowStart.toISOString())
    .lte("scheduled_at", windowEnd.toISOString())
    .eq(params.reminderField, false);

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const reminderMatches = (matches ?? []) as ReminderMatchRow[];

  if (reminderMatches.length === 0) {
    return {
      processedMatches: 0,
      notificationsSent: 0,
      expiredSubscriptionsDeleted: 0,
      inboxNotificationsCreated: 0,
    };
  }

  const sendResult = await sendReminderBatch({
    adminClient: params.adminClient,
    matches: reminderMatches,
    title: params.title,
    body: params.body,
  });

  const { error: updateError } = await params.adminClient
    .from("tournament_matches")
    .update({
      [params.reminderField]: true,
    })
    .in(
      "id",
      reminderMatches.map((match) => match.id)
    );

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    processedMatches: reminderMatches.length,
    notificationsSent: sendResult.notificationsSent,
    expiredSubscriptionsDeleted: sendResult.expiredSubscriptionsDeleted,
    inboxNotificationsCreated: sendResult.inboxNotificationsCreated,
  };
}

function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      adminClient: null,
      error: "Missing server environment configuration.",
    };
  }

  // Cron requests do not carry user cookies, so every match/subscription query
  // must use the service-role client to bypass RLS safely.
  return {
    adminClient: createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    error: null,
  };
}

export async function GET(request: NextRequest) {
  const expectedAuthorization = `Bearer ${process.env.CRON_SECRET}`;
  const authorization = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authorization !== expectedAuthorization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { adminClient, error: adminClientError } = createAdminSupabaseClient();

  if (!adminClient || adminClientError) {
    return NextResponse.json(
      { error: adminClientError ?? "Missing server environment configuration." },
      { status: 500 }
    );
  }

  try {
    const oneHourResult = await processReminderWindow({
      adminClient,
      reminderField: "reminder_1h_sent",
      minutesAhead: 60,
      minutesNoCloserThan: 30,
      title: "МАТЧ ЧЕРЕЗ 1 ЧАС!",
      body: "Собирайте команду, игра скоро начнется.",
    });

    const thirtyMinuteResult = await processReminderWindow({
      adminClient,
      reminderField: "reminder_30m_sent",
      minutesAhead: 30,
      title: "МАТЧ ЧЕРЕЗ 30 МИНУТ!",
      body: "Всем быть в Discord. Готовьтесь к лобби.",
    });

    return NextResponse.json({
      ok: true,
      oneHour: oneHourResult,
      thirtyMinutes: thirtyMinuteResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process match reminders.",
      },
      { status: 500 }
    );
  }
}
