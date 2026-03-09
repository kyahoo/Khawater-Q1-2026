"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SavePushSubscriptionResult = {
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
      error: "Сессия истекла. Войдите в аккаунт заново.",
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
}
