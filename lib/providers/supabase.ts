import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProviderDiagnostic } from "./types";
import { fetchWithTimeout, safeHttpMessage } from "./http";

export function createServerSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createSupabaseDiagnosticHeaders(key: string): Record<string, string> {
  return { apikey: key };
}

export async function checkSupabaseConnection(url?: string, key?: string): Promise<ProviderDiagnostic> {
  if (!url || !key) {
    return {
      id: "supabase",
      name: "Supabase",
      status: "unconfigured",
      message: "Set SUPABASE_URL and a server-side Supabase key to enable persistence.",
    };
  }

  const startedAt = performance.now();
  try {
    const response = await fetchWithTimeout(new URL("/rest/v1/", url), {
      headers: createSupabaseDiagnosticHeaders(key),
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return { id: "supabase", name: "Supabase", status: "error", message: safeHttpMessage("Supabase", response.status), latencyMs };
    }

    return { id: "supabase", name: "Supabase", status: "connected", message: "Supabase Data API credential verified.", latencyMs };
  } catch {
    return {
      id: "supabase",
      name: "Supabase",
      status: "error",
      message: "Supabase could not be reached within the diagnostic timeout.",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
