"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SavePushSubscriptionResult = {
  error: string | null;
};

type SendTestNotificationResult = {
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
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

    if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
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

    webpush.setVapidDetails(
      "mailto:admin@airbafresh.com",
      vapidPublicKey,
      vapidPrivateKey
    );

    for (const row of subscriptions) {
      try {
        await webpush.sendNotification(
          (row.subscription as unknown) as webpush.PushSubscription,
          JSON.stringify({
            title: "KHAWATER СИСТЕМА",
            body: "Уведомления успешно подключены! Тест пройден.",
          })
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof error.statusCode === "number"
            ? error.statusCode
            : null;

        if (statusCode === 410) {
          await adminClient.from("push_subscriptions").delete().eq("id", row.id);
          continue;
        }

        return {
          error:
            error instanceof Error
              ? error.message
              : "Не удалось отправить тестовое уведомление.",
        };
      }
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
          : "Не удалось отправить тестовое уведомление.",
    };
  }
}
