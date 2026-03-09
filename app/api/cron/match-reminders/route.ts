import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderField = "reminder_1h_sent" | "reminder_30m_sent";

type ReminderMatchRow = Pick<
  Database["public"]["Tables"]["tournament_matches"]["Row"],
  "id" | "team_a_id" | "team_b_id" | "scheduled_at"
> & {
  reminder_1h_sent: boolean;
  reminder_30m_sent: boolean;
};

type PushSubscriptionRow = Pick<
  Database["public"]["Tables"]["push_subscriptions"]["Row"],
  "id" | "subscription"
>;

function getWebPushStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return null;
}

async function getSubscriptionsForMatchTeams(
  adminClient: ReturnType<typeof createClient<Database>>,
  teamIds: string[]
) {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));

  if (uniqueTeamIds.length === 0) {
    return [] as PushSubscriptionRow[];
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

  if (userIds.length === 0) {
    return [] as PushSubscriptionRow[];
  }

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("push_subscriptions")
    .select("id, subscription")
    .in("user_id", userIds);

  if (subscriptionsError) {
    throw new Error(subscriptionsError.message);
  }

  return (subscriptions ?? []) as PushSubscriptionRow[];
}

async function sendReminderBatch(params: {
  adminClient: ReturnType<typeof createClient<Database>>;
  matches: ReminderMatchRow[];
  title: string;
  body: string;
}) {
  let notificationsSent = 0;
  let expiredSubscriptionsDeleted = 0;

  for (const match of params.matches) {
    const subscriptions = await getSubscriptionsForMatchTeams(params.adminClient, [
      match.team_a_id,
      match.team_b_id,
    ]);

    for (const subscriptionRow of subscriptions) {
      try {
        await webpush.sendNotification(
          (subscriptionRow.subscription as unknown) as webpush.PushSubscription,
          JSON.stringify({
            title: params.title,
            body: params.body,
          })
        );
        notificationsSent += 1;
      } catch (error) {
        if (getWebPushStatusCode(error) === 410) {
          const { error: deleteError } = await params.adminClient
            .from("push_subscriptions")
            .delete()
            .eq("id", subscriptionRow.id);

          if (deleteError) {
            throw new Error(deleteError.message);
          }

          expiredSubscriptionsDeleted += 1;
          continue;
        }

        throw new Error(
          error instanceof Error ? error.message : "Failed to send push notification."
        );
      }
    }
  }

  return {
    notificationsSent,
    expiredSubscriptionsDeleted,
  };
}

async function processReminderWindow(params: {
  adminClient: ReturnType<typeof createClient<Database>>;
  reminderField: ReminderField;
  minutesAhead: number;
  title: string;
  body: string;
}) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + params.minutesAhead * 60 * 1000);

  const { data: matches, error: matchesError } = await params.adminClient
    .from("tournament_matches")
    .select(
      "id, team_a_id, team_b_id, scheduled_at, reminder_1h_sent, reminder_30m_sent"
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", now.toISOString())
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
  };
}

export async function GET(request: NextRequest) {
  const expectedAuthorization = `Bearer ${process.env.CRON_SECRET}`;
  const authorization = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authorization !== expectedAuthorization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      { error: "Missing server environment configuration." },
      { status: 500 }
    );
  }

  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  webpush.setVapidDetails(
    "mailto:admin@airbafresh.com",
    vapidPublicKey,
    vapidPrivateKey
  );

  try {
    const oneHourResult = await processReminderWindow({
      adminClient,
      reminderField: "reminder_1h_sent",
      minutesAhead: 65,
      title: "МАТЧ ЧЕРЕЗ 1 ЧАС!",
      body: "Собирайте команду, игра скоро начнется.",
    });

    const thirtyMinuteResult = await processReminderWindow({
      adminClient,
      reminderField: "reminder_30m_sent",
      minutesAhead: 35,
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
