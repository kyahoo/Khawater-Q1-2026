"use client";

import { useEffect, useState } from "react";
import { sendTestNotification } from "@/app/notifications/actions";

export function PushTestButton() {
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 2500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  async function handleSendTestNotification() {
    setIsSubmitting(true);
    setErrorMessage("");
    setToastMessage("Отправка...");

    try {
      const result = await sendTestNotification();

      if (result.error) {
        throw new Error(result.error);
      }

      setToastMessage("Отправка...");
    } catch (error) {
      setToastMessage("");
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось отправить тестовое уведомление."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative w-fit">
      <button
        type="button"
        onClick={() => void handleSendTestNotification()}
        disabled={isSubmitting}
        className="border-2 border-blue-500 bg-transparent px-4 py-2 font-bold uppercase text-blue-500 transition-colors hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "ОТПРАВКА..." : "ТЕСТ УВЕДОМЛЕНИЙ"}
      </button>

      {errorMessage && <p className="mt-2 text-sm font-medium text-red-500">{errorMessage}</p>}

      {toastMessage && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-3 w-56 border-2 border-blue-500 bg-[#0B3A4A] px-4 py-3 text-sm font-bold text-blue-400 shadow-[4px_4px_0px_0px_#000]">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
