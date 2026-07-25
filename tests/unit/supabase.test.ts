import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseDiagnosticHeaders } from "../../lib/providers/supabase";

test("sends Supabase API keys only through the apikey header", () => {
  const headers = createSupabaseDiagnosticHeaders("sb_publishable_example");

  assert.deepEqual(headers, { apikey: "sb_publishable_example" });
  assert.equal("Authorization" in headers, false);
});
