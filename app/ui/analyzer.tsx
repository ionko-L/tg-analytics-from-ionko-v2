"use client";

import {
  ArrowClockwise,
  ChartLineUp,
  CheckCircle,
  Eye,
  Lightning,
  LockKey,
  PaperPlaneTilt,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthPanel, type AccountSnapshot, type AuthMode } from "./auth-panel";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

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
  billing: {
    charged: boolean;
    alreadyUnlocked: boolean;
    creditsRemaining: number;
    creditsTotal: number;
  };
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readAccountSnapshot(
  supabase: ReturnType<typeof createSupabaseClient>,
  user: User,
): Promise<AccountSnapshot | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("user_accounts")
      .select("id, email, credits_remaining, credits_total")
      .eq("id", user.id)
      .single();

    if (data) {
      return {
        id: data.id,
        email: data.email || user.email || "",
        creditsRemaining: data.credits_remaining,
        creditsTotal: data.credits_total,
      };
    }

    if (!error || error.code !== "PGRST116") {
      break;
    }

    await wait(250 * (attempt + 1));
  }

  return null;
}

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
    <section className="intro-panel min-w-0 p-5 sm:p-6">
      <div className="max-w-2xl">
        <div>
          <h2 className="break-words text-lg font-light uppercase tracking-[0.12em] text-white sm:text-xl">
            Введите публичный Telegram-канал
          </h2>
          <div className="mt-3 max-w-[60ch] text-sm font-light leading-6 text-[var(--body)] sm:text-base sm:leading-7">
            <p>Сервис анализирует последние 30 дней канала и показывает:</p>
            <ul className="mt-3 space-y-1">
              {["темы", "активность", "просмотры", "краткое резюме"].map((item, index) => (
                <li key={item} className="flex items-center gap-3 leading-6">
                  <span className="twinkle-star" style={{ animationDelay: `${index * 0.28}s` }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-[var(--muted)]">
              После входа ты получаешь 7 кредитов на уникальные каналы. Повторный анализ того же канала бесплатный.
            </p>
          </div>
        </div>
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
      <section className="billing-panel flex flex-col gap-3 border border-white/12 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Кредиты</p>
          <p className="mt-2 text-sm font-light leading-6 text-[var(--body-strong)]">
            {result.billing.charged
              ? "Новый канал зафиксирован. За этот анализ списан 1 кредит."
              : "Этот канал уже был открыт ранее. Кредит за повторный анализ не списан."}
          </p>
        </div>
        <div className="credit-badge">
          <span className="credit-badge__label">Осталось</span>
          <span className="credit-badge__value">
            {result.billing.creditsRemaining} / {result.billing.creditsTotal}
          </span>
        </div>
      </section>

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
  const [supabase] = useState(() => (hasSupabaseEnv ? createSupabaseClient() : null));
  const [channel, setChannel] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-up");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(
    "Регистрация встроена в экран. После входа ты сразу получаешь 7 кредитов.",
  );
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const authPanelRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = useMemo(() => channel.trim().length > 0 && !isLoading, [channel, isLoading]);

  useEffect(() => {
    if (!supabase) {
      setAuthHint("Чтобы включить регистрацию локально, добавь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в .env.local.");
      return;
    }

    let isMounted = true;

    const syncUser = async (user: User | null) => {
      if (!isMounted) return;

      if (!user) {
        setAccount(null);
        return;
      }

      const snapshot = await readAccountSnapshot(supabase, user);
      if (!isMounted) return;

      if (snapshot) {
        setAccount(snapshot);
        setAuthError(null);
        setAuthHint("Повторный анализ уже открытого канала остается бесплатным.");
      } else {
        setAuthError("Аккаунт создан, но профиль еще не успел инициализироваться. Обнови страницу через пару секунд.");
      }
    };

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await syncUser(user);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleAuthSubmit() {
    if (!supabase) {
      setAuthError("Supabase еще не подключен в .env.local. Нужны публичный URL и publishable key.");
      return;
    }

    if (authLoading) return;

    const email = authEmail.trim();
    const password = authPassword;

    if (!email || !password) {
      setAuthError("Нужны и email, и пароль.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Пароль должен быть не короче 6 символов.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setAuthHint(null);

    try {
      if (authMode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (signInError) {
            throw new Error(
              "Регистрация прошла, но автоматический вход не удался. Возможно, в Supabase все еще включено подтверждение email.",
            );
          }
        }

        setAuthHint("Аккаунт готов. Вход выполнен автоматически.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }

        setAuthHint("Сессия восстановлена. Можно запускать анализ.");
      }

      setAuthPassword("");
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : "Не удалось выполнить вход.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;

    setAuthLoading(true);
    setAuthError(null);

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setAuthError(signOutError.message);
      setAuthLoading(false);
      return;
    }

    setAccount(null);
    setResult(null);
    setError(null);
    setAuthHint("Сессия закрыта. Для нового анализа нужно снова войти.");
    setAuthLoading(false);
  }

  function nudgeAuthBlock(message: string) {
    setAuthError(null);
    setAuthHint(message);
    authPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    if (!account) {
      nudgeAuthBlock("Чтобы запустить анализ, войди или зарегистрируйся в блоке выше.");
      return;
    }

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
        const apiError = payload as ApiError;

        if (response.status === 401) {
          setAccount(null);
          nudgeAuthBlock(apiError.error);
          return;
        }

        if (response.status === 402) {
          setAccount((current) =>
            current
              ? {
                  ...current,
                  creditsRemaining: 0,
                }
              : current,
          );
        }

        setError(apiError);
        return;
      }

      const nextResult = payload as ApiResult;
      setResult(nextResult);
      setAccount((current) =>
        current
          ? {
              ...current,
              creditsRemaining: nextResult.billing.creditsRemaining,
              creditsTotal: nextResult.billing.creditsTotal,
            }
          : current,
      );
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
    <main className="bmw-ambient min-h-[100dvh] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1400px] min-w-0 overflow-hidden">
        <nav className="mb-8 flex min-h-16 w-full items-center justify-between border-b border-[var(--hairline)] pb-4">
          <div className="flex items-center gap-4">
            <div className="m-stripe h-10 w-3" />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-white">TG Analytics</p>
            </div>
          </div>
        </nav>

        <header className="grid w-full grid-cols-1 gap-6 border-b border-[var(--hairline)] pb-10 lg:max-w-4xl">
          <div className="brand-panel w-full min-w-0 p-6 sm:p-8">
            <h1 className="future-display max-w-full break-words text-4xl uppercase leading-none tracking-normal text-white sm:text-5xl md:text-7xl">
              <span className="block">TG Analytics</span>
              <span className="logo-signature-line normal-case">
                <span className="signature-from">from</span>
                <span className="ink-signature inline-block text-[1.1em]">Ionko</span>
              </span>
            </h1>
          </div>

          <div ref={authPanelRef}>
            <AuthPanel
              authMode={authMode}
              authEmail={authEmail}
              authPassword={authPassword}
              authLoading={authLoading}
              authError={authError}
              authHint={authHint}
              account={account}
              onModeChange={setAuthMode}
              onEmailChange={setAuthEmail}
              onPasswordChange={setAuthPassword}
              onSubmit={() => {
                void handleAuthSubmit();
              }}
              onSignOut={() => {
                void handleSignOut();
              }}
            />
          </div>

          <EmptyState />

          <form
            onSubmit={handleSubmit}
            className="carbon-field animated-border relative w-full min-w-0 max-w-2xl overflow-hidden border border-white/70 p-6"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <label htmlFor="channel" className="relative block text-sm font-bold uppercase tracking-[0.15em] text-white">
                  Telegram-канал
                </label>
                <p className="mt-2 text-sm font-light leading-6 text-[var(--body)]">
                  Анализ последних 30 дней. Повтор канала кредит не списывает.
                </p>
              </div>
              {account ? (
                <div className="credit-badge credit-badge--compact">
                  <span className="credit-badge__label">Баланс</span>
                  <span className="credit-badge__value">
                    {account.creditsRemaining} / {account.creditsTotal}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 border border-white/12 px-3 py-2 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
                  <LockKey className="h-4 w-4" weight="bold" />
                  Нужен вход
                </div>
              )}
            </div>

            <div className="relative mt-5 grid gap-3">
              <div className="input-shell">
                <input
                  id="channel"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                  placeholder="Введите Telegram-канал"
                  className="min-h-12 w-full min-w-0 border border-white/80 bg-black/70 px-4 text-base font-light text-white outline-none transition placeholder:text-[var(--muted)] focus:border-white focus:bg-black"
                />
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="m-action-button inline-flex min-h-12 w-full items-center justify-center gap-2 border px-5 text-sm font-bold uppercase tracking-[0.1em] text-white transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:border-[var(--hairline)] disabled:text-[var(--muted)] sm:tracking-[0.15em]"
              >
                {isLoading ? (
                  <ArrowClockwise className="h-5 w-5 animate-spin" weight="bold" />
                ) : (
                  <PaperPlaneTilt className="h-5 w-5" weight="bold" />
                )}
                Анализ
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-light text-[var(--body)]">
              <span className="inline-flex items-center gap-2">
                <Sparkle className="h-4 w-4 text-white" weight="fill" />
                Новый канал списывает кредит только после успешного анализа.
              </span>
            </div>
          </form>
        </header>

        <div className="mt-8">
          {isLoading ? <LoadingState /> : null}
          {!isLoading && error ? <ErrorState error={error} /> : null}
          {!isLoading && !error && result ? <ResultView result={result} /> : null}
        </div>
      </div>
    </main>
  );
}
