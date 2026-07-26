import assert from "node:assert/strict";
import test from "node:test";
import {
  checkSupabaseConnection,
  checkSupabasePersistenceConnection,
  createSupabaseDiagnosticHeaders,
  selectSupabaseDiagnosticCredential,
  type SupabaseDiagnosticRequest,
} from "../../lib/providers/supabase";

test("sends Supabase API keys only through the apikey header", () => {
  const headers = createSupabaseDiagnosticHeaders("sb_publishable_example");

  assert.deepEqual(headers, { apikey: "sb_publishable_example" });
  assert.equal("Authorization" in headers, false);
});

test("selects the least-privileged diagnostic credential first", () => {
  assert.deepEqual(
    selectSupabaseDiagnosticCredential({
      publishableKey: "sb_publishable_example",
      secretKey: "sb_secret_example",
      serviceRoleKey: "legacy-service-role",
    }),
    { key: "sb_publishable_example", source: "publishable" },
  );
});

test("falls back from modern secret to legacy service-role credentials", () => {
  assert.deepEqual(
    selectSupabaseDiagnosticCredential({
      secretKey: "sb_secret_example",
      serviceRoleKey: "legacy-service-role",
    }),
    { key: "sb_secret_example", source: "secret" },
  );
  assert.deepEqual(
    selectSupabaseDiagnosticCredential({ serviceRoleKey: "legacy-service-role" }),
    { key: "legacy-service-role", source: "service-role" },
  );
  assert.equal(selectSupabaseDiagnosticCredential({}), undefined);
});

test("uses a read-only Auth probe without exposing schema or elevated keys", async () => {
  let requestedUrl: URL | undefined;
  let requestedInit: RequestInit | undefined;
  const request: SupabaseDiagnosticRequest = async (input, init) => {
    requestedUrl = new URL(input);
    requestedInit = init;
    return new Response("sensitive public settings", { status: 200 });
  };

  const diagnostic = await checkSupabaseConnection(
    {
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_example",
      secretKey: "sb_secret_must_not_be_sent",
      serviceRoleKey: "legacy-service-role-must-not-be-sent",
    },
    request,
  );

  assert.equal(requestedUrl?.href, "https://project.supabase.co/auth/v1/settings");
  assert.equal(requestedInit?.method, "GET");
  assert.equal(requestedInit?.redirect, "error");
  assert.deepEqual(Object.fromEntries(new Headers(requestedInit?.headers)), {
    apikey: "sb_publishable_example",
  });
  assert.deepEqual(
    {
      id: diagnostic.id,
      name: diagnostic.name,
      status: diagnostic.status,
      message: diagnostic.message,
    },
    {
      id: "supabase",
      name: "Supabase",
      status: "connected",
      message: "Supabase API credential verified with a read-only health probe.",
    },
  );
  assert.equal(diagnostic.message.includes("sensitive public settings"), false);
  assert.equal(diagnostic.message.includes("sb_secret_must_not_be_sent"), false);
});

test("does not call the network when Supabase diagnostics are unconfigured", async () => {
  let requestCount = 0;
  const request: SupabaseDiagnosticRequest = async () => {
    requestCount += 1;
    return new Response(null, { status: 200 });
  };

  const missingUrl = await checkSupabaseConnection(
    { publishableKey: "sb_publishable_example" },
    request,
  );
  const missingKey = await checkSupabaseConnection(
    { url: "https://project.supabase.co" },
    request,
  );

  assert.equal(requestCount, 0);
  assert.equal(missingUrl.status, "unconfigured");
  assert.equal(missingKey.status, "unconfigured");
  assert.equal(missingUrl.message, missingKey.message);
});

test("returns safe deterministic messages for rejected and rate-limited credentials", async () => {
  const credential = "sb_publishable_do_not_disclose";
  const rejected = await checkSupabaseConnection(
    { url: "https://project.supabase.co", publishableKey: credential },
    async () => new Response(credential, { status: 401 }),
  );
  const rateLimited = await checkSupabaseConnection(
    { url: "https://project.supabase.co", publishableKey: credential },
    async () => new Response(credential, { status: 429 }),
  );

  assert.equal(rejected.status, "error");
  assert.equal(rejected.message, "Supabase rejected the configured credential.");
  assert.equal(rateLimited.status, "error");
  assert.equal(
    rateLimited.message,
    "Supabase credential is valid but the diagnostic was rate limited.",
  );
  assert.equal(`${rejected.message} ${rateLimited.message}`.includes(credential), false);
});

test("does not leak transport errors or credentials", async () => {
  const credential = "sb_publishable_do_not_disclose";
  const diagnostic = await checkSupabaseConnection(
    { url: "https://project.supabase.co", publishableKey: credential },
    async () => {
      throw new Error(`network failure for ${credential}`);
    },
  );

  assert.equal(diagnostic.status, "error");
  assert.equal(
    diagnostic.message,
    "Supabase could not be reached within the diagnostic timeout.",
  );
  assert.equal(diagnostic.message.includes(credential), false);
});

test("persistence diagnostics require a server key and verify the organizations table", async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const diagnostic = await checkSupabasePersistenceConnection({
    url: "https://project.supabase.co/rest/v1/",
    publishableKey: "sb_publishable_ignored",
    secretKey: "sb_secret_server",
  }, async (input, init) => {
    calls.push({ url: new URL(input).href, headers: Object.fromEntries(new Headers(init?.headers)) });
    return new Response("[]", { status: 200 });
  });
  assert.equal(diagnostic.status, "connected");
  assert.equal(calls[0]?.url, "https://project.supabase.co/rest/v1/organizations?select=id&limit=1");
  assert.equal(calls[0]?.headers.apikey, "sb_secret_server");
  assert.equal(calls[0]?.headers.authorization, "Bearer sb_secret_server");

  const missingSchema = await checkSupabasePersistenceConnection({
    url: "https://project.supabase.co",
    secretKey: "sb_secret_server",
  }, async () => new Response(null, { status: 404 }));
  assert.equal(missingSchema.status, "error");
  assert.equal(missingSchema.message, "Supabase is reachable, but the SiteVelocity persistence schema is not applied.");

  const missingServerKey = await checkSupabasePersistenceConnection({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_only",
  }, async () => { throw new Error("must not run"); });
  assert.equal(missingServerKey.status, "unconfigured");
});
