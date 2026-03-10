import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type NewsBlockProps = {
  limit?: number;
};

type NewsNotificationRow = Pick<
  Database["public"]["Tables"]["user_notifications"]["Row"],
  "id" | "title" | "body" | "created_at"
>;

type NewsItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

const DEFAULT_NEWS_LIMIT = 12;
const NEWS_QUERY_MULTIPLIER = 6;
const NEWS_TIME_ZONE = "Asia/Almaty";

function createAdminNewsClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server-side Supabase configuration is missing.");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function toNewsMinuteBucket(createdAt: string) {
  return createdAt.slice(0, 16);
}

function buildNewsItems(rows: NewsNotificationRow[], limit: number) {
  const seen = new Set<string>();
  const items: NewsItem[] = [];

  for (const row of rows) {
    const dedupeKey = `${row.title}\u0000${row.body}\u0000${toNewsMinuteBucket(row.created_at)}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    items.push({
      id: `${row.id}:${toNewsMinuteBucket(row.created_at)}`,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
    });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function formatNewsDate(dateString: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: NEWS_TIME_ZONE,
  }).format(new Date(dateString));
}

async function loadNewsItems(limit: number) {
  try {
    const supabase = createAdminNewsClient();
    const { data, error } = await supabase
      .from("user_notifications")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * NEWS_QUERY_MULTIPLIER, limit));

    if (error) {
      console.error("News block load failed:", error);
      return {
        items: [] as NewsItem[],
        errorMessage: "История уведомлений временно недоступна. Попробуйте открыть раздел позже.",
      };
    }

    return {
      items: buildNewsItems((data ?? []) as NewsNotificationRow[], limit),
      errorMessage: null,
    };
  } catch (error) {
    console.error("News block bootstrap failed:", error);

    return {
      items: [] as NewsItem[],
      errorMessage: "История уведомлений временно недоступна. Попробуйте открыть раздел позже.",
    };
  }
}

function NewsEmptyState({ message }: { message: string }) {
  return (
    <section className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] px-6 py-8 shadow-[8px_8px_0px_0px_#061726]">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#CD9C3E]">
        Архив уведомлений
      </p>
      <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-white/88 md:text-base">
        {message}
      </p>
    </section>
  );
}

export function NewsBlockSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={`news-skeleton-${index}`}
          className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] px-5 py-5 shadow-[8px_8px_0px_0px_#061726] animate-pulse md:px-6"
        >
          <div className="h-2 w-28 bg-[#CD9C3E]" />
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="w-full max-w-3xl">
              <div className="h-4 w-36 border-2 border-[#061726] bg-[#123C4D]" />
              <div className="mt-4 h-10 w-full max-w-xl border-2 border-[#061726] bg-[#123C4D]" />
              <div className="mt-5 h-4 w-full border-2 border-[#061726] bg-[#123C4D]" />
              <div className="mt-3 h-4 w-11/12 border-2 border-[#061726] bg-[#123C4D]" />
              <div className="mt-3 h-4 w-8/12 border-2 border-[#061726] bg-[#123C4D]" />
            </div>
            <div className="h-14 w-44 border-[3px] border-[#CD9C3E] bg-[#061726]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export async function NewsBlock({ limit = DEFAULT_NEWS_LIMIT }: NewsBlockProps) {
  const { items, errorMessage } = await loadNewsItems(limit);

  if (errorMessage) {
    return <NewsEmptyState message={errorMessage} />;
  }

  if (items.length === 0) {
    return (
      <NewsEmptyState message="Пока что здесь пусто. Когда команда Khawater отправит новое объявление или push-уведомление, запись появится в этом архиве." />
    );
  }

  return (
    <section className="space-y-5">
      {items.map((item) => (
        <article
          key={item.id}
          className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] px-5 py-5 shadow-[8px_8px_0px_0px_#061726] md:px-6"
        >
          <div aria-hidden="true" className="h-2 w-28 bg-[#CD9C3E]" />
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#CD9C3E]">
                Архив отправок
              </p>
              <h2 className="mt-3 text-2xl font-black uppercase tracking-tight text-white md:text-3xl">
                {item.title}
              </h2>
              <p className="mt-5 whitespace-pre-line text-sm font-medium leading-6 text-white/88 md:text-base">
                {item.body}
              </p>
            </div>

            <time
              dateTime={item.createdAt}
              className="inline-flex w-fit shrink-0 items-center border-[3px] border-[#CD9C3E] bg-[#061726] px-4 py-3 font-mono text-[11px] font-black tracking-[0.18em] text-[#CD9C3E] md:min-w-52 md:justify-center"
            >
              {formatNewsDate(item.createdAt)}
            </time>
          </div>
        </article>
      ))}
    </section>
  );
}
