import "server-only";

import { createHash } from "node:crypto";
import type { Json } from "@/lib/persistence/database.types";
import { deterministicUuid } from "@/lib/persistence/identity";
import { createSupabaseAdminClient } from "@/lib/persistence/supabase/admin";

export type WorkflowRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "partial";

export interface ResearchWorkflowRun {
  id: string;
  idempotencyId: string;
  organizationId: string;
  externalSiteId: string;
  status: WorkflowRunStatus;
  provider: string;
  providerRunId: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  output: Json | null;
  error: Json | null;
  replayed: boolean;
}

export class WorkflowCommandError extends Error {
  override readonly name = "WorkflowCommandError";

  constructor(
    readonly code: "idempotency_conflict" | "site_not_found" | "persistence_failed",
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

function requestHash(organizationId: string, externalSiteId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ operation: "research_site", organizationId, externalSiteId }))
    .digest("hex");
}

function asRun(
  row: {
    id: string;
    idempotency_id: string;
    organization_id: string;
    status: WorkflowRunStatus;
    provider: string;
    provider_run_id: string | null;
    requested_at: string;
    started_at: string | null;
    finished_at: string | null;
    input: Json;
    output: Json | null;
    error: Json | null;
  },
  replayed: boolean,
): ResearchWorkflowRun {
  const input = row.input && typeof row.input === "object" && !Array.isArray(row.input)
    ? row.input as Record<string, Json | undefined>
    : {};
  return {
    id: row.id,
    idempotencyId: row.idempotency_id,
    organizationId: row.organization_id,
    externalSiteId: typeof input.siteId === "string" ? input.siteId : "unknown",
    status: row.status,
    provider: row.provider,
    providerRunId: row.provider_run_id,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    output: row.output,
    error: row.error,
    replayed,
  };
}

const RUN_COLUMNS = "id,idempotency_id,organization_id,status,provider,provider_run_id,requested_at,started_at,finished_at,input,output,error" as const;

export async function createResearchWorkflowRun(input: {
  organizationId: string;
  userId: string | null;
  externalSiteId: string;
  idempotencyKey: string;
}): Promise<ResearchWorkflowRun> {
  const client = createSupabaseAdminClient();
  const hash = requestHash(input.organizationId, input.externalSiteId);
  const siteId = deterministicUuid(input.organizationId, `site:${input.externalSiteId}`);
  const { data: site, error: siteError } = await client
    .from("sites")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("id", siteId)
    .maybeSingle();
  if (siteError) throw new WorkflowCommandError("persistence_failed");
  if (!site) throw new WorkflowCommandError("site_not_found");

  const { data: existingKey, error: keyReadError } = await client
    .from("workflow_idempotency")
    .select("id,request_hash")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (keyReadError) throw new WorkflowCommandError("persistence_failed");
  if (existingKey && existingKey.request_hash !== hash) {
    throw new WorkflowCommandError("idempotency_conflict");
  }

  const idempotencyId = existingKey?.id
    ?? deterministicUuid(input.organizationId, `workflow-idempotency:${input.idempotencyKey}`);
  if (!existingKey) {
    const { error } = await client.from("workflow_idempotency").insert({
      id: idempotencyId,
      organization_id: input.organizationId,
      idempotency_key: input.idempotencyKey,
      operation: "research_site",
      request_hash: hash,
      requested_by: input.userId,
    });
    if (error) {
      if (error.code === "23505") {
        return createResearchWorkflowRun(input);
      }
      throw new WorkflowCommandError("persistence_failed");
    }
  }

  const { data: existingRun, error: runReadError } = await client
    .from("workflow_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", input.organizationId)
    .eq("idempotency_id", idempotencyId)
    .maybeSingle();
  if (runReadError) throw new WorkflowCommandError("persistence_failed");
  if (existingRun) return asRun(existingRun, true);

  const id = deterministicUuid(input.organizationId, `workflow-run:${idempotencyId}`);
  const { data: created, error: createError } = await client
    .from("workflow_runs")
    .insert({
      id,
      organization_id: input.organizationId,
      idempotency_id: idempotencyId,
      site_id: siteId,
      workflow_type: "research_site",
      status: "queued",
      provider: "render",
      input: { siteId: input.externalSiteId },
    })
    .select(RUN_COLUMNS)
    .single();
  if (createError || !created) {
    if (createError?.code === "23505") return createResearchWorkflowRun(input);
    throw new WorkflowCommandError("persistence_failed");
  }
  return asRun(created, false);
}

export async function createCandidateIngestionWorkflowRun(input: {
  organizationId: string;
  userId: string | null;
  thesisId: string;
  idempotencyKey: string;
}): Promise<ResearchWorkflowRun> {
  const client = createSupabaseAdminClient();
  const hash = createHash("sha256")
    .update(JSON.stringify({ operation: "ingest_candidates", organizationId: input.organizationId, thesisId: input.thesisId }))
    .digest("hex");
  const { data: existingKey, error: keyReadError } = await client
    .from("workflow_idempotency")
    .select("id,request_hash")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (keyReadError) throw new WorkflowCommandError("persistence_failed");
  if (existingKey && existingKey.request_hash !== hash) throw new WorkflowCommandError("idempotency_conflict");

  const idempotencyId = existingKey?.id
    ?? deterministicUuid(input.organizationId, `workflow-idempotency:${input.idempotencyKey}`);
  if (!existingKey) {
    const { error } = await client.from("workflow_idempotency").insert({
      id: idempotencyId,
      organization_id: input.organizationId,
      idempotency_key: input.idempotencyKey,
      operation: "ingest_candidates",
      request_hash: hash,
      requested_by: input.userId,
    });
    if (error) {
      if (error.code === "23505") return createCandidateIngestionWorkflowRun(input);
      throw new WorkflowCommandError("persistence_failed");
    }
  }

  const { data: existingRun, error: runReadError } = await client
    .from("workflow_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", input.organizationId)
    .eq("idempotency_id", idempotencyId)
    .maybeSingle();
  if (runReadError) throw new WorkflowCommandError("persistence_failed");
  if (existingRun) return asRun(existingRun, true);

  const id = deterministicUuid(input.organizationId, `workflow-run:${idempotencyId}`);
  const { data: created, error: createError } = await client
    .from("workflow_runs")
    .insert({
      id,
      organization_id: input.organizationId,
      idempotency_id: idempotencyId,
      workflow_type: "ingest_candidates",
      status: "queued",
      provider: "render",
      input: { thesisId: input.thesisId },
    })
    .select(RUN_COLUMNS)
    .single();
  if (createError || !created) {
    if (createError?.code === "23505") return createCandidateIngestionWorkflowRun(input);
    throw new WorkflowCommandError("persistence_failed");
  }
  return asRun(created, false);
}

export async function attachProviderRun(input: {
  organizationId: string;
  workflowRunId: string;
  providerRunId: string;
}): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("workflow_runs")
    .update({ provider_run_id: input.providerRunId })
    .eq("organization_id", input.organizationId)
    .eq("id", input.workflowRunId);
  if (error) throw new WorkflowCommandError("persistence_failed");
}

export async function markWorkflowRunning(organizationId: string, workflowRunId: string): Promise<ResearchWorkflowRun | null> {
  const client = createSupabaseAdminClient();
  const existing = await getResearchWorkflowRun(organizationId, workflowRunId);
  if (!existing || existing.status === "succeeded") return existing;
  const { data, error } = await client
    .from("workflow_runs")
    .update({ status: "running", started_at: existing.startedAt ?? existing.requestedAt, error: null })
    .eq("organization_id", organizationId)
    .eq("id", workflowRunId)
    .select(RUN_COLUMNS)
    .single();
  if (error || !data) throw new WorkflowCommandError("persistence_failed", { cause: error ?? "missing update result" });
  return asRun(data, false);
}

export async function completeWorkflowRun(input: {
  organizationId: string;
  workflowRunId: string;
  status: "succeeded" | "partial";
  output: Json;
}): Promise<void> {
  const existing = await getResearchWorkflowRun(input.organizationId, input.workflowRunId);
  if (!existing) throw new WorkflowCommandError("persistence_failed");
  const startedAt = existing.startedAt ?? existing.requestedAt;
  const finishedAt = new Date(Math.max(Date.now(), Date.parse(startedAt) + 1)).toISOString();
  const { error } = await createSupabaseAdminClient()
    .from("workflow_runs")
    .update({ status: input.status, output: input.output, error: null, started_at: startedAt, finished_at: finishedAt })
    .eq("organization_id", input.organizationId)
    .eq("id", input.workflowRunId);
  if (error) throw new WorkflowCommandError("persistence_failed");
}

export async function failWorkflowRun(input: {
  organizationId: string;
  workflowRunId: string;
  code: string;
}): Promise<void> {
  const existing = await getResearchWorkflowRun(input.organizationId, input.workflowRunId);
  if (!existing) throw new WorkflowCommandError("persistence_failed");
  const startedAt = existing.startedAt ?? existing.requestedAt;
  const finishedAt = new Date(Math.max(Date.now(), Date.parse(startedAt) + 1)).toISOString();
  const { error } = await createSupabaseAdminClient()
    .from("workflow_runs")
    .update({
      status: "failed",
      error: { code: input.code, message: "The research workflow failed; the previous accepted snapshot remains active." },
      started_at: startedAt,
      finished_at: finishedAt,
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.workflowRunId);
  if (error) throw new WorkflowCommandError("persistence_failed");
}

export async function getResearchWorkflowRun(
  organizationId: string,
  workflowRunId: string,
): Promise<ResearchWorkflowRun | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("workflow_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", workflowRunId)
    .maybeSingle();
  if (error) throw new WorkflowCommandError("persistence_failed");
  return data ? asRun(data, false) : null;
}
