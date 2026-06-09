"use client";

import {
  ArrowClockwise,
  ChartLineUp,
  CheckCircle,
  Eye,
  Lightning,
  PaperPlaneTilt,
  WarningCircle,
} from "@phosphor-icons/react";
import { FormEvent, useMemo, useState } from "react";

type ApiPost = {
  id: string;
  text: string;
  date: string | null;
  views: number | null;
  reactions: number | null;
  url: string | null;
};

type ApiResult = {
  channel: {
    input: string;
    handle: string;
    url: string;
    title: string | null;
    description: string | null;
    subscribers: number | null;
  };
  analysisMode: string;
  metrics: {
    postCount: number;
    averageViews: number | null;
    maxViews: number | null;
    totalViews: number | null;
    averageReactions: number | null;
    postsWithReactions: number;
    postsPerWeek: number | null;
    dateRange: { from: string | null; to: string | null };
  };
  topPosts: ApiPost[];
  recentPosts: ApiPost[];
  analysis: string;
  limitations: string[];
};

type ApiError = {
  error: string;
  details?: string;
};

const formatNumber = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "нет данных";
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
};

const formatDate = (value: string | null) => {
  if (!value) return "дата неизвестна";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const previewText = (text: string) => {
  if (!text.trim()) return "Пост без текстового описания";
  return text.length > 190 ? `${text.slice(0, 190).trim()}...` : text;
};

function LoadingState() {
  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[1.75rem] border border-zinc-200/80 bg-white/72 p-6 shadow-[0_24px_80px_-48px_rgba(20,40,32,0.42)]">
        <div className="mb-5 flex items-center gap-3 text-sm font-medium text-zinc-600">
          <ArrowClockwise className="h-5 w-5 animate-spin text-[var(--accent)]" weight="bold" />
          Apify собирает последние посты
        </div>
        <div className="space-y-3">
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-zinc-200" />
          <div className="h-4 w-5/6 animate-pulse rounded-full bg-zinc-200" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-zinc-200" />
        </div>
      </div>
      <div className="rounded-[1.75rem] border border-zinc-200/80 bg-white/72 p-6 shadow-[0_24px_80px_-48px_rgba(20,40,32,0.42)]">
        <div className="mb-5 flex items-center gap-3 text-sm font-medium text-zinc-600">
          <Lightning className="h-5 w-5 text-[var(--accent)]" weight="bold" />
          OpenRouter готовит резюме
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl bg-zinc-200/80" />
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="min-w-0 overflow-hidden rounded-[2rem] border border-dashed border-zinc-300 bg-white/54 p-8">
      <div className="max-w-2xl min-w-0">
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[var(--accent)]">
          <ChartLineUp className="h-6 w-6" weight="bold" />
        </div>
        <h2 className="break-words text-2xl font-semibold tracking-tight text-zinc-950">
          Введите публичный Telegram-канал
        </h2>
        <p className="mt-3 max-w-[62ch] text-base leading-7 text-zinc-600">
          Сервис возьмет последние публикации через Apify, посчитает базовые метрики и вернет короткую интерпретацию через OpenRouter.
        </p>
      </div>
    </section>
  );
}

function ErrorState({ error }: { error: ApiError }) {
  return (
    <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-red-950">
      <div className="flex items-start gap-3">
        <WarningCircle className="mt-0.5 h-6 w-6 flex-none" weight="bold" />
        <div>
          <h2 className="font-semibold">Не удалось выполнить анализ</h2>
          <p className="mt-2 text-sm leading-6 text-red-800">{error.error}</p>
          {error.details ? <p className="mt-2 text-xs leading-5 text-red-700">{error.details}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ResultView({ result }: { result: ApiResult }) {
  const metricCards = [
    { label: "Постов", value: formatNumber(result.metrics.postCount), icon: PaperPlaneTilt },
    { label: "Средние views", value: formatNumber(result.metrics.averageViews), icon: Eye },
    { label: "Макс. views", value: formatNumber(result.metrics.maxViews), icon: ChartLineUp },
    {
      label: "Реакции",
      value:
        result.metrics.postsWithReactions > 0
          ? formatNumber(result.metrics.averageReactions)
          : "нет данных",
      icon: CheckCircle,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="rounded-[1.35rem] border border-zinc-200/80 bg-white/76 p-5 shadow-[0_18px_50px_-36px_rgba(20,40,32,0.45)]"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-500">{metric.label}</p>
                <Icon className="h-5 w-5 text-[var(--accent)]" weight="bold" />
              </div>
              <p className="font-mono text-2xl font-semibold tracking-tight text-zinc-950">{metric.value}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className="rounded-[2rem] border border-zinc-200/80 bg-white/82 p-6 shadow-[0_24px_80px_-48px_rgba(20,40,32,0.42)]">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Аналитика
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            {result.channel.title || `@${result.channel.handle}`}
          </h2>
          <p className="mt-2 text-sm font-medium text-zinc-500">{result.analysisMode}</p>
          <div className="mt-5 whitespace-pre-wrap text-base leading-7 text-zinc-700">{result.analysis}</div>
          {result.limitations.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-800">Ограничения данных</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-zinc-600">
                {result.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>

        <article className="rounded-[2rem] border border-zinc-200/80 bg-white/82 p-6 shadow-[0_24px_80px_-48px_rgba(20,40,32,0.42)]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                Последние посты
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                @{result.channel.handle}
              </h2>
            </div>
            <a
              href={result.channel.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              Открыть канал
            </a>
          </div>

          <div className="divide-y divide-zinc-200/80">
            {result.recentPosts.slice(0, 6).map((post) => (
              <div key={post.id} className="py-4 first:pt-0 last:pb-0">
                <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-zinc-500">
                  <span>{formatDate(post.date)}</span>
                  <span>{formatNumber(post.views)} views</span>
                  <span>{post.reactions == null ? "реакции: нет данных" : `${formatNumber(post.reactions)} реакций`}</span>
                </div>
                <p className="text-sm leading-6 text-zinc-700">{previewText(post.text)}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {result.topPosts.length > 0 ? (
        <section className="rounded-[2rem] border border-zinc-200/80 bg-white/76 p-6">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950">Топ постов по просмотрам</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {result.topPosts.map((post) => (
              <div key={post.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="font-mono text-sm font-semibold text-zinc-950">{formatNumber(post.views)} views</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{previewText(post.text)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function Analyzer() {
  const [channel, setChannel] = useState("t.me/let_me_be_your_psy");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = useMemo(() => channel.trim().length > 0 && !isLoading, [channel, isLoading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const payload = (await response.json()) as ApiResult | ApiError;

      if (!response.ok) {
        setError(payload as ApiError);
        return;
      }

      setResult(payload as ApiResult);
    } catch (requestError) {
      setError({
        error: "Локальный запрос не дошел до API route.",
        details: requestError instanceof Error ? requestError.message : "Неизвестная ошибка сети.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] min-w-0">
        <header className="grid gap-8 border-b border-zinc-200/80 pb-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(320px,0.54fr)] lg:items-end">
          <div className="min-w-0">
            <p className="mb-4 font-mono text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
              Apify + OpenRouter
            </p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-none tracking-tight text-zinc-950 md:text-6xl">
              TG Analytics from ionko
            </h1>
            <p className="mt-5 max-w-[66ch] text-base leading-7 text-zinc-600">
              Локальный сервис для быстрой оценки публичного Telegram-канала: последние посты, просмотры, частота публикаций и краткое резюме на русском.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="min-w-0 rounded-[2rem] border border-zinc-200/80 bg-white/82 p-5 shadow-[0_24px_80px_-48px_rgba(20,40,32,0.48)]"
          >
            <label htmlFor="channel" className="block text-sm font-semibold text-zinc-900">
              Telegram-канал
            </label>
            <p className="mt-1 text-sm text-zinc-500">URL, @username или username.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                id="channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                placeholder="t.me/let_me_be_your_psy"
                className="min-h-12 w-full min-w-0 rounded-2xl border border-zinc-200 bg-white px-4 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-emerald-900/10"
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 font-semibold text-white transition hover:bg-[var(--accent-dark)] active:translate-y-[1px] disabled:cursor-not-allowed disabled:bg-zinc-300 sm:w-auto"
              >
                {isLoading ? (
                  <ArrowClockwise className="h-5 w-5 animate-spin" weight="bold" />
                ) : (
                  <PaperPlaneTilt className="h-5 w-5" weight="bold" />
                )}
                Анализ
              </button>
            </div>
          </form>
        </header>

        <div className="mt-8">
          {isLoading ? <LoadingState /> : null}
          {!isLoading && error ? <ErrorState error={error} /> : null}
          {!isLoading && !error && result ? <ResultView result={result} /> : null}
          {!isLoading && !error && !result ? <EmptyState /> : null}
        </div>
      </div>
    </main>
  );
}
