import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getIntegrationConfig } from "@/lib/config/env";
import type { Database } from "@/lib/persistence/database.types";

export const dynamic = "force-dynamic";

const CredentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(1_024),
}).strict();

const ACCESS_COOKIE = "sitevelocity_access_token";
const REFRESH_COOKIE = "sitevelocity_refresh_token";

function publicClient() {
  const config = getIntegrationConfig();
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) return null;
  return createClient<Database>(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function setSessionCookies(
  response: NextResponse,
  session: { access_token: string; refresh_token: string; expires_in: number },
) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, session.expires_in - 30),
  });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth/session",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function clearSessionCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";
  for (const [name, path] of [[ACCESS_COOKIE, "/"], [REFRESH_COOKIE, "/api/auth/session"]] as const) {
    response.cookies.set(name, "", { httpOnly: true, secure, sameSite: "lax", path, maxAge: 0 });
  }
}

export async function POST(request: Request) {
  const client = publicClient();
  if (!client) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const input = CredentialsSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "A valid email and password are required." }, { status: 400 });
  const { data, error } = await client.auth.signInWithPassword(input.data);
  if (error || !data.session) {
    return NextResponse.json({ error: "Email or password was not accepted." }, { status: 401 });
  }
  const response = NextResponse.json({ authenticated: true }, { headers: { "Cache-Control": "no-store, private" } });
  setSessionCookies(response, data.session);
  return response;
}

export async function PATCH(request: Request) {
  const client = publicClient();
  if (!client) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const cookie = request.headers.get("cookie") ?? "";
  const encodedRefreshToken = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${REFRESH_COOKIE}=`))?.slice(REFRESH_COOKIE.length + 1);
  let refreshToken: string | null = null;
  try {
    refreshToken = encodedRefreshToken ? decodeURIComponent(encodedRefreshToken) : null;
  } catch {
    const response = NextResponse.json({ error: "The session cookie is invalid." }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  if (!refreshToken) return NextResponse.json({ error: "No renewable session is available." }, { status: 401 });
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    const response = NextResponse.json({ error: "The session could not be renewed." }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  const response = NextResponse.json({ authenticated: true }, { headers: { "Cache-Control": "no-store, private" } });
  setSessionCookies(response, data.session);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store, private" } });
  clearSessionCookies(response);
  return response;
}
