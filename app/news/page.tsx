import { Suspense } from "react";
import type { Metadata } from "next";
import { NewsBlock, NewsBlockSkeleton } from "@/components/NewsBlock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Новости | Khawater",
  description: "История объявлений и push-уведомлений для игроков Khawater.",
};

export default function NewsPage() {
  return (
    <div className="min-h-screen bg-[#0B3A4A] text-white">
      <main className="mx-auto max-w-6xl px-4 pb-14 pt-24 md:px-6 md:pb-16">
        <section className="border-[4px] border-[#CD9C3E] bg-[#0B3A4A] px-6 py-7 shadow-[8px_8px_0px_0px_#061726] md:px-8 md:py-9">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-[#CD9C3E]">
            Публичный архив
          </p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-white md:text-6xl">
            НОВОСТИ
          </h1>
          <p className="mt-4 max-w-3xl text-sm font-medium leading-6 text-white/85 md:text-base">
            Здесь хранится история push-уведомлений и объявлений для игроков
            Khawater. Каждый выпуск показывает заголовок, текст сообщения и
            точное время отправки.
          </p>
        </section>

        <div className="mt-8">
          <Suspense fallback={<NewsBlockSkeleton />}>
            <NewsBlock />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
