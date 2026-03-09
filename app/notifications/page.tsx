import { redirect } from "next/navigation";
import { NotificationsInboxClient } from "@/components/notifications/NotificationsInboxClient";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: notifications, error } = await supabase
    .from("user_notifications")
    .select("id, title, body, link_url, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="min-h-screen text-white">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 border-[4px] border-[#061726] bg-[#0B3A4A] p-6 shadow-[6px_6px_0px_0px_#061726]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
            Центр уведомлений
          </p>
          <h1 className="mt-2 text-4xl font-black uppercase text-white md:text-5xl">
            УВЕДОМЛЕНИЯ
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/80">
            Все недавние push-уведомления хранятся здесь. Открывайте их в любое
            время и переходите прямо к нужному матчу или разделу.
          </p>
        </div>

        <NotificationsInboxClient
          initialNotifications={(notifications ?? []).map((notification) => ({
            id: notification.id,
            title: notification.title,
            body: notification.body,
            linkUrl: notification.link_url,
            isRead: notification.is_read,
            createdAt: notification.created_at,
          }))}
        />
      </main>
    </div>
  );
}
