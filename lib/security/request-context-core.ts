import { z } from "zod";

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type RequestAccess = "read" | "write" | "admin";

export interface RequestContext {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  demoMode: boolean;
}

export interface RequestMembership {
  organizationId: string;
  role: OrganizationRole;
}

export interface RequestContextDependencies {
  demoMode: boolean;
  persistenceBackend: "auto" | "file" | "supabase";
  demoOrganizationId?: string;
  authenticate(token: string): Promise<string | null>;
  membershipsForUser(userId: string): Promise<RequestMembership[]>;
}

export class RequestContextError extends Error {
  override readonly name = "RequestContextError";

  constructor(
    readonly code: "invalid_request" | "unauthorized" | "forbidden" | "unavailable",
    readonly status: 400 | 401 | 403 | 503,
  ) {
    super(code);
  }
}

const OrganizationIdSchema = z.string().uuid();
const DEMO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const ROLE_ACCESS: Record<OrganizationRole, readonly RequestAccess[]> = {
  owner: ["read", "write", "admin"],
  admin: ["read", "write", "admin"],
  member: ["read", "write"],
  viewer: ["read"],
};

function bearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization.trim());
    if (!match) throw new RequestContextError("invalid_request", 400);
    return match[1] ?? null;
  }

  const cookie = headers.get("cookie");
  if (!cookie) return null;
  for (const pair of cookie.split(";")) {
    const [rawName, ...rawValue] = pair.trim().split("=");
    if (rawName === "sitevelocity_access_token") {
      const value = rawValue.join("=");
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch {
        throw new RequestContextError("invalid_request", 400);
      }
    }
  }
  return null;
}

function requestedOrganization(headers: Headers): string | null {
  const value = headers.get("x-sitevelocity-organization-id");
  if (!value) return null;
  const parsed = OrganizationIdSchema.safeParse(value.trim());
  if (!parsed.success) throw new RequestContextError("invalid_request", 400);
  return parsed.data;
}

/** Resolves one authenticated tenant and checks its minimum role. */
export async function resolveRequestContextWithDependencies(
  request: Request | Headers,
  access: RequestAccess,
  dependencies: RequestContextDependencies,
): Promise<RequestContext> {
  const headers = request instanceof Headers ? request : request.headers;

  if (dependencies.demoMode) {
    return {
      organizationId: dependencies.demoOrganizationId ?? DEMO_ORGANIZATION_ID,
      userId: "demo-user",
      role: "owner",
      demoMode: true,
    };
  }

  if (dependencies.persistenceBackend === "file") {
    throw new RequestContextError("unavailable", 503);
  }

  const token = bearerToken(headers);
  if (!token) throw new RequestContextError("unauthorized", 401);
  const userId = await dependencies.authenticate(token);
  if (!userId) throw new RequestContextError("unauthorized", 401);

  const requested = requestedOrganization(headers);
  const memberships = await dependencies.membershipsForUser(userId);
  const membership = requested
    ? memberships.find((candidate) => candidate.organizationId === requested)
    : memberships[0];
  if (!membership || !ROLE_ACCESS[membership.role].includes(access)) {
    throw new RequestContextError("forbidden", 403);
  }

  return {
    organizationId: membership.organizationId,
    userId,
    role: membership.role,
    demoMode: false,
  };
}

export const requestContextTesting = {
  bearerToken,
  requestedOrganization,
  DEMO_ORGANIZATION_ID,
};
