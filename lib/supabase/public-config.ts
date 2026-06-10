export const defaultSupabaseUrl = "https://eqsosdbsfpjxpgycfwel.supabase.co";
export const defaultSupabasePublishableKey = "sb_publishable_XqsaYmqqgttgl0guihdsnQ_qsNhoF9_";

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || defaultSupabaseUrl;
}

export function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || defaultSupabasePublishableKey;
}
