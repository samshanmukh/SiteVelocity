import { FindingSchema, type Finding } from "../domain/schemas/core";
import { stableStringify } from "../calculations/registry";

export type SnapshotChangeKind = "added" | "changed" | "not_observed";

export interface SnapshotFindingChange {
  key: string;
  kind: SnapshotChangeKind;
  category: string;
  field: string;
  previous: Pick<Finding, "valueJson" | "status" | "evidenceLevel" | "confidence" | "impact" | "evidenceIds"> | null;
  current: Pick<Finding, "valueJson" | "status" | "evidenceLevel" | "confidence" | "impact" | "evidenceIds"> | null;
  material: boolean;
  summary: string;
}

export interface SnapshotDiff {
  fromSnapshotId: string | null;
  toSnapshotId: string;
  generatedAt: string;
  changes: SnapshotFindingChange[];
}

interface ComparableSnapshot {
  snapshot: { id: string; createdAt: string };
  findings: unknown[];
}

function keyOf(finding: Finding): string {
  return `${finding.category}:${finding.field}`;
}

function projection(finding: Finding): SnapshotFindingChange["current"] {
  return {
    valueJson: finding.valueJson,
    status: finding.status,
    evidenceLevel: finding.evidenceLevel,
    confidence: finding.confidence,
    impact: finding.impact,
    evidenceIds: finding.evidenceIds,
  };
}

function findingChanged(previous: Finding, current: Finding): boolean {
  return stableStringify(projection(previous)) !== stableStringify(projection(current));
}

function materialChange(previous: Finding | null, current: Finding | null): boolean {
  if (!current) return Boolean(previous && (previous.impact === "fatal_constraint" || previous.impact === "cost_timing_risk"));
  if (!previous) return current.status !== "unknown" || current.impact !== "unknown";
  return previous.status !== current.status
    || previous.impact !== current.impact
    || stableStringify(previous.valueJson) !== stableStringify(current.valueJson);
}

function changeSummary(kind: SnapshotChangeKind, previous: Finding | null, current: Finding | null): string {
  const field = (current ?? previous)!.field.replace(/_/g, " ");
  if (kind === "added") return `${field} was observed for the first time with status ${current!.status}.`;
  if (kind === "not_observed") return `${field} was not observed in the newer snapshot; this is not proof that the prior condition was resolved.`;
  return `${field} changed from ${previous!.status} to ${current!.status}.`;
}

/** Deterministic, provider-independent comparison of two accepted manifests. */
export function createSnapshotDiff(previous: ComparableSnapshot | null, current: ComparableSnapshot): SnapshotDiff {
  const previousFindings = previous ? FindingSchema.array().parse(previous.findings) : [];
  const currentFindings = FindingSchema.array().parse(current.findings);
  const priorByKey = new Map(previousFindings.map((finding) => [keyOf(finding), finding]));
  const currentByKey = new Map(currentFindings.map((finding) => [keyOf(finding), finding]));
  const keys = [...new Set([...priorByKey.keys(), ...currentByKey.keys()])].sort();
  const changes: SnapshotFindingChange[] = [];

  for (const key of keys) {
    const prior = priorByKey.get(key) ?? null;
    const next = currentByKey.get(key) ?? null;
    if (prior && next && !findingChanged(prior, next)) continue;
    const kind: SnapshotChangeKind = !prior ? "added" : !next ? "not_observed" : "changed";
    changes.push({
      key,
      kind,
      category: (next ?? prior)!.category,
      field: (next ?? prior)!.field,
      previous: prior ? projection(prior) : null,
      current: next ? projection(next) : null,
      material: materialChange(prior, next),
      summary: changeSummary(kind, prior, next),
    });
  }

  return {
    fromSnapshotId: previous?.snapshot.id ?? null,
    toSnapshotId: current.snapshot.id,
    generatedAt: current.snapshot.createdAt,
    changes,
  };
}
