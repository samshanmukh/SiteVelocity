import { task } from "@renderinc/sdk/workflows";
import { z } from "zod";
import { runtimeStoreForOrganization } from "../lib/persistence/runtime-store";
import { ingestCandidates } from "../scripts/ingest-candidates";
import {
  completeWorkflowRun,
  failWorkflowRun,
  markWorkflowRunning,
} from "../lib/workflows/workflow-store";
import { thesisRepositoryForOrganization } from "../lib/persistence/thesis-store";

const IngestCandidatesTaskInputSchema = z.object({
  organizationId: z.string().uuid(),
  workflowRunId: z.string().uuid(),
});

async function runIngestCandidatesTask(rawInput: unknown) {
  const input = IngestCandidatesTaskInputSchema.parse(rawInput);
  const existing = await markWorkflowRunning(input.organizationId, input.workflowRunId);
  if (existing?.status === "succeeded" && existing.output && typeof existing.output === "object" && !Array.isArray(existing.output)) {
    return existing.output;
  }

  try {
    const store = runtimeStoreForOrganization(input.organizationId);
    const thesis = await thesisRepositoryForOrganization(input.organizationId).getActive();
    const candidates = await ingestCandidates({
      store,
      organizationId: input.organizationId,
      thesis,
      log: (message) => console.log(message),
    });
    const output = {
      generatedAt: candidates.generatedAt,
      thesisId: candidates.thesisId,
      rawRecords: candidates.funnel.rawRecords,
      enriched: candidates.funnel.enriched,
      qualified: candidates.funnel.qualified,
      shortlisted: candidates.funnel.shortlisted,
    };
    await completeWorkflowRun({
      organizationId: input.organizationId,
      workflowRunId: input.workflowRunId,
      status: "succeeded",
      output,
    });
    return output;
  } catch (error) {
    try {
      await failWorkflowRun({
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId,
        code: "INGESTION_FAILED",
      });
    } catch {
      // Preserve the source failure so Render retries the correct exception.
    }
    throw error;
  }
}

export const ingestCandidatesTask = task(
  {
    name: "ingestCandidates",
    retry: { maxRetries: 3, waitDurationMs: 5_000, backoffScaling: 2 },
    timeoutSeconds: 3_600,
    plan: "starter",
  },
  runIngestCandidatesTask,
);
