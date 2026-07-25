import assert from "node:assert/strict";
import test from "node:test";
import { generatedModulePath, importGenerated, skipReason } from "./load_generated";

// Contract tests for prompts/modules/finance_engine_typescript.prompt.
// Test names begin with the contract rule ID they verify (R1–R8).
//
// Per the prompt's acceptance gate, every registry entry here is a clearly
// labeled arithmetic fixture (`fixture_*`). No real financial formula, rate,
// cost, incentive, or return is encoded; golden tests for approved formulas
// are added when the finance policy is approved.

const MODULE = "finance_engine";
const modulePath = generatedModulePath(MODULE);
const opts = modulePath ? {} : { skip: skipReason(MODULE) };

type AnyFn = (input: unknown) => any;

async function engine(): Promise<AnyFn> {
  const mod = await importGenerated(modulePath as string);
  const fn = mod.runCalculation as AnyFn;
  assert.equal(typeof fn, "function", "module must export runCalculation");
  return fn;
}

const sumFormula = {
  calculationType: "fixture_weighted_sum",
  version: "test-1",
  rounding: "half_up",
  inputs: [
    { key: "a", unit: "USD", currency: "USD", periodicity: "annual", min: "0" },
    { key: "b", unit: "USD", currency: "USD", periodicity: "annual", min: "0" },
  ],
  outputs: [
    {
      key: "total",
      unit: "USD",
      currency: "USD",
      periodicity: "annual",
      decimals: 2,
      expression: { op: "add", args: [{ op: "input", key: "a" }, { op: "input", key: "b" }] },
    },
  ],
};

const productFormula = {
  calculationType: "fixture_product",
  version: "test-1",
  rounding: "half_even",
  inputs: [
    { key: "x", unit: "ratio", currency: null, periodicity: "none" },
    { key: "y", unit: "units", currency: null, periodicity: "none" },
  ],
  outputs: [
    {
      key: "product",
      unit: "units",
      currency: null,
      periodicity: "none",
      decimals: 2,
      expression: { op: "multiply", args: [{ op: "input", key: "x" }, { op: "input", key: "y" }] },
    },
  ],
};

const ratioFormula = {
  calculationType: "fixture_ratio",
  version: "test-1",
  rounding: "half_even",
  inputs: [
    { key: "n", unit: "units", currency: null, periodicity: "none" },
    { key: "d", unit: "units", currency: null, periodicity: "none" },
  ],
  outputs: [
    {
      key: "ratio",
      unit: "ratio",
      currency: null,
      periodicity: "none",
      decimals: 4,
      expression: { op: "divide", args: [{ op: "input", key: "n" }, { op: "input", key: "d" }] },
    },
  ],
};

const registry = [sumFormula, productFormula, ratioFormula];

function usdEntry(key: string, value: string, overrides: Record<string, unknown> = {}): any {
  return {
    assumptionId: `as-${key}`,
    key,
    value,
    unit: "USD",
    currency: "USD",
    periodicity: "annual",
    provenance: "sourced",
    evidenceIds: [`ev-${key}`],
    ...overrides,
  };
}

function bareEntry(key: string, value: string, unit: string): any {
  return {
    assumptionId: `as-${key}`,
    key,
    value,
    unit,
    currency: null,
    periodicity: "none",
    provenance: "user_approved",
    evidenceIds: [],
  };
}

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return structuredClone({
    registry,
    calculationType: "fixture_weighted_sum",
    formulaVersion: "test-1",
    assumptionSet: {
      assumptionSetId: "aset-1",
      scenarioId: "scen-base",
      entries: [usdEntry("a", "2.675"), usdEntry("b", "0", { provenance: "user_approved", evidenceIds: [] })],
    },
    suppliedAt: "2026-07-25T22:15:00Z",
    ...overrides,
  });
}

function sumRequest(a: string, b: string): any {
  const request = makeRequest();
  request.assumptionSet.entries[0].value = a;
  request.assumptionSet.entries[1].value = b;
  return request;
}

function productRequest(x: string, y: string): any {
  return structuredClone({
    registry,
    calculationType: "fixture_product",
    formulaVersion: "test-1",
    assumptionSet: {
      assumptionSetId: "aset-1",
      scenarioId: "scen-base",
      entries: [bareEntry("x", x, "ratio"), bareEntry("y", y, "units")],
    },
    suppliedAt: "2026-07-25T22:15:00Z",
  });
}

function ratioRequest(n: string, d: string): any {
  return structuredClone({
    registry,
    calculationType: "fixture_ratio",
    formulaVersion: "test-1",
    assumptionSet: {
      assumptionSetId: "aset-1",
      scenarioId: "scen-base",
      entries: [bareEntry("n", n, "units"), bareEntry("d", d, "units")],
    },
    suppliedAt: "2026-07-25T22:15:00Z",
  });
}

function resultValue(outcome: any, key: string): string {
  assert.equal(outcome.status, "computed", `expected computed outcome, got ${JSON.stringify(outcome)}`);
  const entry = outcome.run.results.find((r: any) => r.key === key);
  assert.ok(entry, `result ${key} must be present`);
  return entry.value;
}

function expectDiagnostic(outcome: any, code: string, field: string | null): void {
  assert.equal(outcome.status, "not_computable");
  assert.ok(
    outcome.diagnostics.some((d: any) => d.code === code && d.field === field),
    `expected diagnostic ${code} on field ${String(field)}, got ${JSON.stringify(outcome.diagnostics)}`,
  );
  assert.ok(!("run" in outcome), "a not_computable outcome carries no run");
}

test("R1: presence, uniqueness, decimal form, unit, currency, periodicity, and domain are validated before evaluation", opts, async () => {
  const run = await engine();

  const missing = makeRequest();
  missing.assumptionSet.entries = missing.assumptionSet.entries.filter((e: any) => e.key !== "b");
  expectDiagnostic(run(missing), "missing_input", "b");

  const duplicated = makeRequest();
  duplicated.assumptionSet.entries.push(usdEntry("b", "5", { assumptionId: "as-b2" }));
  expectDiagnostic(run(duplicated), "duplicate_assumption_key", "b");

  const badUnit = makeRequest();
  badUnit.assumptionSet.entries[1].unit = "GBP";
  expectDiagnostic(run(badUnit), "unit_mismatch", "b");

  const badCurrency = makeRequest();
  badCurrency.assumptionSet.entries[1].currency = null;
  expectDiagnostic(run(badCurrency), "currency_mismatch", "b");

  const badPeriodicity = makeRequest();
  badPeriodicity.assumptionSet.entries[1].periodicity = "monthly";
  expectDiagnostic(run(badPeriodicity), "periodicity_mismatch", "b");

  const belowDomain = makeRequest();
  belowDomain.assumptionSet.entries[0].value = "-1";
  expectDiagnostic(run(belowDomain), "out_of_domain", "a");

  for (const malformed of ["1e3", "12.3.4", " 1.0", "1,000", ""]) {
    const bad = makeRequest();
    bad.assumptionSet.entries[0].value = malformed;
    expectDiagnostic(run(bad), "malformed_value", "a");
  }
});

test("R2: only formulas present in the supplied registry execute; invalid registries never execute", opts, async () => {
  const run = await engine();

  // The referenced fixture formula executes and produces its declared output.
  assert.equal(resultValue(run(sumRequest("1.25", "2.25")), "total"), "3.50");

  const unknownVersion = makeRequest({ formulaVersion: "test-9" });
  expectDiagnostic(run(unknownVersion), "unknown_formula", null);

  const unknownType = makeRequest({ calculationType: "fixture_absent" });
  expectDiagnostic(run(unknownType), "unknown_formula", null);

  const duplicateRegistry = makeRequest({ registry: [sumFormula, sumFormula] });
  expectDiagnostic(run(duplicateRegistry), "invalid_registry", null);

  const danglingRef = structuredClone(sumFormula);
  danglingRef.outputs[0].expression = { op: "add", args: [{ op: "input", key: "a" }, { op: "input", key: "zzz" }] } as any;
  const badExpression = makeRequest({ registry: [danglingRef, productFormula, ratioFormula] });
  expectDiagnostic(run(badExpression), "invalid_registry", "zzz");
});

test("R3: exact decimal arithmetic with the named rounding policy; binary float artifacts are contract violations", opts, async () => {
  const run = await engine();

  // half_up on an exact tie: 2.675 + 0 -> 2.68. IEEE-754 stores 2.675 as
  // 2.67499999999999982..., so a float implementation returns "2.67".
  assert.equal(resultValue(run(sumRequest("2.675", "0")), "total"), "2.68");

  assert.equal(resultValue(run(sumRequest("0.1", "0.2")), "total"), "0.30");

  // Far beyond IEEE-754 double precision.
  assert.equal(
    resultValue(run(sumRequest("123456789012345678901234567890.12", "0.01")), "total"),
    "123456789012345678901234567890.13",
  );

  // half_even ties: 2.345 -> 2.34 (down to even), 2.355 -> 2.36 (up to even).
  assert.equal(resultValue(run(productRequest("2.345", "1")), "product"), "2.34");
  assert.equal(resultValue(run(productRequest("2.355", "1")), "product"), "2.36");

  // Repeating expansion rounded once at declared decimals.
  assert.equal(resultValue(run(ratioRequest("1", "3")), "ratio"), "0.3333");

  // Declared result format: fixed-point with exactly `decimals` fraction digits.
  const formatted = run(sumRequest("1", "2"));
  assert.match(resultValue(formatted, "total"), /^-?\d+\.\d{2}$/);
});

test("R4: consumed assumptions and calculated outputs stay disjoint, with provenance preserved", opts, async () => {
  const run = await engine();

  const request = makeRequest();
  request.assumptionSet.entries.push(usdEntry("unused_extra", "9.99")); // matches no formula input
  const outcome = run(request);
  assert.equal(outcome.status, "computed");

  const used = outcome.run.inputsUsed;
  assert.deepEqual(used.map((e: any) => e.key), ["a", "b"], "exactly the consumed entries, in formula input order");
  const a = used.find((e: any) => e.key === "a");
  assert.equal(a.provenance, "sourced");
  assert.equal(a.assumptionId, "as-a");
  assert.deepEqual(a.evidenceIds, ["ev-a"]);
  const b = used.find((e: any) => e.key === "b");
  assert.equal(b.provenance, "user_approved");

  assert.deepEqual(outcome.run.results.map((r: any) => r.key), ["total"]);
  for (const result of outcome.run.results) {
    assert.ok(!("provenance" in result), "calculated outputs never carry assumption provenance");
    assert.ok(!("assumptionId" in result), "calculated outputs are not assumptions");
  }
  assert.ok(!used.some((e: any) => e.key === "total"), "outputs never appear among consumed entries");
});

test("R5: not_computable names each exact failing field and never substitutes a default", opts, async () => {
  const run = await engine();

  const missingBoth = makeRequest();
  missingBoth.assumptionSet.entries = [];
  const outcome = run(missingBoth);
  assert.equal(outcome.status, "not_computable");
  for (const key of ["a", "b"]) {
    assert.ok(outcome.diagnostics.some((d: any) => d.code === "missing_input" && d.field === key));
  }
  assert.ok(!("run" in outcome), "no partial or defaulted result may accompany missing input");

  expectDiagnostic(run(ratioRequest("1", "0")), "division_by_zero", "ratio");
});

test("R6: every computed run records the full reproducibility metadata", opts, async () => {
  const run = await engine();

  const outcome = run(makeRequest());
  assert.equal(outcome.status, "computed");
  const record = outcome.run;

  assert.equal(record.calculationType, "fixture_weighted_sum");
  assert.equal(record.formulaVersion, "test-1");
  assert.equal(record.assumptionSetId, "aset-1");
  assert.equal(record.scenarioId, "scen-base");
  assert.equal(record.roundingPolicy, "half_up");
  assert.equal(record.suppliedAt, "2026-07-25T22:15:00Z");
  assert.match(record.inputHash, /^[0-9a-f]{64}$/);
  assert.equal(record.calculationRunId, `fixture_weighted_sum@test-1:${record.inputHash}`);

  const changed = makeRequest();
  changed.assumptionSet.entries[0].value = "2.676";
  const changedOutcome = run(changed);
  assert.notEqual(changedOutcome.run.inputHash, record.inputHash, "different input material must change the hash");
});

test("R7: identical validated requests produce identical outcomes, across a generated input space", opts, async () => {
  const run = await engine();

  assert.deepEqual(run(makeRequest()), run(makeRequest()));
  assert.deepEqual(run(ratioRequest("1", "0")), run(ratioRequest("1", "0")), "rejections are deterministic too");

  // Property: for any pair of two-decimal amounts, the engine's sum equals
  // exact integer-cent arithmetic. Seeded LCG keeps the test deterministic.
  let seed = 20260725n;
  const nextCents = (): bigint => {
    seed = (seed * 1103515245n + 12345n) % 2147483648n;
    return seed % 100000000n; // 0 .. 999,999.99 in cents
  };
  const centsToDecimal = (cents: bigint): string => {
    const whole = cents / 100n;
    const frac = (cents % 100n).toString().padStart(2, "0");
    return `${whole}.${frac}`;
  };

  for (let i = 0; i < 50; i += 1) {
    const aCents = nextCents();
    const bCents = nextCents();
    const outcome = run(sumRequest(centsToDecimal(aCents), centsToDecimal(bCents)));
    assert.equal(resultValue(outcome, "total"), centsToDecimal(aCents + bCents));
  }
});

test("R8 (negative): unapproved provenance is rejected and economics are never fabricated", opts, async () => {
  const run = await engine();

  const modelAuthored = makeRequest();
  modelAuthored.assumptionSet.entries[0].provenance = "model_estimated";
  const rejected = run(modelAuthored);
  expectDiagnostic(rejected, "invalid_provenance", "a");

  // With no accepted input there is no numeric output of any kind.
  const serialized = JSON.stringify(rejected);
  assert.ok(!serialized.includes('"results"'), "a rejected request yields no results collection");
  assert.ok(!serialized.includes('"total"'), "a rejected request yields no computed values");

  // An empty registry can never produce economics.
  const emptyRegistry = makeRequest({ registry: [] });
  expectDiagnostic(run(emptyRegistry), "unknown_formula", null);

  // The input itself is never mutated to make a request computable.
  const input = makeRequest();
  input.assumptionSet.entries = input.assumptionSet.entries.filter((e: any) => e.key !== "b");
  const snapshot = structuredClone(input);
  run(input);
  assert.deepEqual(input, snapshot, "input must not be mutated");
});
