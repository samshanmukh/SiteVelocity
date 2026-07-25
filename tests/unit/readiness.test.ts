import assert from "node:assert/strict";
import test from "node:test";
import { isProviderReady } from "../../lib/providers/readiness";

test("treats connected and intentionally configured providers as ready", () => {
  assert.equal(isProviderReady({ status: "connected" }), true);
  assert.equal(isProviderReady({ status: "configured" }), true);
});

test("does not treat unconfigured or failing providers as ready", () => {
  assert.equal(isProviderReady({ status: "unconfigured" }), false);
  assert.equal(isProviderReady({ status: "error" }), false);
});
