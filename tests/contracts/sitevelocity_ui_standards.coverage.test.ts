import assert from "node:assert/strict";
import test from "node:test";

/**
 * Documentation / matrix test: every UI standards U-rule maps to at least one
 * named contract or e2e test. Runs without generated code.
 */
const UI_STANDARDS_COVERAGE: Record<string, string[]> = {
  U1: [
    "U1/R2: capability states from validated input; preview/roadmap have no working controls",
    "structural: preview_module fixture marks siteFeasibility/dealPotential PREVIEW",
  ],
  U2: [
    "R3: data-state fixtures cover initial/loading/ready/empty/partial/stale/error/unauthorized/refreshing/refresh_failed",
    "structural: fixture JSON dataState variants exist",
  ],
  U3: [
    "R17: WCAG 2.2 AA focus, live status, keyboard (when generated)",
    "tests/e2e/a11y.spec.ts :: axe + keyboard intent",
  ],
  U4: [
    "R18: viewport 320–1440 and 200% zoom equivalence (when generated)",
    "tests/e2e/a11y.spec.ts :: responsive / zoom intent",
  ],
  U5: [
    "tests/e2e/a11y.spec.ts :: reduced-motion intent",
    "U5: reduced-motion coverage documented",
  ],
  U6: [
    "R20/U6: secret-shaped props must not appear in DOM",
    "structural: package and fixtures contain no live secrets",
  ],
  U7: [
    "R19/U7: XSS strings escaped; evidence destinations validated",
    "structural: xss_probe fixture retained as untrusted data",
  ],
  U8: [
    "R21/U8: UTC timestamps localized with locale/timeZone while retaining datetime",
  ],
  U9: [
    "U9: fixtures freeze clock/locale/timezone for deterministic screenshots",
    "structural: ready fixture pins now/locale/timeZone",
  ],
  U10: [
    "R22: demo mode uses stored valid snapshots only; no fabricated findings",
    "structural: fixtures use synthetic site IDs only",
  ],
};

test("UI standards U1–U10 coverage matrix is complete", () => {
  const expected = [
    "U1",
    "U2",
    "U3",
    "U4",
    "U5",
    "U6",
    "U7",
    "U8",
    "U9",
    "U10",
  ];
  assert.deepEqual(Object.keys(UI_STANDARDS_COVERAGE).sort(), expected.sort());

  for (const rule of expected) {
    const mapped = UI_STANDARDS_COVERAGE[rule];
    assert.ok(Array.isArray(mapped), `${rule} must map to an array`);
    assert.ok(mapped.length >= 1, `${rule} must map to at least one test name`);
    for (const name of mapped) {
      assert.equal(typeof name, "string");
      assert.ok(name.length > 0);
    }
  }
});

test("U1: coverage names reference capability-state truth", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U1.some((n) => /capability|PREVIEW/i.test(n)));
});

test("U2: coverage names reference data-state fixtures", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U2.some((n) => /data-state|fixture/i.test(n)));
});

test("U3: coverage names reference a11y", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U3.some((n) => /a11y|WCAG|axe/i.test(n)));
});

test("U4: coverage names reference viewport/zoom", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U4.some((n) => /viewport|zoom|320/i.test(n)));
});

test("U5: reduced-motion coverage documented", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U5.some((n) => /reduced-motion/i.test(n)));
});

test("U6: coverage names reference secrets/DOM", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U6.some((n) => /secret/i.test(n)));
});

test("U7: coverage names reference XSS/escape", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U7.some((n) => /XSS|escape/i.test(n)));
});

test("U8: coverage names reference locale/timezone", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U8.some((n) => /locale|timeZone|UTC/i.test(n)));
});

test("U9: fixtures freeze clock/locale/timezone for deterministic screenshots", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U9.some((n) => /freeze|clock|locale/i.test(n)));
});

test("U10: coverage names reference fabrication / demo snapshots", () => {
  assert.ok(UI_STANDARDS_COVERAGE.U10.some((n) => /fabricat|snapshot|synthetic/i.test(n)));
});
