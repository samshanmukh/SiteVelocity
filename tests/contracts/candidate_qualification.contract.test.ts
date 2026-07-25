import assert from "node:assert/strict";
import test from "node:test";
import { generatedModulePath, importGenerated, skipReason } from "./load_generated";

// Contract tests for prompts/modules/candidate_qualification_typescript.prompt.
// Test names begin with the contract rule ID they verify (R1–R11).

const MODULE = "candidate_qualification";
const modulePath = generatedModulePath(MODULE);
const opts = modulePath ? {} : { skip: skipReason(MODULE) };

type AnyFn = (input: unknown) => any;

async function qualifier(): Promise<AnyFn> {
  const mod = await importGenerated(modulePath as string);
  const fn = mod.qualifyCandidate as AnyFn;
  assert.equal(typeof fn, "function", "module must export qualifyCandidate");
  return fn;
}

const source = {
  agency: "California HCD",
  dataset: "sites-inventory-2026",
  sourceRecordId: "HCD-000123",
  sourceUrl: "https://data.hcd.ca.gov/sites/000123",
  retrievedAt: "2026-07-20T18:00:00Z",
};

const knownCandidate = {
  source,
  jurisdiction: { status: "known", value: { value: "San José", resolution: "canonical" } },
  county: { status: "known", value: "Santa Clara" },
  address: { status: "known", value: "150 Tully Rd" },
  apn: { status: "known", value: "12345678" },
  parcelAcres: { status: "known", value: 3.25 },
  reportedCapacity: { status: "known", value: 120 },
  coordinates: { status: "known", value: { latitude: 37.3123, longitude: -121.8456 } },
};

const baselineRuleSet = {
  version: "sj-alpha-1",
  rules: [
    { id: "jurisdiction", kind: "jurisdiction_canonical" },
    { id: "county", kind: "county_equals", value: "santa clara" },
    { id: "acres", kind: "numeric_range", field: "parcelAcres", min: 0.5, max: 10 },
    { id: "location", kind: "location_identity_present" },
  ],
};

function makeInput(): any {
  return structuredClone({ candidate: knownCandidate, ruleSet: baselineRuleSet });
}

function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key.toLowerCase());
      collectKeys(nested, keys);
    }
  }
  return keys;
}

test("R1: returns exactly one decided or invalid_rule_set result and never throws", opts, async () => {
  const qualify = await qualifier();

  const decided = qualify(makeInput());
  assert.equal(decided.status, "decided");
  assert.ok(["qualified", "disqualified", "needs_review"].includes(decided.decision.state));

  const invalid = makeInput();
  invalid.ruleSet.rules = [];
  assert.equal(qualify(invalid).status, "invalid_rule_set");
});

test("R2: invalid rule sets produce stable error codes and no decision", opts, async () => {
  const qualify = await qualifier();

  const empty = makeInput();
  empty.ruleSet.rules = [];
  const emptyResult = qualify(empty);
  assert.equal(emptyResult.status, "invalid_rule_set");
  assert.ok(emptyResult.errors.some((e: any) => e.code === "empty_rule_set"));
  assert.equal(emptyResult.decision, undefined);

  const duplicate = makeInput();
  duplicate.ruleSet.rules.push({ id: "acres", kind: "numeric_range", field: "parcelAcres", min: 1, max: 2 });
  assert.ok(qualify(duplicate).errors.some((e: any) => e.code === "duplicate_rule_id"));

  const inverted = makeInput();
  inverted.ruleSet.rules[2].min = 20;
  inverted.ruleSet.rules[2].max = 10;
  assert.ok(qualify(inverted).errors.some((e: any) => e.code === "inverted_bounds"));
});

test("R3: exactly one reason per declared rule, each with a stable outcome code", opts, async () => {
  const qualify = await qualifier();
  const result = qualify(makeInput());

  assert.equal(result.status, "decided");
  const reasons = result.decision.reasons;
  assert.equal(reasons.length, baselineRuleSet.rules.length);
  assert.deepEqual(
    reasons.map((r: any) => r.ruleId).sort(),
    baselineRuleSet.rules.map((r) => r.id).sort(),
  );
  for (const reason of reasons) {
    assert.ok(["satisfied", "violated", "unknown"].includes(reason.outcome));
  }
});

test("R4: violated requires a known value failing the declared condition", opts, async () => {
  const qualify = await qualifier();

  const failing = makeInput();
  failing.candidate.parcelAcres = { status: "known", value: 0.3 }; // below min 0.5
  const violated = qualify(failing);
  assert.equal(violated.decision.reasons.find((r: any) => r.ruleId === "acres").outcome, "violated");

  const unknownFact = makeInput();
  unknownFact.candidate.parcelAcres = { status: "unknown", reasonCode: "missing_value" };
  const notViolated = qualify(unknownFact);
  assert.equal(notViolated.decision.reasons.find((r: any) => r.ruleId === "acres").outcome, "unknown");
});

test("R5: unknown facts and unresolved jurisdiction produce unknown outcomes", opts, async () => {
  const qualify = await qualifier();

  const unresolved = makeInput();
  unresolved.candidate.jurisdiction = { status: "known", value: { value: "Los Gatos", resolution: "unresolved" } };
  const result = qualify(unresolved);
  assert.equal(result.decision.reasons.find((r: any) => r.ruleId === "jurisdiction").outcome, "unknown");

  const unknownCounty = makeInput();
  unknownCounty.candidate.county = { status: "unknown", reasonCode: "missing_mapping" };
  const countyResult = qualify(unknownCounty);
  assert.equal(countyResult.decision.reasons.find((r: any) => r.ruleId === "county").outcome, "unknown");
});

test("R6: disqualified exactly on a violation or an unknown with onUnknown disqualify", opts, async () => {
  const qualify = await qualifier();

  const violation = makeInput();
  violation.candidate.parcelAcres = { status: "known", value: 50 }; // above max 10
  assert.equal(qualify(violation).decision.state, "disqualified");

  const strictUnknown = makeInput();
  strictUnknown.ruleSet.rules[1].onUnknown = "disqualify";
  strictUnknown.candidate.county = { status: "unknown", reasonCode: "missing_value" };
  assert.equal(qualify(strictUnknown).decision.state, "disqualified");
});

test("R7: unknown outcomes without a disqualifying rule route to needs_review", opts, async () => {
  const qualify = await qualifier();

  const input = makeInput();
  input.candidate.county = { status: "unknown", reasonCode: "missing_value" };
  const result = qualify(input);
  assert.equal(result.decision.state, "needs_review");
});

test("R8: qualified exactly when every rule is satisfied; decision carries the rule-set version", opts, async () => {
  const qualify = await qualifier();
  const result = qualify(makeInput());

  assert.equal(result.decision.state, "qualified");
  assert.equal(result.decision.ruleSetVersion, "sj-alpha-1");
  assert.ok(result.decision.reasons.every((r: any) => r.outcome === "satisfied"));
});

test("R9: structurally identical inputs produce identical output", opts, async () => {
  const qualify = await qualifier();
  assert.deepEqual(qualify(makeInput()), qualify(makeInput()));
});

test("R10 (negative): the decision contains no score, rank, priority, or ordering", opts, async () => {
  const qualify = await qualifier();
  const result = qualify(makeInput());

  const keys = collectKeys(result);
  for (const forbidden of ["score", "rank", "ranking", "priority", "order", "ordering", "weight"]) {
    assert.ok(!keys.has(forbidden), `decision must not contain a "${forbidden}" key`);
  }
});

test("R11 (negative): input is never mutated and unknown is not disqualifying by default", opts, async () => {
  const qualify = await qualifier();

  const input = makeInput();
  input.candidate.parcelAcres = { status: "unknown", reasonCode: "missing_value" };
  const snapshot = structuredClone(input);

  const result = qualify(input);
  assert.deepEqual(input, snapshot, "input must not be mutated");
  assert.notEqual(result.decision.state, "disqualified");
  assert.equal(result.decision.state, "needs_review");
});
