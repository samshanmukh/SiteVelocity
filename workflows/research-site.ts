import { loadCandidateSet } from "../lib/persistence/file-store";
import { researchSite } from "../lib/research/pipeline";

/**
 * Render Workflows task body: research one site end to end and persist a
 * Research Snapshot. Engine-agnostic — the same function backs the API route,
 * the CLI, and the Render task, so the demo path and the orchestration path
 * can never drift apart.
 *
 * Wire-up: after `render workflows init` scaffolds this directory's harness,
 * register `researchSiteTask` as the task exposed by RENDER_WORKFLOW_TASK_SLUG
 * and start it via WorkflowEngine.start (lib/providers/render.ts) with
 * `[{ siteId }]` as the input array.
 */
export async function researchSiteTask(input: { siteId: string }): Promise<{
  snapshotId: string;
  status: string;
  evidenceCount: number;
  findingCount: number;
}> {
  const set = await loadCandidateSet();
  const site = set?.sites.find((s) => s.id === input.siteId);
  if (!site) {
    throw new Error(`Unknown site ${input.siteId}; run ingestion first.`);
  }
  const bundle = await researchSite(site);
  return {
    snapshotId: bundle.snapshot.id,
    status: bundle.snapshot.status,
    evidenceCount: bundle.evidence.length,
    findingCount: bundle.findings.length,
  };
}
