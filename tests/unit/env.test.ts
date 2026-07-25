import assert from "node:assert/strict";
import test from "node:test";
import { readIntegrationConfig } from "../../lib/config/env";

test("defaults the MiniMax model without inventing provider credentials", () => {
  const config = readIntegrationConfig({});

  assert.equal(config.MINIMAX_MODEL, "MiniMax-M2.7");
  assert.equal(config.MINIMAX_API_KEY, undefined);
  assert.equal(config.RTRVR_API_KEY, undefined);
});

test("rejects an invalid Supabase URL", () => {
  assert.throws(() => readIntegrationConfig({ SUPABASE_URL: "not-a-url" }));
});

test("treats blank optional credentials as absent", () => {
  const config = readIntegrationConfig({ RENDER_API_KEY: "" });
  assert.equal(config.RENDER_API_KEY, undefined);
});
