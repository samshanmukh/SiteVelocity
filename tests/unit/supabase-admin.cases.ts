import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  SupabaseAdminConfigurationError,
  type SupabaseAdminClientFactory,
} from "../../lib/persistence/supabase/admin";

const url = "https://sitevelocity.supabase.co";
const secretKey = "sb_secret_server_only";

function unsignedTestJwt(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.test-signature`;
}

const serviceRoleKey = unsignedTestJwt("service_role");

interface FactoryCall {
  url: string;
  key: string;
  options: unknown;
}

function recordingFactory(calls: FactoryCall[]): SupabaseAdminClientFactory {
  return (receivedUrl, receivedKey, options) => {
    calls.push({ url: receivedUrl, key: receivedKey, options });
    return {} as SupabaseClient;
  };
}

test("prefers the current secret key and disables browser session behavior", () => {
  const calls: FactoryCall[] = [];

  createSupabaseAdminClient(
    { url: `${url}/`, secretKey, serviceRoleKey },
    recordingFactory(calls),
  );

  assert.deepEqual(calls, [
    {
      url,
      key: secretKey,
      options: {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    },
  ]);
});

test("uses the legacy service-role JWT only when the current secret is absent", () => {
  const calls: FactoryCall[] = [];

  createSupabaseAdminClient({ url, serviceRoleKey }, recordingFactory(calls));

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.key, serviceRoleKey);
});

test("does not accept a publishable key as an elevated secret", () => {
  const publishableKey = "sb_publishable_public_value";

  assert.throws(
    () =>
      createSupabaseAdminClient(
        { url, secretKey: publishableKey },
        () => assert.fail("client factory must not run"),
      ),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseAdminConfigurationError);
      assert.match(error.message, /SUPABASE_SECRET_KEY/);
      assert.doesNotMatch(error.message, new RegExp(publishableKey));
      return true;
    },
  );
});

test("does not accept a legacy anon JWT as a service-role credential", () => {
  const anonKey = unsignedTestJwt("anon");

  assert.throws(
    () =>
      createSupabaseAdminClient(
        { url, serviceRoleKey: anonKey },
        () => assert.fail("client factory must not run"),
      ),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseAdminConfigurationError);
      assert.match(error.message, /service-role JWT/);
      assert.doesNotMatch(error.message, new RegExp(anonKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      return true;
    },
  );
});

test("reports missing configuration without including configured values", () => {
  const unsafeUrl = "postgresql://user:password@example.test/database";

  assert.throws(
    () =>
      createSupabaseAdminClient(
        { url: unsafeUrl, secretKey },
        () => assert.fail("client factory must not run"),
      ),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseAdminConfigurationError);
      assert.match(error.message, /HTTP\(S\)/);
      assert.doesNotMatch(error.message, /user|password|example\.test/);
      return true;
    },
  );

  assert.throws(
    () =>
      createSupabaseAdminClient(
        { url },
        () => assert.fail("client factory must not run"),
      ),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseAdminConfigurationError);
      assert.match(error.message, /server/i);
      return true;
    },
  );
});
