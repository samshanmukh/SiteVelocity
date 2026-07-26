import assert from "node:assert/strict";
import test from "node:test";
import { deterministicUuid } from "../../lib/persistence/identity";

test("normalized candidate identities are deterministic UUIDs and namespace scoped", () => {
  const first = deterministicUuid("org-a", "candidate:sj-12345678");
  assert.equal(first, deterministicUuid("org-a", "candidate:sj-12345678"));
  assert.notEqual(first, deterministicUuid("org-b", "candidate:sj-12345678"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
