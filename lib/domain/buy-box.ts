import { z } from "zod";
import type { CanonicalCandidate, Fact } from "./candidate-normalizer";

/**
 * Development Buy Box (Alpha thesis) and the deterministic qualification filter.
 * Filter semantics come from docs/SYSTEM_DESIGN.md §10.2:
 * county = Santa Clara; jurisdiction normalizes to San José; 0.5 <= acres <= 10;
 * prefer capacity >= 100 units; location identity required.
 * Unknown facts never silently disqualify preference criteria (P2) — they reduce
 * priority, they do not fabricate a "fails" answer.
 */

const DevelopmentThesisFieldsSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  market: z.string().min(1),
  county: z.string().min(1),
  strategy: z.string().min(1),
  minAcres: z.number().positive(),
  maxAcres: z.number().positive(),
  preferredMinCapacity: z.number().int().positive(),
}).strict();

const validAcreageWindow = (value: { minAcres: number; maxAcres: number }) => value.maxAcres > value.minAcres;

export const DevelopmentThesisSchema = DevelopmentThesisFieldsSchema.refine(validAcreageWindow, {
  message: "Maximum acreage must be greater than minimum acreage.",
  path: ["maxAcres"],
});
export type DevelopmentThesis = z.infer<typeof DevelopmentThesisSchema>;

export const UpdateDevelopmentThesisSchema = DevelopmentThesisFieldsSchema.omit({ id: true }).strict().refine(validAcreageWindow, {
  message: "Maximum acreage must be greater than minimum acreage.",
  path: ["maxAcres"],
});
export type UpdateDevelopmentThesis = z.infer<typeof UpdateDevelopmentThesisSchema>;

export const ALPHA_THESIS: DevelopmentThesis = {
  id: "thesis-sj-multifamily-v1",
  name: "San José Multifamily / Mixed-Use Redevelopment",
  market: "San José, CA",
  county: "Santa Clara",
  strategy: "Multifamily & mixed-use residential redevelopment",
  minAcres: 0.5,
  maxAcres: 10,
  preferredMinCapacity: 100,
};

export interface QualificationResult {
  qualified: boolean;
  reasons: string[];
  exclusions: string[];
  unknowns: string[];
}

export interface QualificationValues {
  jurisdictionCanonical: boolean | null;
  jurisdictionLabel: string | null;
  county: string | null;
  acres: number | null;
  capacity: number | null;
  hasLocationIdentity: boolean;
}

function known<T>(fact: Fact<T>): T | undefined {
  return fact.status === "known" ? fact.value : undefined;
}

/** Shared deterministic qualification rules over plain values. */
export function qualifyValues(values: QualificationValues, thesis: DevelopmentThesis): QualificationResult {
  const reasons: string[] = [];
  const exclusions: string[] = [];
  const unknowns: string[] = [];

  if (values.jurisdictionCanonical === null) {
    unknowns.push("Jurisdiction not established by source");
  } else if (!values.jurisdictionCanonical) {
    exclusions.push(`Jurisdiction "${values.jurisdictionLabel ?? "unknown"}" is outside the ${thesis.market} thesis`);
  } else {
    reasons.push("Jurisdiction matches thesis market (San José)");
  }

  if (values.county && values.county.toLowerCase() !== thesis.county.toLowerCase()) {
    exclusions.push(`County "${values.county}" is outside ${thesis.county}`);
  }

  if (values.acres === null) {
    unknowns.push("Parcel acreage unknown — cannot confirm size window");
  } else if (values.acres < thesis.minAcres || values.acres > thesis.maxAcres) {
    exclusions.push(`Parcel ${values.acres.toFixed(2)} ac is outside the ${thesis.minAcres}–${thesis.maxAcres} ac window`);
  } else {
    reasons.push(`Parcel size ${values.acres.toFixed(2)} ac inside the ${thesis.minAcres}–${thesis.maxAcres} ac window`);
  }

  if (values.capacity === null) {
    unknowns.push("Reported unit capacity unknown");
  } else if (values.capacity >= thesis.preferredMinCapacity) {
    reasons.push(`Reported capacity ${values.capacity} units meets the ${thesis.preferredMinCapacity}+ preference`);
  } else {
    reasons.push(`Reported capacity ${values.capacity} units (below the ${thesis.preferredMinCapacity}+ preference)`);
  }

  if (!values.hasLocationIdentity) {
    exclusions.push("No resolvable location identity");
  }

  return { qualified: exclusions.length === 0, reasons, exclusions, unknowns };
}

export function qualifyCandidate(candidate: CanonicalCandidate, thesis: DevelopmentThesis): QualificationResult {
  const jurisdiction = known(candidate.jurisdiction);
  return qualifyValues(
    {
      jurisdictionCanonical: jurisdiction ? jurisdiction.resolution === "canonical" : null,
      jurisdictionLabel: jurisdiction?.value ?? null,
      county: known(candidate.county) ?? null,
      acres: known(candidate.parcelAcres) ?? null,
      capacity: known(candidate.reportedCapacity) ?? null,
      hasLocationIdentity: candidate.coordinates.status === "known" || candidate.apn.status === "known",
    },
    thesis,
  );
}
