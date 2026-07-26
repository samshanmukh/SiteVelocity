import { pathToFileURL } from "node:url";
import { getIntegrationConfig } from "../lib/config/env";
import { configuredWorkflowEngine } from "../lib/providers/workflow";
import {
  attachProviderRun,
  createCandidateIngestionWorkflowRun,
  failWorkflowRun,
} from "../lib/workflows/workflow-store";
import { thesisRepositoryForOrganization } from "../lib/persistence/thesis-store";

export function scheduledIngestionIdempotencyKey(now = new Date()): string {
  return `scheduled-candidate-ingestion:${now.toISOString().slice(0, 10)}`;
}

export async function scheduleCandidateIngestion(now = new Date()) {
  const config = getIntegrationConfig();
  if (!config.SITEVELOCITY_ORGANIZATION_ID) throw new Error("SITEVELOCITY_ORGANIZATION_ID is required.");
  const configuredWorkflow = configuredWorkflowEngine(config, "ingest-candidates");
  if (!configuredWorkflow) throw new Error("The selected workflow provider is not configured.");

  const thesis = await thesisRepositoryForOrganization(config.SITEVELOCITY_ORGANIZATION_ID).getActive();
  const workflow = await createCandidateIngestionWorkflowRun({
    organizationId: config.SITEVELOCITY_ORGANIZATION_ID,
    userId: null,
    thesisId: thesis.id,
    idempotencyKey: scheduledIngestionIdempotencyKey(now),
    provider: configuredWorkflow.provider,
  });
  if (workflow.replayed) {
    console.log(`scheduled-ingestion: command ${workflow.id} already exists (${workflow.status})`);
    return workflow;
  }

  try {
    const providerRun = await configuredWorkflow.engine.start({
      organizationId: config.SITEVELOCITY_ORGANIZATION_ID,
      workflowRunId: workflow.id,
    });
    await attachProviderRun({
      organizationId: config.SITEVELOCITY_ORGANIZATION_ID,
      workflowRunId: workflow.id,
      providerRunId: providerRun.runId,
    });
    console.log(`scheduled-ingestion: queued command ${workflow.id}`);
    return { ...workflow, providerRunId: providerRun.runId };
  } catch (error) {
    try {
      await failWorkflowRun({
        organizationId: config.SITEVELOCITY_ORGANIZATION_ID,
        workflowRunId: workflow.id,
        code: "SCHEDULED_DISPATCH_FAILED",
      });
    } catch {
      // Preserve the dispatch error as the primary failure.
    }
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  scheduleCandidateIngestion().catch((error) => {
    console.error(`scheduled-ingestion: failed (${error instanceof Error ? error.message : "unknown failure"})`);
    process.exitCode = 1;
  });
}
