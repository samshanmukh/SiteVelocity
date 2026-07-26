import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestContextError,
  resolveRequestContextWithDependencies,
  type OrganizationRole,
  type RequestAccess,
} from "../../lib/security/request-context-core";

function dependencies(options: {
  demoMode?: boolean;
  backend?: "auto" | "file" | "supabase";
  userId?: string | null;
  memberships?: Array<{ organizationId: string; role: OrganizationRole }>;
} = {}) {
  return {
    demoMode: options.demoMode ?? false,
    persistenceBackend: options.backend ?? "supabase",
    demoOrganizationId: "00000000-0000-4000-8000-000000000001",
    async authenticate(token: string) {
      assert.equal(token, "valid-token");
      return options.userId === undefined ? "user-1" : options.userId;
    },
    async membershipsForUser() {
      return options.memberships ?? [{
        organizationId: "00000000-0000-4000-8000-000000000002",
        role: "member" as const,
      }];
    },
  };
}

function request(options: { token?: string; organizationId?: string; cookie?: boolean } = {}) {
  const headers = new Headers();
  if (options.token) {
    headers.set(options.cookie ? "cookie" : "authorization", options.cookie
      ? `sitevelocity_access_token=${encodeURIComponent(options.token)}`
      : `Bearer ${options.token}`);
  }
  if (options.organizationId) headers.set("x-sitevelocity-organization-id", options.organizationId);
  return new Request("https://sitevelocity.test/api/candidates", { headers });
}

async function rejectsWith(
  access: RequestAccess,
  expected: { code: string; status: number },
  input = request(),
  deps = dependencies(),
) {
  await assert.rejects(
    () => resolveRequestContextWithDependencies(input, access, deps),
    (error: unknown) => error instanceof RequestContextError
      && error.code === expected.code
      && error.status === expected.status,
  );
}

test("demo mode resolves the explicitly configured fixed tenant without a token", async () => {
  const context = await resolveRequestContextWithDependencies(request(), "admin", dependencies({ demoMode: true }));
  assert.equal(context.organizationId, "00000000-0000-4000-8000-000000000001");
  assert.equal(context.role, "owner");
  assert.equal(context.demoMode, true);
});

test("production requests fail closed without a valid access token", async () => {
  await rejectsWith("read", { code: "unauthorized", status: 401 });
  await rejectsWith("read", { code: "unauthorized", status: 401 }, request({ token: "valid-token" }), dependencies({ userId: null }));
});

test("a membership scopes reads and writes to its organization", async () => {
  const fromHeader = await resolveRequestContextWithDependencies(request({ token: "valid-token" }), "write", dependencies());
  const fromCookie = await resolveRequestContextWithDependencies(request({ token: "valid-token", cookie: true }), "read", dependencies());
  assert.equal(fromHeader.organizationId, "00000000-0000-4000-8000-000000000002");
  assert.equal(fromCookie.organizationId, fromHeader.organizationId);
});

test("a requested organization must be one of the user's memberships", async () => {
  await rejectsWith(
    "read",
    { code: "forbidden", status: 403 },
    request({ token: "valid-token", organizationId: "00000000-0000-4000-8000-000000000003" }),
  );
});

test("viewer access is read-only and admin access excludes ordinary members", async () => {
  const viewer = dependencies({ memberships: [{
    organizationId: "00000000-0000-4000-8000-000000000002",
    role: "viewer",
  }] });
  assert.equal((await resolveRequestContextWithDependencies(request({ token: "valid-token" }), "read", viewer)).role, "viewer");
  await rejectsWith("write", { code: "forbidden", status: 403 }, request({ token: "valid-token" }), viewer);
  await rejectsWith("admin", { code: "forbidden", status: 403 }, request({ token: "valid-token" }), dependencies());
});

test("production file persistence is rejected because it cannot isolate tenants", async () => {
  await rejectsWith(
    "read",
    { code: "unavailable", status: 503 },
    request({ token: "valid-token" }),
    dependencies({ backend: "file" }),
  );
});
