"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { sendNotificationToUsers } from "@/lib/notifications/push";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SavePushSubscriptionResult = {
  error: string | null;
};

type SendTestNotificationResult = {
  error: string | null;
};

type MarkUserNotificationAsReadResult = {
  error: string | null;
};

function isValidPushSubscription(
  subscription: unknown
): subscription is { endpoint: string } & Record<string, Json | undefined> {
  return (
    typeof subscription === "object" &&
    subscription !== null &&
    "endpoint" in subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.trim().length > 0
  );
}

export async function savePushSubscription(
  subscription: any
): Promise<SavePushSubscriptionResult> {
  try {
    if (!isValidPushSubscription(subscription)) {
      return {
        error: "Некорректная push-подписка.",
      };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        error: "Missing Supabase server environment configuration.",
      };
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error: userError?.message ?? "Could not verify the current user session.",
      };
    }

    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const normalizedSubscription = JSON.parse(JSON.stringify(subscription)) as Json;

    const { error } = await adminClient.from("push_subscriptions").insert({
      user_id: user.id,
      subscription: normalizedSubscription,
    });

    if (error) {
      if ("code" in error && error.code === "23505") {
        return {
          error: null,
        };
      }

      return {
        error: error.message,
      };
    }

    revalidatePath("/profile");

    return {
      error: null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось сохранить push-подписку.",
    };
  }
}

export async function sendTestNotification(): Promise<SendTestNotificationResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        error: "Push-уведомления не настроены на сервере.",
      };
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error: userError?.message ?? "Could not verify the current user session.",
      };
    }

    const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: subscriptions, error: subscriptionsError } = await adminClient
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("user_id", user.id);

    if (subscriptionsError) {
      return {
        error: subscriptionsError.message,
      };
    }

    if (!subscriptions || subscriptions.length === 0) {
      return {
        error: "Сначала подключите push-уведомления.",
      };
    }

    await sendNotificationToUsers({
      adminClient,
      userIds: [user.id],
      payload: {
        title: "KHAWATER СИСТЕМА",
        body: "Уведомления успешно подключены! Тест пройден.",
        linkUrl: "/notifications",
      },
    });

    revalidatePath("/profile");
    revalidatePath("/notifications");

    return {
      error: null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось отправить тестовое уведомление.",
    };
  }
}

export async function markUserNotificationAsRead(
  notificationId: string
): Promise<MarkUserNotificationAsReadResult> {
  const trimmedNotificationId = notificationId.trim();

  if (!trimmedNotificationId) {
    return {
      error: "Уведомление обязательно.",
    };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error: userError?.message ?? "Could not verify the current user session.",
      };
    }

    const { error } = await supabase
      .from("user_notifications")
      .update({
        is_read: true,
      })
      .eq("id", trimmedNotificationId)
      .eq("user_id", user.id);

    if (error) {
      return {
        error: error.message,
      };
    }

    revalidatePath("/notifications");

    return {
      error: null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Не удалось обновить уведомление.",
    };
  }
}
