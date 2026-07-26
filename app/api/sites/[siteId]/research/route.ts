import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getIntegrationConfig } from "@/lib/config/env";
import { runtimeStoreForOrganization } from "@/lib/persistence/runtime-store";
import { RenderWorkflowEngine } from "@/lib/providers/render";
import { researchSite } from "@/lib/research/pipeline";
import { requestContextErrorResponse, resolveRequestContext, type RequestContext } from "@/lib/security/request-context";
import {
  attachProviderRun,
  createResearchWorkflowRun,
  failWorkflowRun,
  WorkflowCommandError,
} from "@/lib/workflows/workflow-store";

export const dynamic = "force-dynamic";

const IdempotencyKeySchema = z.string().trim().min(8).max(255);

/**
 * Start (or refresh) research for one site. Alpha runs the pipeline in-process;
 * the same pipeline is exposed to Render Workflows via workflows/research-site.
 * A failed run records diagnostics and never replaces the active snapshot.
 */
export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  let context: RequestContext;
  try {
    context = await resolveRequestContext(request, "write");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  const { siteId } = await params;
  const store = runtimeStoreForOrganization(context.organizationId);
  const set = await store.loadCandidateSet();
  const site = set?.sites.find((s) => s.id === siteId);
  if (!site) {
    return NextResponse.json({ error: `Unknown site ${siteId}` }, { status: 404 });
  }

  const config = getIntegrationConfig();
  if (!context.demoMode) {
    const parsedKey = IdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!parsedKey.success) {
      return NextResponse.json(
        { error: "A valid Idempotency-Key header is required." },
        { status: 400, headers: { "X-Request-Id": requestId } },
      );
    }
    if (!config.RENDER_API_KEY || !config.RENDER_WORKFLOW_TASK_SLUG) {
      return NextResponse.json(
        { error: "The durable research workflow is not configured." },
        { status: 503, headers: { "X-Request-Id": requestId } },
      );
    }

    let createdWorkflowId: string | null = null;
    try {
      const workflow = await createResearchWorkflowRun({
        organizationId: context.organizationId,
        userId: context.userId,
        externalSiteId: siteId,
        idempotencyKey: parsedKey.data,
      });
      createdWorkflowId = workflow.id;
      if (workflow.replayed) {
        return NextResponse.json(workflow, {
          status: 202,
          headers: { "Cache-Control": "no-store, private", "X-Request-Id": requestId },
        });
      }

      const engine = new RenderWorkflowEngine(config.RENDER_API_KEY, config.RENDER_WORKFLOW_TASK_SLUG);
      const providerRun = await engine.start({
        organizationId: context.organizationId,
        siteId,
        workflowRunId: workflow.id,
      });
      await attachProviderRun({
        organizationId: context.organizationId,
        workflowRunId: workflow.id,
        providerRunId: providerRun.runId,
      });
      return NextResponse.json(
        { ...workflow, providerRunId: providerRun.runId },
        { status: 202, headers: { "Cache-Control": "no-store, private", "X-Request-Id": requestId } },
      );
    } catch (error) {
      if (error instanceof WorkflowCommandError) {
        const status = error.code === "idempotency_conflict" ? 409 : error.code === "site_not_found" ? 404 : 503;
        return NextResponse.json({ error: error.code }, { status, headers: { "X-Request-Id": requestId } });
      }
      if (createdWorkflowId) {
        try {
          await failWorkflowRun({
            organizationId: context.organizationId,
            workflowRunId: createdWorkflowId,
            code: "DISPATCH_FAILED",
          });
        } catch {
          // Preserve the provider error; a later status reconciliation can repair the row.
        }
      }
      console.error("durable site research dispatch failed", { siteId, requestId, error });
      return NextResponse.json(
        { error: "Research could not be queued." },
        { status: 502, headers: { "X-Request-Id": requestId } },
      );
    }
  }

  try {
    const bundle = await researchSite(site, { persist: store.saveSnapshotBundle });
    return NextResponse.json(
      {
        snapshotId: bundle.snapshot.id,
        status: bundle.snapshot.status,
        evidence: bundle.evidence.length,
        findings: bundle.findings.length,
      },
      { headers: { "X-Request-Id": requestId } },
    );
  } catch (error) {
    console.error("site research failed", { siteId, requestId, error });
    return NextResponse.json(
      { error: "Research run failed; the previous valid snapshot remains active." },
      { status: 502, headers: { "X-Request-Id": requestId } },
    );
  }
}
