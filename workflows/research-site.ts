import { task } from "@renderinc/sdk/workflows";
import { z } from "zod";
import { runtimeStoreForOrganization } from "../lib/persistence/runtime-store";
import { researchSite } from "../lib/research/pipeline";
import {
  completeWorkflowRun,
  failWorkflowRun,
  markWorkflowRunning,
} from "../lib/workflows/workflow-store";
import { workspaceSettingsRepositoryForOrganization } from "../lib/persistence/workspace-settings-store";

const ResearchSiteTaskInputSchema = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().trim().min(1).max(200),
  workflowRunId: z.string().uuid(),
});

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
async function runResearchSiteTask(rawInput: unknown): Promise<{
  snapshotId: string;
  status: string;
  evidenceCount: number;
  findingCount: number;
}> {
  const input = ResearchSiteTaskInputSchema.parse(rawInput);
  const existing = await markWorkflowRunning(input.organizationId, input.workflowRunId);
  if (existing?.status === "succeeded" && existing.output && typeof existing.output === "object" && !Array.isArray(existing.output)) {
    return existing.output as {
      snapshotId: string;
      status: string;
      evidenceCount: number;
      findingCount: number;
    };
  }
  const store = runtimeStoreForOrganization(input.organizationId);
  try {
    const set = await store.loadCandidateSet();
    const site = set?.sites.find((s) => s.id === input.siteId);
    if (!site) {
      throw new Error(`Unknown site ${input.siteId}; run ingestion first.`);
    }
    const settings = await workspaceSettingsRepositoryForOrganization(input.organizationId).get();
    const bundle = await researchSite(site, {
      settings,
      persist: (snapshotBundle) => store.saveSnapshotBundle(snapshotBundle, { workflowRunId: input.workflowRunId }),
    });
    const result = {
      snapshotId: bundle.snapshot.id,
      status: bundle.snapshot.status,
      evidenceCount: bundle.evidence.length,
      findingCount: bundle.findings.length,
    };
    await completeWorkflowRun({
      organizationId: input.organizationId,
      workflowRunId: input.workflowRunId,
      status: bundle.snapshot.status === "complete" ? "succeeded" : "partial",
      output: result,
    });
    return result;
  } catch (error) {
    try {
      await failWorkflowRun({
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId,
        code: error instanceof z.ZodError ? "INVALID_TASK_INPUT" : "RESEARCH_FAILED",
      });
    } catch {
      // Preserve the original task error so Render retries the correct failure.
    }
    throw error;
  }
}

/** Registered by Render during workflow release and executable locally without a task context. */
export const researchSiteTask = task(
  {
    name: "researchSite",
    retry: { maxRetries: 3, waitDurationMs: 2_000, backoffScaling: 2 },
    timeoutSeconds: 3_600,
    plan: "starter",
  },
  runResearchSiteTask,
);
