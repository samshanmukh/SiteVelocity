import assert from "node:assert/strict";
import test from "node:test";
import { calculateFeasibility, type FeasibilityAssumptions } from "../../lib/domain/feasibility";

const assumptions: FeasibilityAssumptions = {
  setbackPercent: 0.15,
  nonBuildablePercent: 0.1,
  far: 2.5,
  densityUnitsPerAcre: 80,
  maxStories: 5,
  parkingSpacesPerUnit: 0.75,
  averageUnitSqFt: 850,
  residentialEfficiency: 0.82,
  landPrice: 8_000_000,
  hardCostPerGrossSqFt: 350,
  softCostPercent: 0.25,
  monthlyRentPerUnit: 3_200,
  monthlyOtherIncomePerUnit: 150,
  operatingExpensePercent: 0.32,
  exitCapRate: 0.05,
  loanToCost: 0.65,
  annualInterestRate: 0.065,
  targetProfitMargin: 0.15,
};

test("computes envelope, yield, and underwriting deterministically", () => {
  const first = calculateFeasibility({ parcelAcres: 2, fatalConstraintCount: 0, materialUnknownCount: 1 }, assumptions);
  const second = calculateFeasibility({ parcelAcres: 2, fatalConstraintCount: 0, materialUnknownCount: 1 }, assumptions);
  assert.deepEqual(first, second);
  assert.equal(first.envelope.grossParcelSqFt, 87_120);
  assert.equal(first.yield.units, 160);
  assert.ok(first.underwriting.totalDevelopmentCost > assumptions.landPrice);
  assert.ok(["pursue", "hold", "pass"].includes(first.investmentCommittee.recommendation));
});

test("potential fatal constraints force a pass without averaging away the flag", () => {
  const result = calculateFeasibility({ parcelAcres: 2, fatalConstraintCount: 1, materialUnknownCount: 0 }, assumptions);
  assert.equal(result.investmentCommittee.recommendation, "pass");
  assert.match(result.investmentCommittee.reasons.join(" "), /fatal constraint/i);
});

test("rejects invalid assumptions and missing sourced acreage", () => {
  assert.throws(() => calculateFeasibility(
    { parcelAcres: 2, fatalConstraintCount: 0, materialUnknownCount: 0 },
    { ...assumptions, setbackPercent: 0.7, nonBuildablePercent: 0.3 },
  ));
  assert.throws(() => calculateFeasibility(
    { parcelAcres: 0, fatalConstraintCount: 0, materialUnknownCount: 0 },
    assumptions,
  ));
});
