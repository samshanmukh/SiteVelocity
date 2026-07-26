import { z } from "zod";

export const FeasibilityAssumptionsSchema = z.object({
  setbackPercent: z.number().min(0).max(0.8),
  nonBuildablePercent: z.number().min(0).max(0.8),
  far: z.number().min(0.1).max(20),
  densityUnitsPerAcre: z.number().min(1).max(1_000),
  maxStories: z.number().int().min(1).max(100),
  parkingSpacesPerUnit: z.number().min(0).max(5),
  averageUnitSqFt: z.number().min(200).max(3_000),
  residentialEfficiency: z.number().min(0.4).max(0.95),
  landPrice: z.number().min(0).max(1_000_000_000),
  hardCostPerGrossSqFt: z.number().min(50).max(2_000),
  softCostPercent: z.number().min(0).max(1),
  monthlyRentPerUnit: z.number().min(0).max(20_000),
  monthlyOtherIncomePerUnit: z.number().min(0).max(5_000),
  operatingExpensePercent: z.number().min(0).max(0.95),
  exitCapRate: z.number().min(0.01).max(0.2),
  loanToCost: z.number().min(0).max(0.95),
  annualInterestRate: z.number().min(0).max(0.3),
  targetProfitMargin: z.number().min(0).max(0.5),
}).strict().refine(
  (value) => value.setbackPercent + value.nonBuildablePercent < 0.95,
  { message: "Combined land deductions must leave at least five percent of the parcel." },
);
export type FeasibilityAssumptions = z.infer<typeof FeasibilityAssumptionsSchema>;

export const CreateFeasibilityScenarioSchema = z.object({
  name: z.string().trim().min(1).max(120),
  assumptions: FeasibilityAssumptionsSchema,
}).strict();
export type CreateFeasibilityScenario = z.infer<typeof CreateFeasibilityScenarioSchema>;

export interface FeasibilityContext {
  parcelAcres: number;
  fatalConstraintCount: number;
  materialUnknownCount: number;
}

export interface FeasibilityOutputs {
  envelope: {
    grossParcelSqFt: number;
    setbackDeductionSqFt: number;
    nonBuildableDeductionSqFt: number;
    netBuildableSiteSqFt: number;
    maxEnvelopeGrossSqFt: number;
  };
  yield: {
    zoningFarGrossSqFt: number;
    grossBuildingSqFt: number;
    unitsByArea: number;
    unitsByDensity: number;
    units: number;
    parkingSpaces: number;
  };
  underwriting: {
    landCost: number;
    hardCost: number;
    softCost: number;
    totalDevelopmentCost: number;
    annualGrossRevenue: number;
    stabilizedNoi: number;
    stabilizedValue: number;
    yieldOnCost: number;
    valueMargin: number;
    debt: number;
    equity: number;
    annualInterest: number;
    equityMultipleAtStabilization: number | null;
    residualLandValueBeforeTargetProfit: number;
  };
  investmentCommittee: {
    recommendation: "pursue" | "hold" | "pass";
    reasons: string[];
  };
  warnings: string[];
}

export const FeasibilityOutputsSchema: z.ZodType<FeasibilityOutputs> = z.object({
  envelope: z.object({
    grossParcelSqFt: z.number().nonnegative(),
    setbackDeductionSqFt: z.number().nonnegative(),
    nonBuildableDeductionSqFt: z.number().nonnegative(),
    netBuildableSiteSqFt: z.number().nonnegative(),
    maxEnvelopeGrossSqFt: z.number().nonnegative(),
  }).strict(),
  yield: z.object({
    zoningFarGrossSqFt: z.number().nonnegative(),
    grossBuildingSqFt: z.number().nonnegative(),
    unitsByArea: z.number().int().nonnegative(),
    unitsByDensity: z.number().int().nonnegative(),
    units: z.number().int().nonnegative(),
    parkingSpaces: z.number().int().nonnegative(),
  }).strict(),
  underwriting: z.object({
    landCost: z.number(),
    hardCost: z.number(),
    softCost: z.number(),
    totalDevelopmentCost: z.number(),
    annualGrossRevenue: z.number(),
    stabilizedNoi: z.number(),
    stabilizedValue: z.number(),
    yieldOnCost: z.number(),
    valueMargin: z.number(),
    debt: z.number(),
    equity: z.number(),
    annualInterest: z.number(),
    equityMultipleAtStabilization: z.number().nullable(),
    residualLandValueBeforeTargetProfit: z.number(),
  }).strict(),
  investmentCommittee: z.object({
    recommendation: z.enum(["pursue", "hold", "pass"]),
    reasons: z.array(z.string()),
  }).strict(),
  warnings: z.array(z.string()),
}).strict();

function round(value: number, precision = 2): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function calculateFeasibility(
  context: FeasibilityContext,
  rawAssumptions: FeasibilityAssumptions,
): FeasibilityOutputs {
  const assumptions = FeasibilityAssumptionsSchema.parse(rawAssumptions);
  if (!Number.isFinite(context.parcelAcres) || context.parcelAcres <= 0) {
    throw new Error("A positive, sourced parcel acreage is required.");
  }
  const grossParcelSqFt = context.parcelAcres * 43_560;
  const setbackDeductionSqFt = grossParcelSqFt * assumptions.setbackPercent;
  const nonBuildableDeductionSqFt = grossParcelSqFt * assumptions.nonBuildablePercent;
  const netBuildableSiteSqFt = grossParcelSqFt - setbackDeductionSqFt - nonBuildableDeductionSqFt;
  const maxEnvelopeGrossSqFt = netBuildableSiteSqFt * assumptions.maxStories;
  const zoningFarGrossSqFt = grossParcelSqFt * assumptions.far;
  const grossBuildingSqFt = Math.max(0, Math.min(maxEnvelopeGrossSqFt, zoningFarGrossSqFt));
  const unitsByArea = Math.floor(
    (grossBuildingSqFt * assumptions.residentialEfficiency) / assumptions.averageUnitSqFt,
  );
  const unitsByDensity = Math.floor(context.parcelAcres * assumptions.densityUnitsPerAcre);
  const units = Math.max(0, Math.min(unitsByArea, unitsByDensity));
  const parkingSpaces = Math.ceil(units * assumptions.parkingSpacesPerUnit);

  const landCost = assumptions.landPrice;
  const hardCost = grossBuildingSqFt * assumptions.hardCostPerGrossSqFt;
  const softCost = hardCost * assumptions.softCostPercent;
  const totalDevelopmentCost = landCost + hardCost + softCost;
  const annualGrossRevenue = units
    * (assumptions.monthlyRentPerUnit + assumptions.monthlyOtherIncomePerUnit)
    * 12;
  const stabilizedNoi = annualGrossRevenue * (1 - assumptions.operatingExpensePercent);
  const stabilizedValue = stabilizedNoi / assumptions.exitCapRate;
  const yieldOnCost = totalDevelopmentCost > 0 ? stabilizedNoi / totalDevelopmentCost : 0;
  const valueMargin = totalDevelopmentCost > 0 ? (stabilizedValue - totalDevelopmentCost) / totalDevelopmentCost : 0;
  const debt = totalDevelopmentCost * assumptions.loanToCost;
  const equity = totalDevelopmentCost - debt;
  const annualInterest = debt * assumptions.annualInterestRate;
  const equityMultipleAtStabilization = equity > 0 ? (stabilizedValue - debt) / equity : null;
  const residualLandValueBeforeTargetProfit = stabilizedValue - hardCost - softCost;

  const warnings = [
    "Screening scenario only: setbacks, non-buildable area, FAR, density, costs, rents, financing, and cap rate are user assumptions unless separately evidenced.",
    "Parking area, circulation, open space, unit mix, impact fees, construction phasing, taxes, and sale costs are not modeled in this preliminary scenario.",
  ];
  if (context.materialUnknownCount > 0) warnings.push(`${context.materialUnknownCount} material research unknown(s) remain open.`);

  const reasons: string[] = [];
  let recommendation: "pursue" | "hold" | "pass";
  const spread = yieldOnCost - assumptions.exitCapRate;
  if (context.fatalConstraintCount > 0 || units === 0 || valueMargin < 0) {
    recommendation = "pass";
    if (context.fatalConstraintCount > 0) reasons.push(`${context.fatalConstraintCount} potential fatal constraint(s) remain.`);
    if (units === 0) reasons.push("The declared assumptions produce no units.");
    if (valueMargin < 0) reasons.push("Stabilized value is below modeled development cost.");
  } else if (
    context.materialUnknownCount <= 2
    && spread >= 0.015
    && valueMargin >= assumptions.targetProfitMargin
  ) {
    recommendation = "pursue";
    reasons.push(`Yield-on-cost spread is ${round(spread * 10_000, 0)} bps above the exit cap rate.`);
    reasons.push(`Modeled value margin meets the ${(assumptions.targetProfitMargin * 100).toFixed(1)}% target.`);
  } else {
    recommendation = "hold";
    if (context.materialUnknownCount > 2) reasons.push("Too many material facts remain unresolved for an investment decision.");
    if (spread < 0.015) reasons.push("Yield-on-cost spread is below the 150 bps screening threshold.");
    if (valueMargin < assumptions.targetProfitMargin) reasons.push("Modeled value margin is below the declared target.");
  }

  return {
    envelope: {
      grossParcelSqFt: round(grossParcelSqFt),
      setbackDeductionSqFt: round(setbackDeductionSqFt),
      nonBuildableDeductionSqFt: round(nonBuildableDeductionSqFt),
      netBuildableSiteSqFt: round(netBuildableSiteSqFt),
      maxEnvelopeGrossSqFt: round(maxEnvelopeGrossSqFt),
    },
    yield: {
      zoningFarGrossSqFt: round(zoningFarGrossSqFt),
      grossBuildingSqFt: round(grossBuildingSqFt),
      unitsByArea,
      unitsByDensity,
      units,
      parkingSpaces,
    },
    underwriting: {
      landCost: round(landCost),
      hardCost: round(hardCost),
      softCost: round(softCost),
      totalDevelopmentCost: round(totalDevelopmentCost),
      annualGrossRevenue: round(annualGrossRevenue),
      stabilizedNoi: round(stabilizedNoi),
      stabilizedValue: round(stabilizedValue),
      yieldOnCost: round(yieldOnCost, 6),
      valueMargin: round(valueMargin, 6),
      debt: round(debt),
      equity: round(equity),
      annualInterest: round(annualInterest),
      equityMultipleAtStabilization: equityMultipleAtStabilization === null ? null : round(equityMultipleAtStabilization, 4),
      residualLandValueBeforeTargetProfit: round(residualLandValueBeforeTargetProfit),
    },
    investmentCommittee: { recommendation, reasons },
    warnings,
  };
}

export const FeasibilityScenarioSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().min(1),
  name: z.string().min(1),
  assumptions: FeasibilityAssumptionsSchema,
  outputs: FeasibilityOutputsSchema,
  calculationVersion: z.literal("1.0.0"),
  createdAt: z.string().datetime({ offset: true }),
});
export type FeasibilityScenario = z.infer<typeof FeasibilityScenarioSchema>;
