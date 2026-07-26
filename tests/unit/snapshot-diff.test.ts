import assert from "node:assert/strict";
import test from "node:test";
import type { Finding } from "../../lib/domain/schemas/core";
import { createSnapshotDiff } from "../../lib/research/snapshot-diff";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    siteId: "site-1",
    category: "land_use",
    field: "permitted_use",
    valueJson: null,
    status: "unknown",
    evidenceLevel: "professional_verification_required",
    confidence: 0.2,
    impact: "unknown",
    evidenceIds: [],
    createdAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot(id: string, findings: Finding[]) {
  return { snapshot: { id, createdAt: "2026-07-25T00:00:00.000Z" }, findings };
}

test("identical finding projections do not create a change", () => {
  const prior = finding();
  const current = { ...prior, id: "new-row-id", createdAt: "2026-07-26T00:00:00.000Z" };
  assert.deepEqual(createSnapshotDiff(snapshot("one", [prior]), snapshot("two", [current])).changes, []);
});

test("a verified value replacing an unknown is a material change", () => {
  const diff = createSnapshotDiff(
    snapshot("one", [finding()]),
    snapshot("two", [finding({ valueJson: "residential", status: "verified", evidenceLevel: "document_verified", confidence: 0.95, impact: "opportunity", evidenceIds: ["evidence-2"] })]),
  );
  assert.equal(diff.fromSnapshotId, "one");
  assert.equal(diff.changes[0]?.kind, "changed");
  assert.equal(diff.changes[0]?.material, true);
  assert.equal(diff.changes[0]?.current?.status, "verified");
});

test("a missing formerly risky finding is not mislabeled as resolved", () => {
  const diff = createSnapshotDiff(
    snapshot("one", [finding({ status: "verified", impact: "cost_timing_risk", confidence: 0.9 })]),
    snapshot("two", []),
  );
  assert.equal(diff.changes[0]?.kind, "not_observed");
  assert.equal(diff.changes[0]?.material, true);
  assert.match(diff.changes[0]?.summary ?? "", /not proof.*resolved/i);
});
