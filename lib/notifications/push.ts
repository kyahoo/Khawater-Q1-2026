import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "@/lib/supabase/database.types";

type NotificationPayload = {
  title: string;
  body: string;
  linkUrl?: string | null;
};

type PushSubscriptionRow = Pick<
  Database["public"]["Tables"]["push_subscriptions"]["Row"],
  "id" | "user_id" | "subscription"
>;

export function configureWebPush() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error("Push-уведомления не настроены на сервере.");
  }

  webpush.setVapidDetails(
    "mailto:admin@airbafresh.com",
    vapidPublicKey,
    vapidPrivateKey
  );
}

export function getWebPushStatusCode(error: unknown) {
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

function buildNotificationPayload(payload: NotificationPayload) {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    data: payload.linkUrl
      ? {
          url: payload.linkUrl,
        }
      : undefined,
  });
}

export async function sendNotificationToUsers(params: {
  adminClient: SupabaseClient<Database>;
  userIds: string[];
  payload: NotificationPayload;
}) {
  const uniqueUserIds = Array.from(
    new Set(params.userIds.map((userId) => userId.trim()).filter(Boolean))
  );

  if (uniqueUserIds.length === 0) {
    return {
      notificationsSent: 0,
      expiredSubscriptionsDeleted: 0,
      inboxNotificationsCreated: 0,
    };
  }

  let pushConfigured = false;

  try {
    configureWebPush();
    pushConfigured = true;
  } catch (error) {
    console.error(
      "[push] VAPID configuration failed — inbox records will be created but Web Push is disabled for this invocation:",
      error instanceof Error ? error.message : error
    );
  }

  const { error: inboxInsertError } = await params.adminClient
    .from("user_notifications")
    .insert(
      uniqueUserIds.map((userId) => ({
        user_id: userId,
        title: params.payload.title,
        body: params.payload.body,
        link_url: params.payload.linkUrl ?? null,
      }))
    );

  if (inboxInsertError) {
    console.error("[push] Failed to insert inbox notifications:", inboxInsertError.message);
    throw new Error(inboxInsertError.message);
  }

  console.log(
    `[push] Created ${uniqueUserIds.length} inbox notification(s) for "${params.payload.title}"`
  );

  if (!pushConfigured) {
    return {
      notificationsSent: 0,
      expiredSubscriptionsDeleted: 0,
      inboxNotificationsCreated: uniqueUserIds.length,
    };
  }

  const { data: subscriptions, error: subscriptionsError } = await params.adminClient
    .from("push_subscriptions")
    .select("id, user_id, subscription")
    .in("user_id", uniqueUserIds);

  if (subscriptionsError) {
    console.error("[push] Failed to fetch push subscriptions:", subscriptionsError.message);
    throw new Error(subscriptionsError.message);
  }

  const subscriptionRows = (subscriptions ?? []) as PushSubscriptionRow[];

  if (subscriptionRows.length === 0) {
    console.log(
      `[push] No push subscriptions found for ${uniqueUserIds.length} user(s) — skipping Web Push delivery`
    );
    return {
      notificationsSent: 0,
      expiredSubscriptionsDeleted: 0,
      inboxNotificationsCreated: uniqueUserIds.length,
    };
  }

  console.log(
    `[push] Found ${subscriptionRows.length} push subscription(s) — sending Web Push`
  );

  let notificationsSent = 0;
  let expiredSubscriptionsDeleted = 0;
  let pushErrors = 0;

  for (const subscriptionRow of subscriptionRows) {
    try {
      await webpush.sendNotification(
        subscriptionRow.subscription as unknown as webpush.PushSubscription,
        buildNotificationPayload(params.payload)
      );
      notificationsSent += 1;
    } catch (error) {
      const statusCode = getWebPushStatusCode(error);

      if (statusCode === 410) {
        console.log(
          `[push] Subscription ${subscriptionRow.id} expired (410) — deleting`
        );
        const { error: deleteError } = await params.adminClient
          .from("push_subscriptions")
          .delete()
          .eq("id", subscriptionRow.id);

        if (deleteError) {
          console.error(
            `[push] Failed to delete expired subscription ${subscriptionRow.id}:`,
            deleteError.message
          );
        }

        expiredSubscriptionsDeleted += 1;
        continue;
      }

      pushErrors += 1;
      console.error(
        `[push] Failed to deliver to subscription ${subscriptionRow.id} (user ${subscriptionRow.user_id}, status ${statusCode ?? "unknown"}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(
    `[push] Delivery complete: ${notificationsSent} sent, ${expiredSubscriptionsDeleted} expired, ${pushErrors} failed`
  );

  return {
    notificationsSent,
    expiredSubscriptionsDeleted,
    inboxNotificationsCreated: uniqueUserIds.length,
  };
}
