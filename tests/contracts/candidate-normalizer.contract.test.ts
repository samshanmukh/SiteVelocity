import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCandidate,
  type RawCandidateNormalizationInput,
  type SourceMapping,
} from "../../lib/domain/candidate-normalizer";

/**
 * Contract tests for prompts/modules/candidate-normalizer.prompt.
 * Each test name declares the rule IDs it verifies (R1–R12, P1–P8).
 */

const mapping: SourceMapping = {
  selectors: {
    jurisdiction: "jurisdiction",
    county: "county",
    address: "address",
    apn: "apn",
    parcelAcres: "acres",
    reportedCapacity: "capacity",
    latitude: "lat",
    longitude: "lon",
  },
  sanJoseAliases: ["san jose", "san josé", "city of san jose", "city of san josé"],
  apnSeparators: ["-", " "],
  bounds: {
    parcelAcres: { min: 0.01, max: 10_000 },
    reportedCapacity: { min: 1, max: 50_000 },
    latitude: { min: 36.8, max: 37.6 },
    longitude: { min: -122.3, max: -121.3 },
  },
};

function baseInput(overrides?: Partial<RawCandidateNormalizationInput["rawPayload"]>): RawCandidateNormalizationInput {
  return {
    source: {
      agency: "California HCD",
      dataset: "housing-element-sites",
      sourceRecordId: "rec-001",
      sourceUrl: "https://example-data.hcd.ca.gov/sites/rec-001",
      retrievedAt: "2026-07-25T18:00:00.000Z",
    },
    rawPayload: {
      jurisdiction: "San Jose",
      county: "Santa Clara",
      address: "123 Example Ave",
      apn: "259-38-014",
      acres: "4.18",
      capacity: 156,
      lat: 37.33,
      lon: -121.89,
      ...overrides,
    },
    mapping,
  };
}

test("R1: returns exactly one accepted or rejected result for a validated input", () => {
  const result = normalizeCandidate(baseInput());
  assert.ok(result.status === "accepted" || result.status === "rejected");
});

test("R2/P1: copies source identity into provenance without reinterpretation", () => {
  const input = baseInput();
  const result = normalizeCandidate(input);
  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.deepEqual(result.provenance.source, input.source);
    assert.deepEqual(result.candidate.source, input.source);
  }
});

test("R3: applies only declared field mappings — undeclared fields stay unknown", () => {
  const input = baseInput();
  input.mapping = { ...mapping, selectors: { ...mapping.selectors, address: undefined } };
  const result = normalizeCandidate(input);
  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.candidate.address.status, "unknown");
  }
});

test("R4: normalizes recognized San José variants; retains unrecognized jurisdiction as unresolved", () => {
  const canonical = normalizeCandidate(baseInput({ jurisdiction: "CITY OF SAN JOSE" }));
  assert.equal(canonical.status, "accepted");
  if (canonical.status === "accepted") {
    assert.deepEqual(canonical.candidate.jurisdiction, {
      status: "known",
      value: { value: "San José", resolution: "canonical" },
    });
  }

  const other = normalizeCandidate(baseInput({ jurisdiction: "Santa Clara" }));
  assert.equal(other.status, "accepted");
  if (other.status === "accepted") {
    assert.deepEqual(other.candidate.jurisdiction, {
      status: "known",
      value: { value: "Santa Clara", resolution: "unresolved" },
    });
    assert.ok(other.diagnostics.some((d) => d.code === "unresolved_jurisdiction"));
  }
});

test("R5: removes only declared APN separators and preserves the raw APN in provenance", () => {
  const result = normalizeCandidate(baseInput({ apn: "259-38 014" }));
  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.deepEqual(result.candidate.apn, { status: "known", value: "25938014" });
    assert.equal(result.provenance.selectedRawValues.apn, "259-38 014");
  }
});

test("R5: does not manufacture missing APN digits — dots are not declared separators", () => {
  const result = normalizeCandidate(baseInput({ apn: "259.38.014" }));
  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.deepEqual(result.candidate.apn, { status: "known", value: "259.38.014" });
  }
});

test("R6: parses numeric fields only when complete, finite, and within declared bounds", () => {
  const good = normalizeCandidate(baseInput({ acres: "1,250" }));
  assert.equal(good.status, "accepted");
  if (good.status === "accepted") {
    assert.deepEqual(good.candidate.parcelAcres, { status: "known", value: 1250 });
  }

  const partial = normalizeCandidate(baseInput({ acres: "4.18 acres" }));
  assert.equal(partial.status, "accepted");
  if (partial.status === "accepted") {
    assert.equal(partial.candidate.parcelAcres.status, "unknown");
  }
});

test("R7/P2: missing, blank, malformed, and out-of-bounds optional facts become unknown with a diagnostic — never zero or false", () => {
  const result = normalizeCandidate(baseInput({ acres: "", capacity: "n/a", lat: 99 }));
  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.candidate.parcelAcres.status, "unknown");
    assert.equal(result.candidate.reportedCapacity.status, "unknown");
    assert.equal(result.candidate.coordinates.status, "unknown");
    for (const field of ["parcelAcres", "reportedCapacity", "coordinates"] as const) {
      assert.ok(result.diagnostics.some((d) => d.field === field), `diagnostic emitted for ${field}`);
    }
  }
});

test("R8: rejects when source identity is missing or invalid", () => {
  const input = baseInput();
  input.source = { ...input.source, sourceUrl: "not-a-url" };
  const result = normalizeCandidate(input);
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.ok(result.rejectionReasons.some((r) => r.code === "invalid_source_identity"));
  }
});

test("R9: rejects when neither valid coordinates nor a non-empty APN survives normalization", () => {
  const result = normalizeCandidate(baseInput({ apn: "", lat: null, lon: null }));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.ok(result.rejectionReasons.some((r) => r.code === "no_location_identity"));
  }
});

test("R10/P1: preserves the original raw payload without mutation", () => {
  const input = baseInput();
  const frozen = JSON.stringify(input.rawPayload);
  const result = normalizeCandidate(input);
  assert.equal(JSON.stringify(input.rawPayload), frozen);
  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(JSON.stringify(result.provenance.rawPayload), frozen);
  }
});

test("R11/P4: produces identical output for structurally identical input", () => {
  const a = normalizeCandidate(baseInput());
  const b = normalizeCandidate(baseInput());
  assert.deepEqual(a, b);
});

test("R12/P7: does not infer facts from unrelated fields when declared fields are absent", () => {
  const result = normalizeCandidate(
    baseInput({ acres: null, description: "Approximately 5 acres zoned R-M with 200 units possible" }),
  );
  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.candidate.parcelAcres.status, "unknown");
    assert.equal(result.candidate.reportedCapacity.status, "known"); // still from the declared capacity field only
  }
});
