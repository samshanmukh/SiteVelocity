import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { CandidateSetSchema, type CandidateSet } from "../domain/site";
import { ResearchSnapshotSchema, type ResearchSnapshot } from "../domain/schemas/core";
import { createSnapshotDiff, type SnapshotDiff } from "../research/snapshot-diff";
import { stableStringify } from "../calculations/registry";

/**
 * File-based persistence for the Alpha demo path. Snapshots and candidate
 * sets are committed JSON so the demo loads without any external service
 * (DEMO_MODE). The Supabase-backed store can replace this behind the same
 * functions without touching callers.
 */

const DATA_DIR = join(process.cwd(), "data");

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function saveCandidateSet(set: CandidateSet): Promise<void> {
  await writeJson(join(DATA_DIR, "candidates.json"), CandidateSetSchema.parse(set));
}

export async function loadCandidateSet(): Promise<CandidateSet | null> {
  const raw = await readJson(join(DATA_DIR, "candidates.json"));
  if (raw === null) return null;
  const parsed = CandidateSetSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveRawSourcePage(dataset: string, page: number, payload: unknown): Promise<string> {
  const path = join(DATA_DIR, "source-records", dataset, `page-${String(page).padStart(3, "0")}.json`);
  await writeJson(path, payload);
  return path;
}

export interface SnapshotBundle {
  snapshot: ResearchSnapshot;
  evidence: unknown[];
  findings: unknown[];
  agentRuns: unknown[];
  scores: Record<string, unknown>;
  nextAction: unknown | null;
  timeline: unknown[];
  changes?: SnapshotDiff;
}

export interface SnapshotWriteContext {
  /** Existing durable command that produced this snapshot. */
  workflowRunId?: string;
}

function snapshotDir(siteId: string): string {
  return join(DATA_DIR, "sites", siteId, "snapshots");
}

export async function saveSnapshotBundle(
  bundle: SnapshotBundle,
  context?: SnapshotWriteContext,
): Promise<void> {
  void context;
  ResearchSnapshotSchema.parse(bundle.snapshot);
  const path = join(snapshotDir(bundle.snapshot.siteId), `${bundle.snapshot.id}.json`);
  const existing = await readJson(path);
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    const { changes: _existingChanges, ...existingCore } = existing as SnapshotBundle;
    void _existingChanges;
    if (stableStringify(existingCore) !== stableStringify(bundle)) {
      throw new Error("Snapshot version conflicts with different content.");
    }
    return;
  }
  const previous = await loadActiveSnapshot(bundle.snapshot.siteId);
  const persisted = {
    ...bundle,
    changes: createSnapshotDiff(previous, bundle),
  };
  await writeJson(path, persisted);
}

/**
 * Read path per docs/SYSTEM_DESIGN.md §17.1: latest complete snapshot first,
 * otherwise the latest partial one. Failed refresh output never becomes the
 * active snapshot.
 */
export async function loadActiveSnapshot(siteId: string): Promise<SnapshotBundle | null> {
  let files: string[];
  try {
    files = (await readdir(snapshotDir(siteId))).filter((f) => f.endsWith(".json")).sort().reverse();
  } catch {
    return null;
  }
  let bestPartial: SnapshotBundle | null = null;
  for (const file of files) {
    const raw = await readJson(join(snapshotDir(siteId), file));
    if (raw === null || typeof raw !== "object") continue;
    const bundle = raw as SnapshotBundle;
    const parsed = ResearchSnapshotSchema.safeParse(bundle.snapshot);
    if (!parsed.success) continue;
    if (parsed.data.status === "complete") return bundle;
    if (parsed.data.status === "partial" && bestPartial === null) bestPartial = bundle;
  }
  return bestPartial;
}

export async function listResearchedSiteIds(): Promise<string[]> {
  try {
    return await readdir(join(DATA_DIR, "sites"));
  } catch {
    return [];
  }
}
