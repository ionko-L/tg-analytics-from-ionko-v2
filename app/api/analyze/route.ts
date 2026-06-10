import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function missingSupabaseEnv() {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export async function POST(request: NextRequest) {
  if (missingSupabaseEnv()) {
    return NextResponse.json(
      {
        error: "Не настроены переменные Supabase.",
        details: "Проверьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: userResult, error: userError }, { data: sessionResult, error: sessionError }] =
    await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

  if (userError || sessionError || !userResult.user || !sessionResult.session?.access_token) {
    return NextResponse.json(
      {
        error: "Чтобы запустить анализ, войдите или зарегистрируйтесь.",
      },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-channel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionResult.session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      "Content-Type": "application/json",
      "x-site-origin": origin,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  return new NextResponse(responseText, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json; charset=utf-8",
    },
  });
}
