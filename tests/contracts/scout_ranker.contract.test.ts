import assert from "node:assert/strict";
import test from "node:test";
import { generatedModulePath, importGenerated, skipReason } from "./load_generated";

// Contract tests for prompts/modules/scout_ranker_typescript.prompt.
// Test names begin with the contract rule ID they verify (R1–R7).
//
// The scoring policies below are test fixtures only. They are NOT the approved
// Alpha scoring policy; per the prompt's acceptance gate, approved weights,
// caps, and tie-breakers arrive later as a versioned policy artifact.

const MODULE = "scout_ranker";
const modulePath = generatedModulePath(MODULE);
const opts = modulePath ? {} : { skip: skipReason(MODULE) };

type AnyFn = (input: unknown) => any;

async function ranker(): Promise<AnyFn> {
  const mod = await importGenerated(modulePath as string);
  const fn = mod.rankCandidates as AnyFn;
  assert.equal(typeof fn, "function", "module must export rankCandidates");
  return fn;
}

const source = {
  agency: "California HCD",
  dataset: "sites-inventory-2026",
  sourceRecordId: "HCD-000123",
  sourceUrl: "https://data.hcd.ca.gov/sites/000123",
  retrievedAt: "2026-07-20T18:00:00Z",
};

function makeFacts(acres: number, capacity: number): any {
  return {
    source,
    jurisdiction: { status: "known", value: { value: "San José", resolution: "canonical" } },
    county: { status: "known", value: "Santa Clara" },
    address: { status: "known", value: "150 Tully Rd" },
    apn: { status: "known", value: "12345678" },
    parcelAcres: { status: "known", value: acres },
    reportedCapacity: { status: "known", value: capacity },
    coordinates: { status: "known", value: { latitude: 37.3123, longitude: -121.8456 } },
  };
}

function makeFinding(overrides: Record<string, unknown> = {}): any {
  return {
    id: "fnd-ent-1",
    siteId: "site-1",
    category: "development_history",
    field: "entitlement_status",
    valueJson: "approved planned development",
    status: "verified",
    evidenceLevel: "document_verified",
    confidence: 0.9,
    impact: "opportunity",
    evidenceIds: ["ev-1"],
    ...overrides,
  };
}

function makeCandidate(id: string, acres: number, capacity: number, findings: any[]): any {
  return {
    candidateId: id,
    qualification: { state: "qualified", ruleSetVersion: "sj-alpha-1" },
    facts: makeFacts(acres, capacity),
    findings,
  };
}

// Test-fixture policy (not the approved Alpha policy).
const policyP1: any = {
  policyVersion: "rank-test-fixture-1",
  status: "approved",
  components: [
    {
      component: "strategy_fit",
      weight: 0.5,
      cap: 100,
      features: [
        {
          featureId: "f_acres",
          weight: 2,
          onUnscorable: "omit_and_warn",
          source: { kind: "numeric_fact", field: "parcelAcres" },
          scoring: {
            kind: "bands",
            bands: [
              { min: 0.5, max: 10, points: 1 },
              { min: 11, max: 100, points: 0.25 },
            ],
          },
        },
        {
          featureId: "f_capacity",
          weight: 1,
          onUnscorable: "zero_and_warn",
          source: { kind: "numeric_fact", field: "reportedCapacity" },
          scoring: {
            kind: "bands",
            bands: [
              { min: 100, max: 10000, points: 1 },
              { min: 1, max: 99, points: 0.5 },
            ],
          },
        },
      ],
    },
    {
      component: "development_readiness",
      weight: 0.3,
      cap: 80,
      features: [
        {
          featureId: "f_entitlement",
          weight: 1,
          onUnscorable: "omit_and_warn",
          source: { kind: "finding", category: "development_history", field: "entitlement_status" },
          scoring: { kind: "status_points", points: { verified: 1, probable: 0.6 } },
        },
      ],
    },
    {
      component: "evidence_confidence",
      weight: 0.2,
      cap: 100,
      features: [
        {
          featureId: "f_evidence",
          weight: 1,
          onUnscorable: "omit_and_warn",
          source: { kind: "finding", category: "development_history", field: "entitlement_status" },
          scoring: {
            kind: "evidence_level_points",
            points: {
              document_verified: 1,
              gis_screened: 0.7,
              ai_researched: 0.4,
              professional_verification_required: 0.2,
            },
          },
        },
      ],
    },
  ],
  tieBreakers: [{ kind: "candidate_id_asc" }],
};

// Candidate A: acres 3.25 -> 1, capacity 120 -> 1, verified/document_verified finding.
//   strategy = ((2*1)+(1*1))/3 * 100 = 100; readiness = min(100, 80) = 80; evidence = 100.
//   total = 0.5*100 + 0.3*80 + 0.2*100 = 94.
// Candidate B: acres 8 -> 1, capacity 60 -> 0.5, probable/ai_researched finding.
//   strategy = ((2*1)+(1*0.5))/3 * 100 = 83.333...; readiness = 60; evidence = 40.
//   total = 0.5*(250/3) + 0.3*60 + 0.2*40 = 67.666...
const TOTAL_A = 0.5 * 100 + 0.3 * 80 + 0.2 * 100;
const TOTAL_B = 0.5 * (250 / 3) + 0.3 * 60 + 0.2 * 40;

function candidateA(): any {
  return makeCandidate("cand-a", 3.25, 120, [makeFinding()]);
}

function candidateB(): any {
  return makeCandidate("cand-b", 8, 60, [
    makeFinding({ id: "fnd-ent-2", status: "probable", evidenceLevel: "ai_researched", evidenceIds: ["ev-2"] }),
  ]);
}

function makeInput(candidates?: any[]): any {
  return structuredClone({
    candidates: candidates ?? [candidateA(), candidateB()],
    thesisRef: { thesisId: "thesis-sj-mf", thesisVersion: "1" },
    policy: policyP1,
    suppliedAt: "2026-07-25T22:00:00Z",
  });
}

function closeTo(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

function componentScore(candidate: any, name: string): any {
  const found = candidate.components.find((c: any) => c.component === name);
  assert.ok(found, `component ${name} must be present`);
  return found;
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

test("R1: exactly one ranked or rejected result with stable rejection codes; never throws", opts, async () => {
  const rank = await ranker();

  const ranked = rank(makeInput());
  assert.equal(ranked.status, "ranked");

  const draft = makeInput();
  draft.policy.status = "draft";
  const draftResult = rank(draft);
  assert.equal(draftResult.status, "rejected");
  assert.ok(draftResult.errors.some((e: any) => e.code === "unapproved_policy"));

  const unqualified = makeInput();
  unqualified.candidates[1].qualification.state = "needs_review";
  const unqualifiedResult = rank(unqualified);
  assert.equal(unqualifiedResult.status, "rejected");
  assert.ok(
    unqualifiedResult.errors.some((e: any) => e.code === "unqualified_candidate" && e.candidateId === "cand-b"),
  );

  const duplicate = makeInput([candidateA(), candidateA()]);
  const duplicateResult = rank(duplicate);
  assert.equal(duplicateResult.status, "rejected");
  assert.ok(duplicateResult.errors.some((e: any) => e.code === "duplicate_candidate_id" && e.candidateId === "cand-a"));

  const badWeights = makeInput();
  badWeights.policy.components[0].weight = 0.4; // 0.4 + 0.3 + 0.2 = 0.9
  const badWeightsResult = rank(badWeights);
  assert.equal(badWeightsResult.status, "rejected");
  assert.ok(
    badWeightsResult.errors.some((e: any) => e.code === "invalid_policy" && e.detail === "weights_not_normalized"),
  );

  const overlapping = makeInput();
  overlapping.policy.components[0].features[0].scoring.bands = [
    { min: 0.5, max: 10, points: 1 },
    { min: 9, max: 20, points: 0.25 },
  ];
  const overlappingResult = rank(overlapping);
  assert.equal(overlappingResult.status, "rejected");
  assert.ok(
    overlappingResult.errors.some((e: any) => e.code === "invalid_policy" && e.detail === "overlapping_bands"),
  );
});

test("R2: golden component scores, weighted totals, caps, and tie-breaks from the declared policy", opts, async () => {
  const rank = await ranker();
  const result = rank(makeInput());
  assert.equal(result.status, "ranked");

  const [first, second] = result.ranking;
  assert.equal(first.candidateId, "cand-a");
  assert.equal(second.candidateId, "cand-b");

  closeTo(componentScore(first, "strategy_fit").score, 100, "A strategy_fit");
  closeTo(componentScore(first, "development_readiness").score, 80, "A readiness capped at 80");
  closeTo(componentScore(first, "evidence_confidence").score, 100, "A evidence");
  closeTo(first.totalScore, TOTAL_A, "A total");

  closeTo(componentScore(second, "strategy_fit").score, 250 / 3, "B strategy_fit");
  closeTo(componentScore(second, "development_readiness").score, 60, "B readiness");
  closeTo(componentScore(second, "evidence_confidence").score, 40, "B evidence");
  closeTo(second.totalScore, TOTAL_B, "B total");

  // Tie-breaking: equal totals fall to the declared tie-breakers, in order.
  const tiePolicy = structuredClone(policyP1);
  tiePolicy.components[0].weight = 1;
  tiePolicy.components[1].weight = 0;
  tiePolicy.components[2].weight = 0;
  tiePolicy.tieBreakers = [
    { kind: "component_score", component: "evidence_confidence" },
    { kind: "candidate_id_asc" },
  ];

  const strong = makeFinding(); // document_verified -> evidence 100
  const weak = makeFinding({ id: "fnd-ent-3", evidenceLevel: "ai_researched", evidenceIds: ["ev-3"] }); // -> 40
  const tieInput = structuredClone({
    candidates: [
      makeCandidate("cand-f", 3.25, 120, [structuredClone(weak)]),
      makeCandidate("cand-h", 3.25, 120, [structuredClone(weak)]),
      makeCandidate("cand-z", 3.25, 120, [structuredClone(strong)]),
      makeCandidate("cand-g", 3.25, 120, [structuredClone(weak)]),
    ],
    thesisRef: { thesisId: "thesis-sj-mf", thesisVersion: "1" },
    policy: tiePolicy,
    suppliedAt: "2026-07-25T22:00:00Z",
  });

  const tied = rank(tieInput);
  assert.equal(tied.status, "ranked");
  // All totals equal; cand-z wins the evidence_confidence tie-break, the rest order by candidate ID.
  assert.deepEqual(
    tied.ranking.map((c: any) => c.candidateId),
    ["cand-z", "cand-f", "cand-g", "cand-h"],
  );
  assert.deepEqual(tied.ranking.map((c: any) => c.rank), [1, 2, 3, 4]);
});

test("R3: unscorable inputs follow the declared onUnscorable policy and always warn", opts, async () => {
  const rank = await ranker();

  // omit_and_warn: unknown acres is excluded from numerator and denominator.
  const omit = makeInput([candidateA()]);
  omit.candidates[0].facts.parcelAcres = { status: "unknown", reasonCode: "missing_value" };
  const omitResult = rank(omit);
  assert.equal(omitResult.status, "ranked");
  const omitCand = omitResult.ranking[0];
  closeTo(componentScore(omitCand, "strategy_fit").score, 100, "capacity alone scores 100");
  const omitContribution = componentScore(omitCand, "strategy_fit").contributions.find(
    (c: any) => c.featureId === "f_acres",
  );
  assert.equal(omitContribution.outcome, "omitted");
  assert.equal(omitContribution.points, null);
  assert.ok(
    omitResult.warnings.some(
      (w: any) => w.code === "unknown_fact" && w.candidateId === "cand-a" && w.featureId === "f_acres",
    ),
    "omission must warn; unknown handling is never silent",
  );

  // zero_and_warn: unknown capacity contributes zero points but keeps its weight.
  const zero = makeInput([candidateA()]);
  zero.candidates[0].facts.reportedCapacity = { status: "unknown", reasonCode: "missing_value" };
  const zeroResult = rank(zero);
  const zeroCand = zeroResult.ranking[0];
  closeTo(componentScore(zeroCand, "strategy_fit").score, (2 / 3) * 100, "zeroed capacity dilutes the component");
  const zeroContribution = componentScore(zeroCand, "strategy_fit").contributions.find(
    (c: any) => c.featureId === "f_capacity",
  );
  assert.equal(zeroContribution.outcome, "zeroed");
  assert.equal(zeroContribution.points, 0);
  assert.ok(
    zeroResult.warnings.some(
      (w: any) => w.code === "unknown_fact" && w.candidateId === "cand-a" && w.featureId === "f_capacity",
    ),
    "zeroing is allowed only because the feature declares zero_and_warn, and it must warn",
  );

  // Missing findings: both finding features omit, leaving unscorable components at 0 with warnings.
  const missing = makeInput([makeCandidate("cand-mf", 3.25, 120, [])]);
  const missingResult = rank(missing);
  const missingCand = missingResult.ranking[0];
  closeTo(componentScore(missingCand, "development_readiness").score, 0, "unscorable component is 0");
  assert.ok(missingResult.warnings.some((w: any) => w.code === "missing_finding" && w.featureId === "f_entitlement"));
  assert.ok(
    missingResult.warnings.some(
      (w: any) => w.code === "component_not_scorable" && w.component === "development_readiness",
    ),
  );

  // Conflicting finding status is unscorable for both status and evidence-level scoring.
  const conflicting = makeInput([
    makeCandidate("cand-cf", 3.25, 120, [makeFinding({ id: "fnd-ent-4", status: "conflicting" })]),
  ]);
  const conflictingResult = rank(conflicting);
  assert.ok(
    conflictingResult.warnings.some(
      (w: any) => w.code === "conflicting_finding" && w.featureId === "f_entitlement" && w.findingIds.includes("fnd-ent-4"),
    ),
    "conflicts are surfaced, never silently resolved",
  );
});

test("R4: material findings surface as flags and never move any score", opts, async () => {
  const rank = await ranker();

  const flagged = candidateA();
  flagged.findings.push(
    makeFinding({
      id: "fnd-risk-1",
      category: "site_risk",
      field: "flood_zone",
      status: "verified",
      evidenceLevel: "gis_screened",
      impact: "fatal_constraint",
      evidenceIds: ["ev-9"],
    }),
    makeFinding({
      id: "fnd-title-1",
      category: "title",
      field: "easement",
      status: "probable",
      evidenceLevel: "ai_researched",
      impact: "cost_timing_risk",
      evidenceIds: ["ev-10"],
    }),
  );

  const result = rank(makeInput([flagged]));
  assert.equal(result.status, "ranked");
  const cand = result.ranking[0];

  const impacts = cand.materialFlags.map((f: any) => [f.findingId, f.impact]);
  assert.deepEqual(impacts.sort(), [
    ["fnd-risk-1", "fatal_constraint"],
    ["fnd-title-1", "cost_timing_risk"],
  ].sort());
  assert.ok(
    !cand.materialFlags.some((f: any) => f.findingId === "fnd-ent-1"),
    "opportunity findings are not material flags",
  );

  // The fatal flag stays visible while the score is untouched: identical to unflagged candidate A.
  closeTo(cand.totalScore, TOTAL_A, "flags never dilute or adjust the weighted score");
  assert.equal(cand.rank, 1);
});

test("R5: every contribution and reason traces to input fact fields or finding IDs", opts, async () => {
  const rank = await ranker();
  const input = makeInput();
  const inputFindingIds = new Set<string>(
    input.candidates.flatMap((c: any) => c.findings.map((f: any) => f.id)),
  );
  const policyFeatureIds = new Set<string>(
    input.policy.components.flatMap((c: any) => c.features.map((f: any) => f.featureId)),
  );

  const result = rank(input);
  assert.equal(result.status, "ranked");

  for (const candidate of result.ranking) {
    for (const component of candidate.components) {
      for (const contribution of component.contributions) {
        assert.ok(policyFeatureIds.has(contribution.featureId));
        if (contribution.source.kind === "finding") {
          if (contribution.outcome === "scored") {
            assert.equal(contribution.findingIds.length, 1, "a scored finding feature traces to its matched finding");
          }
          for (const id of contribution.findingIds) assert.ok(inputFindingIds.has(id));
        } else {
          assert.deepEqual(contribution.findingIds, []);
          assert.ok(["parcelAcres", "reportedCapacity"].includes(contribution.source.field));
        }
      }

      const scored = component.contributions.filter((c: any) => c.outcome === "scored");
      for (const contribution of scored) {
        const reason = candidate.reasons.find((r: any) => r.featureId === contribution.featureId);
        assert.ok(reason, `scored feature ${contribution.featureId} must have a reason`);
        for (const id of reason.findingIds) assert.ok(inputFindingIds.has(id));
        assert.ok(typeof reason.summary === "string" && reason.summary.length > 0);
      }
    }
  }
});

test("R6: identical input produces identical output; ranks are dense and the hash is stable", opts, async () => {
  const rank = await ranker();

  const first = rank(makeInput());
  const second = rank(makeInput());
  assert.deepEqual(first, second);

  assert.equal(first.status, "ranked");
  assert.match(first.inputHash, /^[0-9a-f]{64}$/);
  assert.equal(first.policyVersion, "rank-test-fixture-1");
  assert.equal(first.suppliedAt, "2026-07-25T22:00:00Z");
  assert.deepEqual(first.ranking.map((c: any) => c.rank), [1, 2]);

  const changed = makeInput();
  changed.candidates[0].facts.reportedCapacity = { status: "known", value: 121 };
  const changedResult = rank(changed);
  assert.notEqual(changedResult.inputHash, first.inputHash, "different input material must change the input hash");
});

test("R7 (negative): never mutates input, restates facts, or emits financial or conclusive metrics", opts, async () => {
  const rank = await ranker();

  const input = makeInput();
  const snapshot = structuredClone(input);
  const result = rank(input);
  assert.deepEqual(input, snapshot, "input must not be mutated");

  assert.equal(result.status, "ranked");
  const keys = collectKeys(result);
  for (const forbidden of [
    "irr",
    "npv",
    "noi",
    "dscr",
    "ltv",
    "ltc",
    "cashflow",
    "proforma",
    "valuation",
    "buildable",
    "investmentquality",
  ]) {
    assert.ok(!keys.has(forbidden), `ranking output must not contain a "${forbidden}" key`);
  }
  assert.ok(!keys.has("valuejson"), "findings are echoed by identifier only, never restated");
});
