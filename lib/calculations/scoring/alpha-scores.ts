import { z } from "zod";
import { registerCalculation } from "../registry";

/**
 * Alpha deterministic scores: Strategy Fit, Development Readiness, Evidence
 * Confidence (docs/SYSTEM_DESIGN.md §13). Physical feasibility and deal
 * potential are separate, persisted scenario calculations because their user-
 * declared inputs are not evidence-backed scoring facts. Scores expose signed
 * drivers and missing-input warnings; fatal flags are separate outputs and are
 * never averaged away.
 */

export const ScoreDriverSchema = z.object({
  delta: z.number(),
  reason: z.string().min(1),
});
export type ScoreDriver = z.infer<typeof ScoreDriverSchema>;

export const ScoreOutputSchema = z.object({
  score: z.number().min(0).max(100),
  drivers: z.array(ScoreDriverSchema),
  warnings: z.array(z.string()),
});
export type ScoreOutput = z.infer<typeof ScoreOutputSchema>;

function clampScore(base: number, drivers: ScoreDriver[]): number {
  const total = base + drivers.reduce((sum, d) => sum + d.delta, 0);
  return Math.max(0, Math.min(100, Math.round(total)));
}

// ---------------------------------------------------------------------------
// Strategy Fit — alignment with the buy box, from ingestion-time facts only.
// ---------------------------------------------------------------------------

export const StrategyFitInputSchema = z.object({
  jurisdictionCanonical: z.boolean().nullable(),
  parcelAcres: z.number().nullable(),
  sizeWindow: z.object({ min: z.number(), max: z.number() }),
  reportedCapacity: z.number().nullable(),
  preferredMinCapacity: z.number(),
  hasLocationIdentity: z.boolean(),
  fromAuthoritativeInventory: z.boolean(),
});
export type StrategyFitInput = z.infer<typeof StrategyFitInputSchema>;

export const strategyFit = registerCalculation<StrategyFitInput, ScoreOutput>({
  type: "strategy_fit",
  version: "1.0.0",
  inputSchema: StrategyFitInputSchema,
  outputSchema: ScoreOutputSchema,
  execute(input) {
    const drivers: ScoreDriver[] = [];
    const warnings: string[] = [];

    if (input.jurisdictionCanonical === true) {
      drivers.push({ delta: 30, reason: "Inside thesis market (San José)" });
    } else if (input.jurisdictionCanonical === false) {
      drivers.push({ delta: -30, reason: "Outside thesis market" });
    } else {
      warnings.push("Jurisdiction unknown — market alignment not scored");
    }

    if (input.parcelAcres === null) {
      warnings.push("Parcel acreage unknown — size alignment not scored");
    } else if (input.parcelAcres >= input.sizeWindow.min && input.parcelAcres <= input.sizeWindow.max) {
      drivers.push({ delta: 25, reason: `Parcel size inside ${input.sizeWindow.min}–${input.sizeWindow.max} ac window` });
    } else {
      drivers.push({ delta: -20, reason: "Parcel size outside thesis window" });
    }

    if (input.reportedCapacity === null) {
      warnings.push("Reported capacity unknown — density preference not scored");
    } else if (input.reportedCapacity >= input.preferredMinCapacity) {
      drivers.push({ delta: 25, reason: `Reported capacity ${input.reportedCapacity} units meets ${input.preferredMinCapacity}+ preference` });
    } else {
      drivers.push({ delta: 10, reason: `Reported capacity ${input.reportedCapacity} units below ${input.preferredMinCapacity}+ preference` });
    }

    if (input.hasLocationIdentity) {
      drivers.push({ delta: 10, reason: "Resolvable location identity (APN or coordinates)" });
    }
    if (input.fromAuthoritativeInventory) {
      drivers.push({ delta: 10, reason: "Sourced from an official government inventory" });
    }

    return { score: clampScore(0, drivers), drivers, warnings };
  },
});

// ---------------------------------------------------------------------------
// Development Readiness — remaining regulatory friction, alpha rules.
// ---------------------------------------------------------------------------

export const ReadinessInputSchema = z.object({
  zoningStatus: z.enum(["residential_supported", "unclear", "incompatible", "unknown"]),
  priorApproval: z.enum(["verified", "probable", "none_found", "unknown"]),
  permitActivity: z.enum(["active", "stalled", "none_found", "unknown"]),
  housingElementSite: z.boolean().nullable(),
});
export type ReadinessInput = z.infer<typeof ReadinessInputSchema>;

export const developmentReadiness = registerCalculation<ReadinessInput, ScoreOutput>({
  type: "development_readiness",
  version: "0.1.0",
  inputSchema: ReadinessInputSchema,
  outputSchema: ScoreOutputSchema,
  execute(input) {
    const drivers: ScoreDriver[] = [];
    const warnings: string[] = [];
    const base = 20; // every candidate starts with baseline friction assumed

    switch (input.zoningStatus) {
      case "residential_supported":
        drivers.push({ delta: 25, reason: "Zoning/land-use designation supports residential use" });
        break;
      case "incompatible":
        drivers.push({ delta: -20, reason: "Current zoning appears incompatible — re-entitlement required" });
        break;
      case "unclear":
        drivers.push({ delta: 5, reason: "Zoning identified but residential support unclear" });
        break;
      default:
        warnings.push("Zoning not yet researched");
    }

    switch (input.priorApproval) {
      case "verified":
        drivers.push({ delta: 30, reason: "Prior development approval verified in official records" });
        break;
      case "probable":
        drivers.push({ delta: 15, reason: "Prior approval indicated but unverified" });
        break;
      case "none_found":
        drivers.push({ delta: 0, reason: "No prior approval located (absence is not proof)" });
        break;
      default:
        warnings.push("Development history not yet researched");
    }

    switch (input.permitActivity) {
      case "stalled":
        drivers.push({ delta: 10, reason: "Permit path opened then stalled — approved-but-unbuilt signal" });
        break;
      case "active":
        drivers.push({ delta: -10, reason: "Active permits suggest owner is executing, not selling" });
        break;
      case "none_found":
        break;
      default:
        warnings.push("Permit activity not yet researched");
    }

    if (input.housingElementSite === true) {
      drivers.push({ delta: 15, reason: "Identified in the jurisdiction's Housing Element sites inventory" });
    } else if (input.housingElementSite === null) {
      warnings.push("Housing Element status unknown");
    }

    return { score: clampScore(base, drivers), drivers, warnings };
  },
});

// ---------------------------------------------------------------------------
// Evidence Confidence — authority, corroboration, conflicts, gaps.
// ---------------------------------------------------------------------------

export const EvidenceConfidenceInputSchema = z.object({
  documentVerified: z.number().int().min(0),
  gisScreened: z.number().int().min(0),
  aiResearched: z.number().int().min(0),
  verificationRequired: z.number().int().min(0),
  conflictingFindings: z.number().int().min(0),
  materialUnknowns: z.number().int().min(0),
});
export type EvidenceConfidenceInput = z.infer<typeof EvidenceConfidenceInputSchema>;

export const evidenceConfidence = registerCalculation<EvidenceConfidenceInput, ScoreOutput>({
  type: "evidence_confidence",
  version: "1.0.0",
  inputSchema: EvidenceConfidenceInputSchema,
  outputSchema: ScoreOutputSchema,
  execute(input) {
    const drivers: ScoreDriver[] = [];
    const warnings: string[] = [];

    drivers.push({ delta: Math.min(30, input.documentVerified * 15), reason: `${input.documentVerified} claim(s) document-verified from official records` });
    drivers.push({ delta: Math.min(24, input.gisScreened * 8), reason: `${input.gisScreened} claim(s) GIS-screened against authoritative layers` });
    drivers.push({ delta: Math.min(12, input.aiResearched * 4), reason: `${input.aiResearched} claim(s) AI-researched pending verification` });

    if (input.conflictingFindings > 0) {
      drivers.push({ delta: -8 * input.conflictingFindings, reason: `${input.conflictingFindings} conflicting finding(s) preserved` });
    } else {
      drivers.push({ delta: 10, reason: "No conflicting sources among retained findings" });
    }

    if (input.materialUnknowns > 0) {
      drivers.push({ delta: -6 * input.materialUnknowns, reason: `${input.materialUnknowns} material fact(s) still unknown` });
    }
    if (input.verificationRequired > 0) {
      warnings.push(`${input.verificationRequired} finding(s) require professional or field verification`);
    }
    const totalEvidence = input.documentVerified + input.gisScreened + input.aiResearched;
    if (totalEvidence === 0) {
      warnings.push("No research evidence collected yet — confidence reflects ingestion data only");
    }

    return { score: clampScore(20, drivers), drivers, warnings };
  },
});
