// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type AnyRecord = Record<string, unknown>;

type NormalizedPost = {
  id: string;
  text: string;
  date: string | null;
  views: number | null;
  reactions: number | null;
  url: string | null;
};

type ChannelSummary = {
  input: string;
  handle: string;
  url: string;
  title: string | null;
  description: string | null;
  subscribers: number | null;
};

type AccountContext = {
  userId: string;
  email: string;
  creditsRemaining: number;
  creditsTotal: number;
  alreadyUnlocked: boolean;
};

const LOOKBACK_DAYS = 30;
const MIN_POSTS_FOR_ANALYSIS = 10;
const APIFY_FETCH_LIMIT = 100;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBearerToken(authHeader: string | null) {
  if (!authHeader) throw new Error("AUTH_REQUIRED");
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("AUTH_REQUIRED");
  return token;
}

function normalizeTelegramInput(rawInput: unknown) {
  if (typeof rawInput !== "string") {
    throw new Error("Введите Telegram-канал строкой.");
  }

  const value = rawInput.trim();
  if (!value) {
    throw new Error("Введите Telegram-канал.");
  }

  const withoutProtocol = value
    .replace(/^https?:\/\//i, "")
    .replace(/^telegram\.me\//i, "t.me/")
    .replace(/^www\./i, "");

  const withoutDomain = withoutProtocol.replace(/^t\.me\//i, "");
  const withoutAt = withoutDomain.replace(/^@/, "");
  const handle = withoutAt.split(/[/?#]/)[0]?.trim().toLowerCase();

  if (!handle || !/^[a-zA-Z0-9_]{4,64}$/.test(handle)) {
    throw new Error("Неверный формат канала. Используйте t.me/channel, @channel или channel.");
  }

  return {
    input: value,
    handle,
    url: `https://t.me/${handle}`,
  };
}

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : null;
}

function pickString(source: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(source: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickDate(source: AnyRecord, keys: string[]) {
  const rawDate = pickString(source, keys);
  if (!rawDate) return null;

  const timestamp = Date.parse(rawDate);
  return Number.isNaN(timestamp) ? rawDate : new Date(timestamp).toISOString();
}

function countReactions(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => {
      const record = asRecord(item);
      if (!record) return sum;
      return sum + (pickNumber(record, ["count", "total", "value"]) ?? 0);
    }, 0);
    return total > 0 ? total : null;
  }
  if (value && typeof value === "object") {
    const total = Object.values(value as AnyRecord).reduce<number>((sum, item) => {
      if (typeof item === "number" && Number.isFinite(item)) return sum + item;
      if (typeof item === "string") {
        const parsed = Number(item.replace(/[^\d.-]/g, ""));
        return Number.isFinite(parsed) ? sum + parsed : sum;
      }
      const record = asRecord(item);
      return record ? sum + (pickNumber(record, ["count", "total", "value"]) ?? 0) : sum;
    }, 0);
    return total > 0 ? total : null;
  }
  return null;
}

function normalizePost(item: AnyRecord, index: number, channelUrl: string): NormalizedPost {
  const text = pickString(item, ["text", "message", "content", "caption", "description"]) ?? "";
  const date = pickDate(item, ["date", "datetime", "timestamp", "postedAt", "publishedAt", "time"]);
  const views = pickNumber(item, ["views", "viewCount", "viewsCount", "postViews"]);
  const url = pickString(item, ["url", "link", "postUrl"]) ?? null;
  const messageId =
    pickString(item, ["id", "messageId", "postId"]) ??
    (url ? url.split("/").filter(Boolean).at(-1) ?? null : null) ??
    `${index + 1}`;

  return {
    id: String(messageId),
    text,
    date,
    views,
    reactions:
      countReactions(item.reactions) ??
      countReactions(item.reactionCount) ??
      countReactions(item.reactionsCount) ??
      countReactions(item.reactionsSummary),
    url: url ?? `${channelUrl}/${messageId}`,
  };
}

function extractPosts(items: unknown[], channelUrl: string) {
  const seen = new Set<string>();

  return items
    .map((item, index) => {
      const record = asRecord(item);
      return record ? normalizePost(record, index, channelUrl) : null;
    })
    .filter((item): item is NormalizedPost => Boolean(item))
    .filter((post) => post.date || post.text.trim() || (typeof post.views === "number" && post.views > 0))
    .filter((post) => {
      const key = post.url || `${post.id}:${post.date || ""}:${post.text.slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getPostTimestamp(post: NormalizedPost) {
  if (!post.date) return null;
  const timestamp = Date.parse(post.date);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function selectPostsForAnalysis(posts: NormalizedPost[]) {
  const sortedPosts = [...posts].sort((a, b) => {
    const aTimestamp = getPostTimestamp(a) ?? 0;
    const bTimestamp = getPostTimestamp(b) ?? 0;
    return bTimestamp - aTimestamp;
  });
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const postsInPeriod = sortedPosts.filter((post) => {
    const timestamp = getPostTimestamp(post);
    return timestamp != null && timestamp >= cutoff;
  });

  if (postsInPeriod.length >= MIN_POSTS_FOR_ANALYSIS) {
    return {
      posts: postsInPeriod,
      mode: `Последние ${LOOKBACK_DAYS} дней`,
    };
  }

  return {
    posts: sortedPosts.slice(0, MIN_POSTS_FOR_ANALYSIS),
    mode: `Последние ${MIN_POSTS_FOR_ANALYSIS} постов, потому что за ${LOOKBACK_DAYS} дней найдено меньше ${MIN_POSTS_FOR_ANALYSIS}`,
  };
}

function extractChannel(items: unknown[], fallback: ReturnType<typeof normalizeTelegramInput>): ChannelSummary {
  const records = items.map(asRecord).filter((item): item is AnyRecord => Boolean(item));
  const channelLike = records.find((item) =>
    Boolean(
      pickString(item, ["channelTitle", "channelName", "title", "name"]) ||
        pickNumber(item, ["subscribers", "members", "memberCount", "participantsCount"]),
    ),
  );

  return {
    ...fallback,
    title: channelLike ? pickString(channelLike, ["channelTitle", "channelName", "title", "name"]) : null,
    description: channelLike
      ? pickString(channelLike, ["channelDescription", "description", "about", "bio"])
      : null,
    subscribers: channelLike
      ? pickNumber(channelLike, ["subscribers", "subscriberCount", "members", "memberCount", "participantsCount"])
      : null,
  };
}

function calculateMetrics(posts: NormalizedPost[]) {
  const views = posts.map((post) => post.views).filter((value): value is number => typeof value === "number");
  const reactions = posts
    .map((post) => post.reactions)
    .filter((value): value is number => typeof value === "number");
  const dates = posts
    .map((post) => (post.date ? Date.parse(post.date) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const totalViews = views.length > 0 ? views.reduce((sum, value) => sum + value, 0) : null;
  const totalReactions = reactions.length > 0 ? reactions.reduce((sum, value) => sum + value, 0) : null;
  const daysRange =
    dates.length > 1 ? Math.max(1, (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)) : null;

  return {
    postCount: posts.length,
    averageViews: totalViews == null ? null : totalViews / views.length,
    maxViews: views.length > 0 ? Math.max(...views) : null,
    totalViews,
    averageReactions: totalReactions == null ? null : totalReactions / reactions.length,
    postsWithReactions: reactions.length,
    postsPerWeek: daysRange == null ? null : posts.length / (daysRange / 7),
    dateRange: {
      from: dates.length > 0 ? new Date(dates[0]).toISOString() : null,
      to: dates.length > 0 ? new Date(dates[dates.length - 1]).toISOString() : null,
    },
  };
}

function buildPrompt(input: {
  channel: ChannelSummary;
  analysisMode: string;
  metrics: ReturnType<typeof calculateMetrics>;
  recentPosts: NormalizedPost[];
  topPosts: NormalizedPost[];
}) {
  return [
    "Ты аналитик Telegram-каналов. Ответь на русском языке, кратко и практически.",
    "Сделай структурированное резюме по данным. Не выдумывай недостающие метрики.",
    "Учитывай, что набор данных выбран по правилу analysisMode.",
    "Обязательно включи: о чем канал, тон и вероятную аудиторию, активность, вовлеченность, сильные стороны, риски или ограничения данных.",
    "Если реакций нет в данных, прямо скажи только то, что реакции недоступны. Не утверждай, что лайков, комментариев или репостов нет.",
    "",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

async function getIntegrationSettings(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("integration_settings_secure")
    .select("key, value")
    .in("key", ["apify_actor_id", "apify_token", "openrouter_api_key", "openrouter_model"]);

  if (error || !data) {
    throw new Error("INTEGRATIONS_UNAVAILABLE");
  }

  const settings = new Map(data.map((item) => [item.key, item.value]));
  const apifyActorId = settings.get("apify_actor_id");
  const apifyToken = settings.get("apify_token");
  const openrouterApiKey = settings.get("openrouter_api_key");
  const openrouterModel = settings.get("openrouter_model");

  if (!apifyActorId || !apifyToken || !openrouterApiKey || !openrouterModel) {
    throw new Error("INTEGRATIONS_INCOMPLETE");
  }

  return {
    apifyActorId,
    apifyToken,
    openrouterApiKey,
    openrouterModel,
  };
}

async function getAccountContext(admin: SupabaseClient, authHeader: string | null, channelHandle: string) {
  const token = readBearerToken(authHeader);
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);

  if (authError || !user) {
    throw new Error("AUTH_REQUIRED");
  }

  const [{ data: accountRow, error: accountError }, { data: unlockedRows, error: unlockedError }] =
    await Promise.all([
      admin.from("user_accounts").select("id, email, credits_remaining, credits_total").eq("id", user.id).single(),
      admin
        .from("analyzed_channels")
        .select("channel_handle")
        .eq("user_id", user.id)
        .eq("channel_handle", channelHandle)
        .limit(1),
    ]);

  if (accountError || !accountRow) {
    throw new Error("ACCOUNT_NOT_READY");
  }

  if (unlockedError) {
    throw new Error("ACCOUNT_HISTORY_UNAVAILABLE");
  }

  return {
    user,
    account: {
      userId: accountRow.id,
      email: accountRow.email ?? user.email ?? "",
      creditsRemaining: accountRow.credits_remaining,
      creditsTotal: accountRow.credits_total,
      alreadyUnlocked: unlockedRows.length > 0,
    } satisfies AccountContext,
  };
}

async function registerSuccessfulAnalysis(input: {
  admin: SupabaseClient;
  account: AccountContext;
  channelHandle: string;
  channelUrl: string;
}) {
  if (input.account.alreadyUnlocked) {
    return {
      charged: false,
      creditsRemaining: input.account.creditsRemaining,
      creditsTotal: input.account.creditsTotal,
    };
  }

  const { error: insertError } = await input.admin.from("analyzed_channels").insert({
    user_id: input.account.userId,
    channel_handle: input.channelHandle,
    channel_url: input.channelUrl,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        charged: false,
        creditsRemaining: input.account.creditsRemaining,
        creditsTotal: input.account.creditsTotal,
      };
    }

    if (insertError.message.includes("NO_CREDITS_AVAILABLE")) {
      throw new Error("NO_CREDITS_AVAILABLE");
    }

    throw new Error(`Не удалось зафиксировать использование кредита: ${insertError.message}`);
  }

  const { data: updatedAccount, error: updatedAccountError } = await input.admin
    .from("user_accounts")
    .select("credits_remaining, credits_total")
    .eq("id", input.account.userId)
    .single();

  if (updatedAccountError || !updatedAccount) {
    throw new Error("ACCOUNT_REFRESH_FAILED");
  }

  return {
    charged: true,
    creditsRemaining: updatedAccount.credits_remaining,
    creditsTotal: updatedAccount.credits_total,
  };
}

async function fetchApifyItems(
  channel: ReturnType<typeof normalizeTelegramInput>,
  settings: Awaited<ReturnType<typeof getIntegrationSettings>>,
) {
  const url = new URL(
    `https://api.apify.com/v2/acts/${settings.apifyActorId.replace("/", "~")}/run-sync-get-dataset-items`,
  );
  url.searchParams.set("token", settings.apifyToken);
  url.searchParams.set("timeout", "50");
  url.searchParams.set("memory", "1024");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channels: [channel.url],
      maxPostsPerChannel: APIFY_FETCH_LIMIT,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Apify вернул ${response.status}: ${body.slice(0, 500)}`);
  }

  const parsed = JSON.parse(body) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Apify вернул неожиданный формат данных.");
  }
  return parsed;
}

async function requestOpenRouter(
  prompt: string,
  settings: Awaited<ReturnType<typeof getIntegrationSettings>>,
  httpReferer: string,
) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": httpReferer,
      "X-Title": "TG Analytics from Ionko V3",
    },
    body: JSON.stringify({
      model: settings.openrouterModel,
      messages: [
        {
          role: "system",
          content: "Ты пишешь точную, сжатую аналитику Telegram-каналов для владельца продукта.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });

  const payload = (await response.json().catch(() => null)) as AnyRecord | null;
  if (!response.ok) {
    const message =
      asRecord(payload?.error)?.message ??
      (typeof payload?.error === "string" ? payload.error : null) ??
      `OpenRouter вернул ${response.status}`;
    throw new Error(String(message));
  }

  const choice = Array.isArray(payload?.choices) ? asRecord(payload.choices[0]) : null;
  const message = choice ? asRecord(choice.message) : null;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter не вернул текст анализа.");
  }
  return content.trim();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const body = (await request.json().catch(() => null)) as AnyRecord | null;
    const channel = normalizeTelegramInput(body?.channel);
    const settings = await getIntegrationSettings(admin);
    const { account } = await getAccountContext(admin, request.headers.get("Authorization"), channel.handle);

    if (!account.alreadyUnlocked && account.creditsRemaining <= 0) {
      return jsonResponse(
        {
          error: "Бесплатные кредиты закончились.",
          details: "Повторный анализ уже открытого канала по-прежнему доступен без списания.",
        },
        402,
      );
    }

    const items = await fetchApifyItems(channel, settings);
    const channelSummary = extractChannel(items, channel);
    const allPosts = extractPosts(items, channel.url);
    const selectedPosts = selectPostsForAnalysis(allPosts);
    const recentPosts = selectedPosts.posts;

    if (recentPosts.length === 0) {
      return jsonResponse(
        {
          error: "Apify не нашел публикации для этого канала.",
          details: "Проверьте, что канал публичный и доступен через t.me.",
        },
        404,
      );
    }

    const metrics = calculateMetrics(recentPosts);
    const topPosts = [...recentPosts]
      .filter((post) => typeof post.views === "number")
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 4);
    const limitations = [
      metrics.postsWithReactions === 0 ? "Реакции недоступны в ответе Apify для этого запроса." : null,
      channelSummary.subscribers == null ? "Количество подписчиков недоступно в ответе Apify." : null,
    ].filter((item): item is string => Boolean(item));

    const analysis = await requestOpenRouter(
      buildPrompt({
        channel: channelSummary,
        analysisMode: selectedPosts.mode,
        metrics,
        recentPosts,
        topPosts,
      }),
      settings,
      request.headers.get("x-site-origin") ?? request.headers.get("origin") ?? "https://tg-analytics-from-ionko-v3.vercel.app",
    );

    const billing = await registerSuccessfulAnalysis({
      admin,
      account,
      channelHandle: channel.handle,
      channelUrl: channel.url,
    });

    return jsonResponse({
      channel: channelSummary,
      analysisMode: selectedPosts.mode,
      metrics,
      topPosts,
      recentPosts,
      analysis,
      limitations,
      billing: {
        ...billing,
        alreadyUnlocked: account.alreadyUnlocked,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
    const isEnvError = message.startsWith("Missing required environment variable");
    const isInputError = message.includes("Введите") || message.includes("Неверный формат");
    const isAuthError = message === "AUTH_REQUIRED";
    const isCreditsError = message === "NO_CREDITS_AVAILABLE";
    const isAccountError = [
      "ACCOUNT_NOT_READY",
      "ACCOUNT_HISTORY_UNAVAILABLE",
      "ACCOUNT_REFRESH_FAILED",
    ].includes(message);
    const isIntegrationsError = ["INTEGRATIONS_UNAVAILABLE", "INTEGRATIONS_INCOMPLETE"].includes(message);

    return jsonResponse(
      {
        error: isEnvError
          ? "Не настроены переменные окружения Supabase Function."
          : isAuthError
            ? "Чтобы запустить анализ, войдите или зарегистрируйтесь."
            : isCreditsError
              ? "Бесплатные кредиты закончились."
              : isAccountError
                ? "Не удалось прочитать состояние аккаунта."
                : isIntegrationsError
                  ? "Не удалось прочитать ключи интеграций."
                  : message,
        details: isEnvError
          ? "Проверьте стандартные env Supabase Edge Functions."
          : isCreditsError
            ? "Повторный анализ уже открытого канала остается доступным без списания."
            : undefined,
      },
      isInputError ? 400 : isAuthError ? 401 : isCreditsError ? 402 : isAccountError ? 503 : isEnvError || isIntegrationsError ? 500 : 502,
    );
  }
});
