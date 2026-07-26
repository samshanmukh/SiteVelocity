import "server-only";
import type { ProviderDiagnostic } from "./types";
import { fetchWithTimeout, safeHttpMessage } from "./http";
import { normalizeSupabaseProjectUrl } from "@/lib/config/supabase-url";

export interface SupabaseDiagnosticConfig {
  url?: string;
  publishableKey?: string;
  secretKey?: string;
  serviceRoleKey?: string;
}

export interface SupabaseDiagnosticCredential {
  key: string;
  source: "publishable" | "secret" | "service-role";
}

export type SupabaseDiagnosticRequest = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createSupabaseDiagnosticHeaders(key: string): Record<string, string> {
  return { apikey: key };
}

export function selectSupabaseDiagnosticCredential(
  config: Pick<SupabaseDiagnosticConfig, "publishableKey" | "secretKey" | "serviceRoleKey">,
): SupabaseDiagnosticCredential | undefined {
  if (config.publishableKey) {
    return { key: config.publishableKey, source: "publishable" };
  }
  if (config.secretKey) {
    return { key: config.secretKey, source: "secret" };
  }
  if (config.serviceRoleKey) {
    return { key: config.serviceRoleKey, source: "service-role" };
  }
  return undefined;
}

function selectSupabaseServerCredential(
  config: Pick<SupabaseDiagnosticConfig, "secretKey" | "serviceRoleKey">,
): SupabaseDiagnosticCredential | undefined {
  if (config.secretKey) return { key: config.secretKey, source: "secret" };
  if (config.serviceRoleKey) return { key: config.serviceRoleKey, source: "service-role" };
  return undefined;
}

/** Verifies the database API and the minimum SiteVelocity schema, not only Supabase Auth. */
export async function checkSupabasePersistenceConnection(
  config: SupabaseDiagnosticConfig,
  request: SupabaseDiagnosticRequest = fetchWithTimeout,
): Promise<ProviderDiagnostic> {
  const credential = selectSupabaseServerCredential(config);
  if (!config.url || !credential) {
    return {
      id: "supabase",
      name: "Supabase",
      status: "unconfigured",
      message: "Set SUPABASE_URL and a server-side Supabase key to verify persistence.",
    };
  }

  const startedAt = performance.now();
  try {
    const projectUrl = normalizeSupabaseProjectUrl(config.url);
    const endpoint = new URL("/rest/v1/organizations", projectUrl);
    endpoint.searchParams.set("select", "id");
    endpoint.searchParams.set("limit", "1");
    const response = await request(endpoint, {
      method: "GET",
      headers: {
        apikey: credential.key,
        Authorization: `Bearer ${credential.key}`,
      },
      redirect: "error",
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      return {
        id: "supabase",
        name: "Supabase",
        status: "error",
        message: response.status === 404
          ? "Supabase is reachable, but the SiteVelocity persistence schema is not applied."
          : safeHttpMessage("Supabase", response.status),
        latencyMs,
      };
    }
    return {
      id: "supabase",
      name: "Supabase",
      status: "connected",
      message: "Supabase server credential and SiteVelocity persistence schema verified.",
      latencyMs,
    };
  } catch {
    return {
      id: "supabase",
      name: "Supabase",
      status: "error",
      message: "Supabase persistence could not be reached within the diagnostic timeout.",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

export async function checkSupabaseConnection(
  config: SupabaseDiagnosticConfig,
  request: SupabaseDiagnosticRequest = fetchWithTimeout,
): Promise<ProviderDiagnostic> {
  const credential = selectSupabaseDiagnosticCredential(config);
  if (!config.url || !credential) {
    return {
      id: "supabase",
      name: "Supabase",
      status: "unconfigured",
      message: "Set SUPABASE_URL and a Supabase publishable or server-side key to enable persistence diagnostics.",
    };
  }

  const startedAt = performance.now();
  try {
    const projectUrl = normalizeSupabaseProjectUrl(config.url);
    // Auth settings is a read-only, public metadata endpoint behind Supabase's
    // API-key gateway. It verifies the project and credential without fetching
    // the PostgREST OpenAPI schema or enumerating Storage resources.
    const response = await request(new URL("/auth/v1/settings", projectUrl), {
      method: "GET",
      headers: createSupabaseDiagnosticHeaders(credential.key),
      redirect: "error",
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return {
        id: "supabase",
        name: "Supabase",
        status: "error",
        message: safeHttpMessage("Supabase", response.status),
        latencyMs,
      };
    }

    return {
      id: "supabase",
      name: "Supabase",
      status: "connected",
      message: "Supabase API credential verified with a read-only health probe.",
      latencyMs,
    };
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
