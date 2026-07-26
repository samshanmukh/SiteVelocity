import assert from "node:assert/strict";
import test from "node:test";
import { ManagedIngestionBatchSchema } from "../../lib/ingestion/managed-batch";

const valid = {
  schemaVersion: "1.0",
  organizationId: "00000000-0000-4000-8000-000000000001",
  provider: "nexla",
  datasetKey: "san_jose_ab2011",
  batchId: "nexla-run-101",
  source: {
    agency: "City of San Jose",
    dataset: "AB 2011 Opportunity Parcels",
    sourceUrl: "https://example.gov/FeatureServer/0",
  },
  retrievedAt: "2026-07-25T12:00:00.000Z",
  records: [{ externalRecordId: "1", payload: { APN: "23018033", VACANT: "YES" } }],
} as const;

test("accepts a bounded, provenance-stamped Nexla batch", () => {
  assert.equal(ManagedIngestionBatchSchema.parse(valid).records[0].payload.APN, "23018033");
});

test("rejects unknown datasets, insecure sources, and undeclared fields", () => {
  assert.equal(ManagedIngestionBatchSchema.safeParse({ ...valid, datasetKey: "unknown" }).success, false);
  assert.equal(ManagedIngestionBatchSchema.safeParse({
    ...valid,
    source: { ...valid.source, sourceUrl: "http://example.gov/data" },
  }).success, false);
  assert.equal(ManagedIngestionBatchSchema.safeParse({ ...valid, extra: true }).success, false);
});
