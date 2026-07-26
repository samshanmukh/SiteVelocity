import assert from "node:assert/strict";
import test from "node:test";
import { configuredProvider } from "../../lib/providers/configuration";

test("configuration-only provider diagnostics never claim an unverified connection", () => {
  const configured = configuredProvider("nexla", "Nexla", true, "Ready to probe.", "Missing.");
  const missing = configuredProvider("nexla", "Nexla", false, "Ready to probe.", "Missing.");

  assert.equal(configured.status, "configured");
  assert.notEqual(configured.status, "connected");
  assert.equal(missing.status, "unconfigured");
});
