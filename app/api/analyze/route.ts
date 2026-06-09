import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

const LOOKBACK_DAYS = 30;
const MIN_POSTS_FOR_ANALYSIS = 10;
const APIFY_FETCH_LIMIT = 100;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ error, details }, { status });
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  const handle = withoutAt.split(/[/?#]/)[0]?.trim();

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

async function fetchApifyItems(channel: ReturnType<typeof normalizeTelegramInput>) {
  const actorId = process.env.APIFY_ACTOR_ID || "viralanalyzer/telegram-channel-scraper";
  const token = requiredEnv("APIFY_TOKEN");
  const url = new URL(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items`);
  url.searchParams.set("token", token);
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

async function requestOpenRouter(prompt: string) {
  const apiKey = requiredEnv("OPENROUTER_API_KEY");
  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "TG Analytics from ionko",
    },
    body: JSON.stringify({
      model,
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as AnyRecord | null;
    const channel = normalizeTelegramInput(body?.channel);
    const items = await fetchApifyItems(channel);
    const channelSummary = extractChannel(items, channel);
    const allPosts = extractPosts(items, channel.url);
    const selectedPosts = selectPostsForAnalysis(allPosts);
    const recentPosts = selectedPosts.posts;

    if (recentPosts.length === 0) {
      return jsonError(
        404,
        "Apify не нашел публикации для этого канала.",
        "Проверьте, что канал публичный и доступен через t.me.",
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
    );

    return NextResponse.json({
      channel: channelSummary,
      analysisMode: selectedPosts.mode,
      metrics,
      topPosts,
      recentPosts,
      analysis,
      limitations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
    const isEnvError = message.startsWith("Missing required environment variable");
    const isInputError = message.includes("Введите") || message.includes("Неверный формат");

    return jsonError(
      isInputError ? 400 : isEnvError ? 500 : 502,
      isEnvError ? "Не настроены переменные окружения." : message,
      isEnvError ? "Проверьте .env.local и перезапустите dev server." : undefined,
    );
  }
}
