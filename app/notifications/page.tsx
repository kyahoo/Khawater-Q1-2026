import { Suspense } from "react";
import { redirect } from "next/navigation";
import { NotificationsInboxClient } from "@/components/notifications/NotificationsInboxClient";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

function NotificationsInboxSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={`notifications-skeleton-${index}`}
          className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726] animate-pulse"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="h-6 w-40 border-2 border-[#061726] bg-[#123C4D]" />
              <div className="mt-4 h-4 w-full max-w-2xl border-2 border-[#061726] bg-[#123C4D]" />
              <div className="mt-3 h-4 w-3/4 border-2 border-[#061726] bg-[#123C4D]" />
            </div>
            <div className="h-4 w-28 border-2 border-[#061726] bg-[#123C4D]" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function NotificationsInboxSection() {
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

  const initialNotifications: NotificationItem[] = (notifications ?? []).map(
    (notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      linkUrl: notification.link_url,
      isRead: notification.is_read,
      createdAt: notification.created_at,
    })
  );

  return <NotificationsInboxClient initialNotifications={initialNotifications} />;
}

export default function NotificationsPage() {
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

        <Suspense fallback={<NotificationsInboxSkeleton />}>
          <NotificationsInboxSection />
        </Suspense>
      </main>
    </div>
  );
}
