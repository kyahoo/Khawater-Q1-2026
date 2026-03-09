"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/notifications/actions";
import {
  pushNotificationsSupported,
  registerPushServiceWorker,
  urlBase64ToUint8Array,
} from "@/lib/utils/push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function PushToggleButton() {
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  async function handleEnablePush() {
    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (!("Notification" in window)) {
        throw new Error("Уведомления не поддерживаются в этом браузере.");
      }

      if (!pushNotificationsSupported()) {
        throw new Error("Push-уведомления не поддерживаются на этом устройстве.");
      }

      if (!VAPID_PUBLIC_KEY) {
        throw new Error("Публичный VAPID-ключ не настроен.");
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        throw new Error("Разрешение на уведомления не выдано.");
      }

      await registerPushServiceWorker();
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const nextSubscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const result = await savePushSubscription(nextSubscription.toJSON());

      if (result.error) {
        throw new Error(result.error);
      }

      setSuccessMessage("Push-подписка успешно сохранена.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось включить push-уведомления."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative w-fit">
      <button
        type="button"
        onClick={() => void handleEnablePush()}
        disabled={isSubmitting}
        className="border-2 border-[#CD9C3E] bg-[#0B3A4A] px-4 py-2 font-bold uppercase text-[#CD9C3E] transition-colors hover:bg-[#CD9C3E]/10 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "ПОДКЛЮЧЕНИЕ..." : "ВКЛЮЧИТЬ PUSH"}
      </button>

      {errorMessage && <p className="mt-2 text-sm font-medium text-red-500">{errorMessage}</p>}

      {successMessage && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-3 w-72 border-2 border-green-500 bg-[#0B3A4A] px-4 py-3 text-sm font-bold text-green-400 shadow-[4px_4px_0px_0px_#000]">
          {successMessage}
        </div>
      )}
    </div>
  );
}
