import { z } from "zod";

/**
 * Core domain vocabulary from docs/SYSTEM_DESIGN.md §7.4.
 * These schemas are provider-independent; no sponsor SDK types may appear here.
 */

export const EvidenceLevel = z.enum([
  "document_verified",
  "gis_screened",
  "ai_researched",
  "professional_verification_required",
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;

export const FindingStatus = z.enum([
  "verified",
  "probable",
  "unknown",
  "conflicting",
]);
export type FindingStatus = z.infer<typeof FindingStatus>;

export const FindingImpact = z.enum([
  "opportunity",
  "cost_timing_risk",
  "fatal_constraint",
  "unknown",
]);
export type FindingImpact = z.infer<typeof FindingImpact>;

export const SourceRefSchema = z.object({
  agency: z.string().min(1),
  dataset: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceUrl: z.string().url(),
  retrievedAt: z.string().datetime({ offset: true }),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  source: SourceRefSchema,
  title: z.string().min(1),
  excerpt: z.string(),
  payload: z.unknown().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  category: z.string().min(1),
  field: z.string().min(1),
  valueJson: z.unknown(),
  status: FindingStatus,
  evidenceLevel: EvidenceLevel,
  confidence: z.number().min(0).max(1),
  impact: FindingImpact,
  evidenceIds: z.array(z.string().min(1)),
  note: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Finding = z.infer<typeof FindingSchema>;

export const AgentRunStatus = z.enum(["queued", "running", "complete", "failed"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const AgentRunSchema = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  agent: z.enum(["scout", "land_use", "development_history", "site_risk", "verifier", "next_best_action"]),
  status: AgentRunStatus,
  startedAt: z.string().datetime({ offset: true }).optional(),
  finishedAt: z.string().datetime({ offset: true }).optional(),
  sourcesUsed: z.number().int().min(0).default(0),
  summary: z.string().optional(),
  workflowRunId: z.string().optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const ResearchSnapshotSchema = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  status: z.enum(["complete", "partial", "failed"]),
  createdAt: z.string().datetime({ offset: true }),
  sourceCutoff: z.string().datetime({ offset: true }),
  evidenceIds: z.array(z.string()),
  findingIds: z.array(z.string()),
  agentRunIds: z.array(z.string()),
  schemaVersion: z.string().default("1"),
});
export type ResearchSnapshot = z.infer<typeof ResearchSnapshotSchema>;

export const NextActionSchema = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  role: z.string().min(1),
  knownFacts: z.array(z.string()),
  questions: z.array(z.string()),
  documents: z.array(z.string()),
  expectedFollowUp: z.string(),
  sourceFindingIds: z.array(z.string()),
});
export type NextAction = z.infer<typeof NextActionSchema>;
