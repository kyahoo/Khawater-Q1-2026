"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markUserNotificationAsRead } from "@/app/notifications/actions";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationsInboxClientProps = {
  initialNotifications: NotificationItem[];
};

function formatNotificationDate(dateInput: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateInput));
}

export function NotificationsInboxClient({
  initialNotifications,
}: NotificationsInboxClientProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleNotificationClick(notification: NotificationItem) {
    setErrorMessage("");

    startTransition(async () => {
      const result = await markUserNotificationAsRead(notification.id);

      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                isRead: true,
              }
            : item
        )
      );

      if (notification.linkUrl) {
        router.push(notification.linkUrl);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {errorMessage && <p className="text-sm font-bold text-[#FCA5A5]">{errorMessage}</p>}

      {notifications.length === 0 ? (
        <div className="border-[4px] border-[#061726] bg-[#0B3A4A] p-6 shadow-[6px_6px_0px_0px_#061726]">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/75">
            Уведомлений пока нет.
          </p>
        </div>
      ) : (
        notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => handleNotificationClick(notification)}
            disabled={isPending}
            className={`block w-full text-left border-[4px] p-5 shadow-[6px_6px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726] disabled:translate-y-0 disabled:opacity-70 ${
              notification.isRead
                ? "border-[#061726] bg-[#0B3A4A]"
                : "border-[#CD9C3E] bg-[#123C4D]"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 inline-flex h-3 w-3 rounded-full border-2 ${
                    notification.isRead
                      ? "border-white/25 bg-transparent"
                      : "border-[#CD9C3E] bg-[#CD9C3E]"
                  }`}
                />
                <div>
                  <p className="text-lg font-black uppercase text-white">
                    {notification.title}
                  </p>
                  <p
                    className={`mt-3 text-sm leading-7 ${
                      notification.isRead ? "text-white/65" : "text-white/90"
                    }`}
                  >
                    {notification.body}
                  </p>
                </div>
              </div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#CD9C3E]">
                {formatNotificationDate(notification.createdAt)}
              </p>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
