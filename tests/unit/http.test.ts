import assert from "node:assert/strict";
import test from "node:test";
import { safeHttpMessage } from "../../lib/providers/http";

test("credential errors do not include secret material", () => {
  assert.equal(safeHttpMessage("Render", 401), "Render rejected the configured credential.");
});

test("rate limiting is distinguished from invalid credentials", () => {
  assert.equal(
    safeHttpMessage("MiniMax", 429),
    "MiniMax credential is valid but the diagnostic was rate limited.",
  );
});
