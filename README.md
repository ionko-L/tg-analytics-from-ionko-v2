# TG Analytics from ionko

Local Next.js service for analyzing public Telegram channels with Apify and OpenRouter.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Required environment variables are listed in `.env.example`. The local `.env.local` file is ignored by git.

## Vercel Environment Variables

Add these variables during manual Vercel deployment:

```bash
APIFY_TOKEN=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
APIFY_ACTOR_ID=viralanalyzer/telegram-channel-scraper
```

## Notes

- No database or background queue is used.
- One user request maps to one Next.js route handler call.
- The service fetches up to 100 recent posts, analyzes posts from the last 30 days, and falls back to the latest 10 posts when the 30-day period has fewer than 10 posts.
- If reactions or subscriber counts are absent in Apify data, the UI reports them as unavailable.
