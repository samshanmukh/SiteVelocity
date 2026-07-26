import "server-only";

import { getIntegrationConfig } from "@/lib/config/env";
import type { Database } from "@/lib/persistence/database.types";
import { createSupabaseAdminClient } from "@/lib/persistence/supabase/admin";
import {
  RequestContextError,
  resolveRequestContextWithDependencies,
  type RequestAccess,
  type RequestContext,
  type RequestContextDependencies,
} from "./request-context-core";

export {
  RequestContextError,
  requestContextTesting,
  type OrganizationRole,
  type RequestAccess,
  type RequestContext,
} from "./request-context-core";

function defaultDependencies(): RequestContextDependencies {
  const config = getIntegrationConfig();
  const hasAdminConfiguration = Boolean(
    config.SUPABASE_URL && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY),
  );

  if (!config.DEMO_MODE && (!hasAdminConfiguration || config.PERSISTENCE_BACKEND === "file")) {
    return {
      demoMode: false,
      persistenceBackend: config.PERSISTENCE_BACKEND,
      demoOrganizationId: config.SITEVELOCITY_ORGANIZATION_ID,
      async authenticate() { throw new RequestContextError("unavailable", 503); },
      async membershipsForUser() { throw new RequestContextError("unavailable", 503); },
    };
  }

  let client: ReturnType<typeof createSupabaseAdminClient<Database>> | null = null;
  const admin = () => {
    client ??= createSupabaseAdminClient<Database>();
    return client;
  };

  return {
    demoMode: config.DEMO_MODE,
    persistenceBackend: config.PERSISTENCE_BACKEND,
    demoOrganizationId: config.SITEVELOCITY_ORGANIZATION_ID,
    async authenticate(token) {
      const { data, error } = await admin().auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async membershipsForUser(userId) {
      const { data, error } = await admin()
        .from("organization_memberships")
        .select("organization_id,role")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw new RequestContextError("unavailable", 503);
      return (data ?? []).map((membership) => ({
        organizationId: membership.organization_id,
        role: membership.role,
      }));
    },
  };
}

/**
 * Resolves and authorizes one tenant before any elevated database operation.
 * Demo mode is an explicit exception for local, fixed-tenant product demos.
 */
export async function resolveRequestContext(
  request: Request | Headers,
  access: RequestAccess,
): Promise<RequestContext> {
  return resolveRequestContextWithDependencies(request, access, defaultDependencies());
}

export function requestContextErrorResponse(error: unknown): Response {
  if (error instanceof RequestContextError) {
    return Response.json({ error: error.code }, {
      status: error.status,
      headers: { "Cache-Control": "no-store, private" },
    });
  }
  return Response.json({ error: "unavailable" }, {
    status: 503,
    headers: { "Cache-Control": "no-store, private" },
  });
}
