"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { listActiveTasksForUser, type ActiveTask } from "@/lib/supabase/tasks";

const almatyDateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Almaty",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function formatScheduledAt(scheduledAt: string | null) {
  if (!scheduledAt) {
    return "Время будет объявлено позже";
  }

  return almatyDateTimeFormatter.format(new Date(scheduledAt));
}

const urgentActionBadgeClassName =
  "absolute -right-2 -top-2 h-4 w-4 rounded-full border-2 border-[#7F1D1D] bg-[#DC2626]";

function StatePanel({
  tone,
  children,
}: {
  tone: "default" | "danger" | "success";
  children: ReactNode;
}) {
  if (tone === "success") {
    return (
      <div className="border-[3px] border-[#061726] bg-[#123C4D] p-5 text-sm font-black uppercase tracking-[0.14em] text-[#D9F99D] shadow-[6px_6px_0px_0px_#061726]">
        {children}
      </div>
    );
  }

  return (
    <div
      className={`border-[3px] p-5 text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_0px_#061726] ${
        tone === "danger"
          ? "border-red-700 bg-[#061726] text-red-300"
          : "border-[#061726] bg-[#0B3A4A] text-gray-200"
      }`}
    >
      {children}
    </div>
  );
}

function TaskCard({ task }: { task: ActiveTask }) {
  return (
    <article className="border-[3px] border-[#061726] bg-[#0B3A4A] p-5 shadow-[6px_6px_0px_0px_#061726] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#CD9C3E]">
            {task.label}
          </p>
          <h2 className="mt-2 text-2xl font-black uppercase text-white">
            {task.title}
          </h2>
          <p className="mt-3 text-sm font-black uppercase tracking-[0.16em] text-[#CD9C3E]">
            {task.teamAName} VS {task.teamBName}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">
            {task.description}
          </p>
        </div>

        <div className="w-fit border-[3px] border-[#061726] bg-[#061726] px-4 py-3 shadow-[4px_4px_0px_0px_#CD9C3E]">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#CD9C3E]">
            {task.roundLabel}
          </p>
          <p className="mt-2 text-sm font-black uppercase text-white">
            {task.format}
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-white/70">
            {formatScheduledAt(task.scheduledAt)}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <Link
          href={task.href}
          className="relative inline-flex overflow-visible border-[3px] border-[#061726] bg-[#CD9C3E] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#061726] shadow-[4px_4px_0px_0px_#061726] transition-all hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#061726]"
        >
          {task.requiresImmediateAction ? (
            <>
              <span aria-hidden="true" className={urgentActionBadgeClassName} />
              <span className="sr-only">Требуется срочное действие</span>
            </>
          ) : null}
          {task.actionLabel}
        </Link>
      </div>
    </article>
  );
}

export function TasksClient() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadTasks = async () => {
      let isRedirecting = false;

      try {
        setErrorMessage("");

        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          isRedirecting = true;
          router.replace("/auth");
          return;
        }

        const nextTasks = await listActiveTasksForUser(user.id);
        setTasks(nextTasks);
      } catch {
        setErrorMessage("Не удалось загрузить активные задачи.");
      } finally {
        if (!isRedirecting) {
          setIsLoading(false);
        }
      }
    };

    void loadTasks();
  }, [router]);

  if (isLoading) {
    return <StatePanel tone="default">Загрузка активных задач...</StatePanel>;
  }

  if (errorMessage) {
    return <StatePanel tone="danger">{errorMessage}</StatePanel>;
  }

  if (tasks.length === 0) {
    return (
      <StatePanel tone="success">
        У вас нет активных задач. Вы готовы к игре!
      </StatePanel>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
