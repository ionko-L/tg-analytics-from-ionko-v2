import { defaultSupabasePublishableKey, defaultSupabaseUrl } from "./public-config";

export const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    (defaultSupabaseUrl && defaultSupabasePublishableKey),
);
