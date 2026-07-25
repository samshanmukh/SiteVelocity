import assert from "node:assert/strict";
import test from "node:test";

/**
 * Documentation / matrix test: every preamble P-rule maps to at least one
 * domain_types contract test name. Runs without generated code.
 */
const PREAMBLE_COVERAGE: Record<string, string[]> = {
  P1: ["P1: SourceIdentity fields preserved on Evidence and Provenance"],
  P2: ["P2: unknown Fact stays unknown", "R1: known fact parses; unknown parses; bare null/0/false are not auto-unknown"],
  P3: ["P3: Conflict keeps both values", "R2: two-source conflict accepted; one-source rejected"],
  P4: ["P4: identical parse inputs produce identical outputs"],
  P5: ["P5: malformed boundary rejected", "R6: malformed UUID, bad timestamp, non-finite, bad enum, confidence 1.5 rejected"],
  P6: ["P6: finding.note with instruction-like text still parses as data"],
  P7: ["P7: no invented fields required beyond schema"],
  P8: ["R7/P8: generated module source has no forbidden provider imports"],
};

test("preamble P1–P8 coverage matrix is complete", () => {
  const expected = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
  assert.deepEqual(Object.keys(PREAMBLE_COVERAGE).sort(), expected);

  for (const rule of expected) {
    const mapped = PREAMBLE_COVERAGE[rule];
    assert.ok(Array.isArray(mapped), `${rule} must map to an array`);
    assert.ok(mapped.length >= 1, `${rule} must map to at least one test name`);
    for (const name of mapped) {
      assert.equal(typeof name, "string");
      assert.ok(name.length > 0);
    }
  }
});
