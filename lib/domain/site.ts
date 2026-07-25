import { z } from "zod";
import { EvidenceSchema } from "./schemas/core";
import type { QualificationResult } from "./buy-box";
import type { ScoreOutput } from "../calculations/scoring/alpha-scores";
import type { CalculationRun } from "../calculations/registry";

/**
 * Assembled candidate site: the merge of one or more normalized source
 * records for the same (jurisdiction, APN), plus explicitly-labeled derived
 * values. Derivations are never presented as source facts — each carries its
 * method and the evidence it was derived from.
 */

export const DerivedNumberSchema = z.object({
  value: z.number(),
  method: z.string().min(1),
  evidenceId: z.string().min(1),
});

export const DerivedPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  method: z.string().min(1),
  evidenceId: z.string().min(1),
});

export const CandidateSiteSchema = z.object({
  id: z.string().min(1),
  apn: z.string().min(1),
  apnFormatted: z.string().min(1),
  jurisdiction: z.string().min(1),
  county: z.string().nullable(),
  address: z.string().nullable(),
  acresDerived: DerivedNumberSchema.nullable(),
  coordinates: DerivedPointSchema.nullable(),
  zoningAbbr: z.string().nullable(),
  vacant: z.boolean().nullable(),
  /** City of San José AB 2011 screening flags, verbatim from the source. */
  cityScreens: z.record(z.string(), z.string()),
  evidence: z.array(EvidenceSchema),
  qualification: z.custom<QualificationResult>(),
  strategyFit: z.custom<CalculationRun<ScoreOutput>>(),
  rank: z.number().int().min(1),
  scoutReasons: z.array(z.string()),
});
export type CandidateSite = z.infer<typeof CandidateSiteSchema>;

export const CandidateSetSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  thesisId: z.string().min(1),
  funnel: z.object({
    rawRecords: z.number().int().min(0),
    enriched: z.number().int().min(0),
    qualified: z.number().int().min(0),
    shortlisted: z.number().int().min(0),
  }),
  sources: z.array(z.object({
    agency: z.string(),
    dataset: z.string(),
    url: z.string(),
    retrievedAt: z.string(),
    recordCount: z.number().int().min(0),
  })),
  sites: z.array(CandidateSiteSchema),
});
export type CandidateSet = z.infer<typeof CandidateSetSchema>;

export function formatApn(apn: string): string {
  // Santa Clara County APNs are 8 digits displayed as XXX-XX-XXX.
  const digits = apn.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return apn;
}
