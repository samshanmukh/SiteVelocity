import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database as SiteVelocityDatabase } from "../database.types";
import { normalizeSupabaseProjectUrl } from "@/lib/config/supabase-url";

export interface SupabaseAdminConfig {
  url?: string;
  secretKey?: string;
  serviceRoleKey?: string;
}

interface ResolvedSupabaseAdminConfig {
  url: string;
  key: string;
}

const ADMIN_CLIENT_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
} as const;

type AdminClientOptions = typeof ADMIN_CLIENT_OPTIONS;

export type SupabaseAdminClientFactory = (
  url: string,
  key: string,
  options: AdminClientOptions,
) => unknown;

const CURRENT_SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9_-]+$/;
const LEGACY_SERVICE_ROLE_KEY_PATTERN =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class SupabaseAdminConfigurationError extends Error {
  override readonly name = "SupabaseAdminConfigurationError";
}

function configurationError(message: string): SupabaseAdminConfigurationError {
  return new SupabaseAdminConfigurationError(message);
}

function resolveUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw configurationError(
      "Supabase admin access is not configured. Set SUPABASE_URL and a server-side Supabase key.",
    );
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
    if (url.username || url.password) {
      throw new Error("Credentials are not allowed in the URL");
    }
    return normalizeSupabaseProjectUrl(url.toString());
  } catch {
    throw configurationError("SUPABASE_URL must be a valid HTTP(S) URL without embedded credentials.");
  }
}

function isServiceRoleJwt(value: string): boolean {
  if (!LEGACY_SERVICE_ROLE_KEY_PATTERN.test(value)) {
    return false;
  }

  try {
    const payload = value.split(".")[1];
    if (!payload) {
      return false;
    }
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const claims = JSON.parse(atob(paddedBase64)) as { role?: unknown };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

function resolveServerKey(config: SupabaseAdminConfig): string {
  const secretKey = config.secretKey?.trim();
  if (secretKey) {
    if (!CURRENT_SECRET_KEY_PATTERN.test(secretKey)) {
      throw configurationError(
        "SUPABASE_SECRET_KEY must contain a valid server-side Supabase secret key.",
      );
    }
    return secretKey;
  }

  const serviceRoleKey = config.serviceRoleKey?.trim();
  if (serviceRoleKey) {
    if (!isServiceRoleJwt(serviceRoleKey)) {
      throw configurationError(
        "SUPABASE_SERVICE_ROLE_KEY must contain a valid legacy service-role JWT.",
      );
    }
    return serviceRoleKey;
  }

  throw configurationError(
    "Supabase admin access is not configured. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY on the server.",
  );
}

function resolveAdminConfig(config: SupabaseAdminConfig): ResolvedSupabaseAdminConfig {
  return {
    url: resolveUrl(config.url),
    key: resolveServerKey(config),
  };
}

function defaultClientFactory(url: string, key: string, options: AdminClientOptions): unknown {
  return createClient(url, key, options);
}

/**
 * Creates an elevated, non-session Supabase client for trusted server code.
 *
 * The current `sb_secret_...` key is preferred. A legacy service-role JWT is
 * accepted only as a fallback. Publishable/anon credentials are deliberately
 * not accepted by this API because this client bypasses Row Level Security.
 */
export function createSupabaseAdminClient<Database = SiteVelocityDatabase>(
  config: SupabaseAdminConfig = {
    url: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  clientFactory: SupabaseAdminClientFactory = defaultClientFactory,
): SupabaseClient<Database> {
  const { url, key } = resolveAdminConfig(config);
  return clientFactory(url, key, ADMIN_CLIENT_OPTIONS) as SupabaseClient<Database>;
}
