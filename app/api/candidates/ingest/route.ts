import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getIntegrationConfig } from "@/lib/config/env";
import { runtimeStoreForOrganization } from "@/lib/persistence/runtime-store";
import { configuredWorkflowEngine } from "@/lib/providers/workflow";
import { requestContextErrorResponse, resolveRequestContext, type RequestContext } from "@/lib/security/request-context";
import { ingestCandidates } from "@/scripts/ingest-candidates";
import {
  attachProviderRun,
  createCandidateIngestionWorkflowRun,
  failWorkflowRun,
  WorkflowCommandError,
} from "@/lib/workflows/workflow-store";
import { thesisRepositoryForOrganization } from "@/lib/persistence/thesis-store";

export const dynamic = "force-dynamic";

const IdempotencyKeySchema = z.string().trim().min(8).max(255);

export async function POST(request: Request) {
  let context: RequestContext;
  try {
    context = await resolveRequestContext(request, "admin");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  const config = getIntegrationConfig();
  const thesis = await thesisRepositoryForOrganization(context.organizationId).getActive();

  if (context.demoMode) {
    try {
      const candidates = await ingestCandidates({
        store: runtimeStoreForOrganization(context.organizationId),
        thesis,
        log: (message) => console.log(message),
      });
      return NextResponse.json(candidates.funnel, { headers: { "X-Request-Id": requestId } });
    } catch (error) {
      console.error("candidate ingestion failed", { requestId, error });
      return NextResponse.json({ error: "Candidate ingestion failed." }, { status: 502, headers: { "X-Request-Id": requestId } });
    }
  }

  const parsedKey = IdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!parsedKey.success) {
    return NextResponse.json({ error: "A valid Idempotency-Key header is required." }, { status: 400, headers: { "X-Request-Id": requestId } });
  }
  const configuredWorkflow = configuredWorkflowEngine(config, "ingest-candidates");
  if (!configuredWorkflow) {
    return NextResponse.json({ error: "The durable ingestion workflow is not configured." }, { status: 503, headers: { "X-Request-Id": requestId } });
  }

  let workflowRunId: string | null = null;
  try {
    const workflow = await createCandidateIngestionWorkflowRun({
      organizationId: context.organizationId,
      userId: context.userId,
      thesisId: thesis.id,
      idempotencyKey: parsedKey.data,
      provider: configuredWorkflow.provider,
    });
    workflowRunId = workflow.id;
    if (workflow.replayed) {
      return NextResponse.json(workflow, { status: 202, headers: { "Cache-Control": "no-store, private", "X-Request-Id": requestId } });
    }

    const providerRun = await configuredWorkflow.engine.start({ organizationId: context.organizationId, workflowRunId: workflow.id });
    await attachProviderRun({ organizationId: context.organizationId, workflowRunId: workflow.id, providerRunId: providerRun.runId });
    return NextResponse.json(
      { ...workflow, providerRunId: providerRun.runId },
      { status: 202, headers: { "Cache-Control": "no-store, private", "X-Request-Id": requestId } },
    );
  } catch (error) {
    if (error instanceof WorkflowCommandError) {
      const status = error.code === "idempotency_conflict" ? 409 : 503;
      return NextResponse.json({ error: error.code }, { status, headers: { "X-Request-Id": requestId } });
    }
    if (workflowRunId) {
      try {
        await failWorkflowRun({ organizationId: context.organizationId, workflowRunId, code: "DISPATCH_FAILED" });
      } catch {
        // Preserve the dispatch error; status reconciliation can repair the row later.
      }
    }
    console.error("candidate ingestion dispatch failed", { requestId, error });
    return NextResponse.json({ error: "Candidate ingestion could not be queued." }, { status: 502, headers: { "X-Request-Id": requestId } });
  }
}
