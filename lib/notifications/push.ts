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
    throw new Error(inboxInsertError.message);
  }

  const { data: subscriptions, error: subscriptionsError } = await params.adminClient
    .from("push_subscriptions")
    .select("id, user_id, subscription")
    .in("user_id", uniqueUserIds);

  if (subscriptionsError) {
    throw new Error(subscriptionsError.message);
  }

  configureWebPush();

  let notificationsSent = 0;
  let expiredSubscriptionsDeleted = 0;

  for (const subscriptionRow of (subscriptions ?? []) as PushSubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        (subscriptionRow.subscription as unknown) as webpush.PushSubscription,
        buildNotificationPayload(params.payload)
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

  return {
    notificationsSent,
    expiredSubscriptionsDeleted,
    inboxNotificationsCreated: uniqueUserIds.length,
  };
}
