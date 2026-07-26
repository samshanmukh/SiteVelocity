import assert from "node:assert/strict";
import test from "node:test";
import { readIntegrationConfig } from "../../lib/config/env";

test("defaults the MiniMax model without inventing provider credentials", () => {
  const config = readIntegrationConfig({});

  assert.equal(config.MINIMAX_MODEL, "MiniMax-M2.7");
  assert.equal(config.ELEVENLABS_STT_MODEL_ID, "scribe_v2");
  assert.equal(config.PERSISTENCE_BACKEND, "auto");
  assert.equal(config.DEMO_MODE, true);
  assert.equal(config.LIVE_RESEARCH, false);
  assert.equal(config.SITEVELOCITY_ORGANIZATION_ID, undefined);
  assert.equal(config.MINIMAX_API_KEY, undefined);
  assert.equal(config.RTRVR_API_KEY, undefined);
});

test("requires exact boolean strings for runtime feature flags", () => {
  assert.equal(readIntegrationConfig({ LIVE_RESEARCH: "true", DEMO_MODE: "false" }).LIVE_RESEARCH, true);
  assert.equal(readIntegrationConfig({ LIVE_RESEARCH: "false" }).LIVE_RESEARCH, false);
  assert.throws(() => readIntegrationConfig({ LIVE_RESEARCH: "1" }));
});

test("rejects an invalid Supabase URL", () => {
  assert.throws(() => readIntegrationConfig({ SUPABASE_URL: "not-a-url" }));
});

test("validates current Supabase key formats and the optional database URL", () => {
  const config = readIntegrationConfig({
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    SUPABASE_SECRET_KEY: "sb_secret_example",
    SUPABASE_SERVICE_ROLE_KEY: "header.payload.signature",
    DATABASE_URL: "postgresql://postgres:password@localhost:5432/postgres",
  });

  assert.equal(config.SUPABASE_PUBLISHABLE_KEY, "sb_publishable_example");
  assert.equal(config.SUPABASE_SECRET_KEY, "sb_secret_example");
  assert.equal(config.SUPABASE_SERVICE_ROLE_KEY, "header.payload.signature");
  assert.equal(config.DATABASE_URL, "postgresql://postgres:password@localhost:5432/postgres");
});

test("rejects Supabase credentials placed in the wrong environment variable", () => {
  assert.throws(() => readIntegrationConfig({ SUPABASE_PUBLISHABLE_KEY: "sb_secret_example" }));
  assert.throws(() => readIntegrationConfig({ SUPABASE_SECRET_KEY: "sb_publishable_example" }));
  assert.throws(() => readIntegrationConfig({ SUPABASE_SERVICE_ROLE_KEY: "not-a-jwt" }));
});

test("treats blank optional credentials as absent", () => {
  const config = readIntegrationConfig({ RENDER_API_KEY: "" });
  assert.equal(config.RENDER_API_KEY, undefined);
});
