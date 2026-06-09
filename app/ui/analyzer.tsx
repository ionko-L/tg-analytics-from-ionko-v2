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
      <div className="border border-[var(--hairline)] bg-[var(--surface-soft)] p-6">
        <div className="mb-5 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.15em] text-[var(--body-strong)]">
          <ArrowClockwise className="h-5 w-5 animate-spin text-white" weight="bold" />
          Apify собирает последние посты
        </div>
        <div className="space-y-3">
          <div className="h-3 w-3/4 animate-pulse bg-[var(--surface-elevated)]" />
          <div className="h-3 w-5/6 animate-pulse bg-[var(--surface-elevated)]" />
          <div className="h-3 w-2/3 animate-pulse bg-[var(--surface-elevated)]" />
        </div>
      </div>
      <div className="border border-[var(--hairline)] bg-[var(--surface-soft)] p-6">
        <div className="mb-5 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.15em] text-[var(--body-strong)]">
          <Lightning className="h-5 w-5 text-white" weight="bold" />
          OpenRouter готовит резюме
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse bg-[var(--surface-card)]" />
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="min-w-0 overflow-hidden border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] p-8">
      <div className="max-w-2xl min-w-0">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-card)] text-white">
          <ChartLineUp className="h-6 w-6" weight="bold" />
        </div>
        <h2 className="break-words text-2xl font-bold uppercase tracking-normal text-white">
          Введите публичный Telegram-канал
        </h2>
        <p className="mt-3 max-w-[62ch] text-base font-light leading-7 text-[var(--body)]">
          Сервис возьмет последние публикации через Apify, посчитает базовые метрики и вернет короткую интерпретацию через OpenRouter.
        </p>
      </div>
    </section>
  );
}

function ErrorState({ error }: { error: ApiError }) {
  return (
    <section className="border border-[var(--m-red)] bg-[rgba(226,39,24,0.1)] p-6 text-white">
      <div className="flex items-start gap-3">
        <WarningCircle className="mt-0.5 h-6 w-6 flex-none" weight="bold" />
        <div>
          <h2 className="font-bold uppercase tracking-[0.12em]">Не удалось выполнить анализ</h2>
          <p className="mt-2 text-sm font-light leading-6 text-[var(--body-strong)]">{error.error}</p>
          {error.details ? <p className="mt-2 text-xs leading-5 text-[var(--body)]">{error.details}</p> : null}
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
              className="border border-[var(--hairline)] bg-[var(--surface-soft)] p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--muted)]">{metric.label}</p>
                <Icon className="h-5 w-5 text-white" weight="bold" />
              </div>
              <p className="font-mono text-3xl font-bold tracking-normal text-white">{metric.value}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className="border border-[var(--hairline)] bg-[var(--surface-soft)] p-6">
          <div className="m-stripe mb-6 w-32" />
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-[var(--body)]">
            Аналитика
          </p>
          <h2 className="text-2xl font-bold uppercase tracking-normal text-white">
            {result.channel.title || `@${result.channel.handle}`}
          </h2>
          <p className="mt-2 text-sm font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{result.analysisMode}</p>
          <div className="mt-5 whitespace-pre-wrap text-base font-light leading-7 text-[var(--body-strong)]">{result.analysis}</div>
          {result.limitations.length > 0 ? (
            <div className="mt-6 border border-[var(--hairline)] bg-black p-4">
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-white">Ограничения данных</p>
              <ul className="mt-2 space-y-1 text-sm font-light leading-6 text-[var(--body)]">
                {result.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>

        <article className="border border-[var(--hairline)] bg-[var(--surface-soft)] p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--body)]">
                Последние посты
              </p>
              <h2 className="mt-2 text-2xl font-bold uppercase tracking-normal text-white">
                @{result.channel.handle}
              </h2>
            </div>
            <a
              href={result.channel.url}
              target="_blank"
              rel="noreferrer"
              className="border border-white px-4 py-3 text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:bg-white hover:text-black"
            >
              Открыть канал
            </a>
          </div>

          <div className="divide-y divide-[var(--hairline)]">
            {result.recentPosts.slice(0, 6).map((post) => (
              <div key={post.id} className="py-4 first:pt-0 last:pb-0">
                <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                  <span>{formatDate(post.date)}</span>
                  <span>{formatNumber(post.views)} views</span>
                  <span>{post.reactions == null ? "реакции: нет данных" : `${formatNumber(post.reactions)} реакций`}</span>
                </div>
                <p className="text-sm font-light leading-6 text-[var(--body)]">{previewText(post.text)}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {result.topPosts.length > 0 ? (
        <section className="border border-[var(--hairline)] bg-[var(--surface-soft)] p-6">
          <h2 className="text-xl font-bold uppercase tracking-normal text-white">Топ постов по просмотрам</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {result.topPosts.map((post) => (
              <div key={post.id} className="border border-[var(--hairline)] bg-black p-4">
                <p className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-white">{formatNumber(post.views)} views</p>
                <p className="mt-2 text-sm font-light leading-6 text-[var(--body)]">{previewText(post.text)}</p>
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
    <main className="min-h-[100dvh] bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1400px] min-w-0 overflow-hidden">
        <nav className="mb-8 flex min-h-16 w-full items-center justify-between border-b border-[var(--hairline)] pb-4">
          <div className="flex items-center gap-4">
            <div className="m-stripe h-10 w-3" />
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-[var(--muted)]">Version 02</p>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-white">TG Analytics</p>
            </div>
          </div>
          <p className="hidden text-sm font-bold uppercase tracking-[0.15em] text-[var(--body)] sm:block">
            Apify / OpenRouter
          </p>
        </nav>

        <header className="grid w-full grid-cols-1 gap-8 border-b border-[var(--hairline)] pb-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.5fr)] lg:items-stretch">
          <div className="w-full min-w-0">
            <p className="mb-4 break-words font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--body)] sm:text-sm sm:tracking-[0.24em]">
              Telegram channel intelligence
            </p>
            <h1 className="max-w-full break-words text-4xl font-bold uppercase leading-none tracking-normal text-white sm:max-w-4xl sm:text-5xl md:text-7xl">
              TG Analytics from ionko
            </h1>
            <p className="mt-6 w-full max-w-[31ch] break-words text-base font-light leading-7 text-[var(--body-strong)] sm:max-w-[66ch] sm:text-lg sm:leading-8">
              Техническая панель для быстрой оценки публичного Telegram-канала: период, просмотры, частота публикаций и краткое резюме на русском.
            </p>
            <div className="mt-8 grid w-full max-w-full border border-[var(--hairline)] md:max-w-3xl md:grid-cols-3">
              {["30 дней", "fallback 10", "DeepSeek"].map((item) => (
                <div key={item} className="border-b border-[var(--hairline)] p-4 md:border-b-0 md:border-r md:last:border-r-0">
                  <p className="font-mono text-sm font-bold uppercase tracking-[0.1em] text-white sm:tracking-[0.15em]">{item}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">режим анализа</p>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="carbon-field relative min-w-0 overflow-hidden border border-[var(--hairline)] p-6"
          >
            <div className="track-line" />
            <label htmlFor="channel" className="relative block text-sm font-bold uppercase tracking-[0.15em] text-white">
              Telegram-канал
            </label>
            <p className="relative mt-2 text-sm font-light text-[var(--body)]">URL, @username или username.</p>
            <div className="relative mt-5 grid gap-3">
              <input
                id="channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                placeholder="t.me/let_me_be_your_psy"
                className="min-h-12 w-full min-w-0 border border-[var(--hairline)] bg-black px-4 text-base font-light text-white outline-none transition placeholder:text-[var(--muted)] focus:border-white"
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 border border-white bg-transparent px-5 text-sm font-bold uppercase tracking-[0.1em] text-white transition hover:bg-white hover:text-black active:translate-y-[1px] disabled:cursor-not-allowed disabled:border-[var(--hairline)] disabled:text-[var(--muted)] sm:tracking-[0.15em]"
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
