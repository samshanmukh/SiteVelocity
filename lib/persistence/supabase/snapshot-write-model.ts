import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalculationRun } from "@/lib/calculations/registry";
import type { ScoreOutput } from "@/lib/calculations/scoring/alpha-scores";
import type { AgentRun, Evidence, Finding, NextAction } from "@/lib/domain/schemas/core";
import type { TimelineEvent } from "@/lib/research/pipeline";
import type { Database, Json } from "../database.types";
import type { SnapshotBundle, SnapshotWriteContext } from "../file-store";
import { deterministicUuid } from "../identity";

type RunStatus = Database["public"]["Enums"]["run_status"];
type EvidenceLevel = Database["public"]["Enums"]["evidence_level"];
type ScoreType = Database["public"]["Enums"]["score_type"];

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

// PostgREST treats a top-level JSON null as SQL NULL. Preserve an explicit
// unknown value in a small object so the database NOT NULL invariant holds.
function findingValueJson(value: unknown): Json {
  return value === null ? { value: null } : asJson(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeWriteError(stage: string, cause?: unknown): Error {
  const diagnostic = cause && typeof cause === "object"
    ? ["code", "message", "details", "hint"]
      .map((key) => (cause as Record<string, unknown>)[key])
      .filter((value) => typeof value === "string" && value.length > 0)
      .join(" | ")
    : "";
  return new Error(`Supabase normalized snapshot write failed at ${stage}${diagnostic ? ` (${diagnostic})` : ""}.`, { cause });
}

function runStatus(status: "queued" | "running" | "complete" | "failed"): RunStatus {
  return status === "complete" ? "succeeded" : status;
}

function evidenceLevelFor(evidence: Evidence, findings: Finding[]): EvidenceLevel {
  const levels = findings.filter((finding) => finding.evidenceIds.includes(evidence.id)).map((finding) => finding.evidenceLevel);
  if (levels.includes("document_verified")) return "document_verified";
  if (levels.includes("gis_screened")) return "gis_screened";
  if (levels.includes("ai_researched")) return "ai_researched";
  if (levels.includes("professional_verification_required")) return "professional_verification_required";
  return "ai_researched";
}

function snapshotVersion(createdAt: string): number {
  const seconds = Math.floor(Date.parse(createdAt) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 2_147_483_647) {
    throw new Error("Snapshot creation time cannot be represented as a database version.");
  }
  return seconds;
}

export interface NormalizedSnapshotResult {
  siteId: string;
  snapshotId: string;
}

/**
 * Writes the immutable, queryable research graph behind a snapshot projection.
 * Stable content-derived identifiers make retries idempotent without mutating
 * any previously accepted evidence or findings.
 */
export async function writeNormalizedSnapshotBundle(
  client: SupabaseClient<Database>,
  organizationId: string,
  bundle: SnapshotBundle,
  context?: SnapshotWriteContext,
): Promise<NormalizedSnapshotResult> {
  if (bundle.snapshot.status === "failed") {
    throw new Error("Failed snapshots cannot be written to the normalized snapshot model.");
  }
  const agentRuns = bundle.agentRuns as AgentRun[];
  const evidenceRows = bundle.evidence as Evidence[];
  const findings = bundle.findings as Finding[];
  const scores = bundle.scores as Record<string, CalculationRun<ScoreOutput> | undefined>;
  const nextAction = bundle.nextAction as NextAction | null;
  const timeline = bundle.timeline as TimelineEvent[];
  const externalSiteId = bundle.snapshot.siteId;
  const siteId = deterministicUuid(organizationId, `site:${externalSiteId}`);
  const snapshotId = deterministicUuid(organizationId, `snapshot:${externalSiteId}:${bundle.snapshot.id}:${digest(bundle)}`);

  const { data: existing, error: existingError } = await client
    .from("research_snapshots")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", snapshotId)
    .maybeSingle();
  if (existingError) throw safeWriteError("snapshot identity check");
  if (existing) return { siteId, snapshotId };

  let workflowRunId: string;
  if (context?.workflowRunId) {
    const { data: workflow, error: workflowReadError } = await client
      .from("workflow_runs")
      .select("id,idempotency_id,site_id,workflow_type")
      .eq("organization_id", organizationId)
      .eq("id", context.workflowRunId)
      .maybeSingle();
    if (workflowReadError) throw safeWriteError("durable workflow lookup", workflowReadError);
    if (!workflow || workflow.workflow_type !== "research_site" || workflow.site_id !== siteId) {
      throw safeWriteError("durable workflow linkage");
    }
    workflowRunId = workflow.id;
    const output = asJson({ snapshotId: bundle.snapshot.id, status: bundle.snapshot.status });
    const [{ error: workflowUpdateError }, { error: idempotencyUpdateError }] = await Promise.all([
      client.from("workflow_runs").update({
        source_cutoff_at: bundle.snapshot.sourceCutoff,
        output,
      }).eq("organization_id", organizationId).eq("id", workflowRunId),
      client.from("workflow_idempotency").update({ response: output })
        .eq("organization_id", organizationId)
        .eq("id", workflow.idempotency_id),
    ]);
    if (workflowUpdateError) throw safeWriteError("durable workflow update", workflowUpdateError);
    if (idempotencyUpdateError) throw safeWriteError("durable idempotency response", idempotencyUpdateError);
  } else {
    const requestHash = digest({ siteId: externalSiteId, snapshotId: bundle.snapshot.id });
    const idempotencyId = deterministicUuid(organizationId, `workflow-idempotency:research:${externalSiteId}:${bundle.snapshot.id}`);
    workflowRunId = deterministicUuid(organizationId, `workflow-run:research:${externalSiteId}:${bundle.snapshot.id}`);

    const { error: idempotencyError } = await client.from("workflow_idempotency").upsert({
      id: idempotencyId,
      organization_id: organizationId,
      idempotency_key: `research:${externalSiteId}:${bundle.snapshot.id}`,
      operation: "research_site",
      request_hash: requestHash,
      response: asJson({ snapshotId: bundle.snapshot.id }),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (idempotencyError) throw safeWriteError("workflow idempotency");

    const workflowStatus: RunStatus = bundle.snapshot.status === "complete" ? "succeeded" : "partial";
    const { error: workflowError } = await client.from("workflow_runs").upsert({
      id: workflowRunId,
      organization_id: organizationId,
      idempotency_id: idempotencyId,
      site_id: siteId,
      workflow_type: "research_site",
      status: workflowStatus,
      provider: "sitevelocity",
      provider_run_id: bundle.snapshot.id,
      requested_at: bundle.snapshot.createdAt,
      started_at: bundle.snapshot.createdAt,
      finished_at: bundle.snapshot.createdAt,
      source_cutoff_at: bundle.snapshot.sourceCutoff,
      input: asJson({ siteId: externalSiteId }),
      output: asJson({ snapshotId: bundle.snapshot.id, status: bundle.snapshot.status }),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (workflowError) throw safeWriteError("workflow run");
  }

  const agentIds = new Map<string, string>();
  for (const run of agentRuns) {
    const id = deterministicUuid(organizationId, `agent-run:${externalSiteId}:${run.id}:${digest(run)}`);
    agentIds.set(run.id, id);
    const status = runStatus(run.status);
    const { error } = await client.from("agent_runs").upsert({
      id,
      organization_id: organizationId,
      workflow_run_id: workflowRunId,
      site_id: siteId,
      agent: run.agent,
      status,
      attempt: 1,
      prompt_version: "sitevelocity-alpha-v1",
      provider: "sitevelocity",
      started_at: run.startedAt ?? null,
      finished_at: status === "queued" || status === "running" ? null : (run.finishedAt ?? bundle.snapshot.createdAt),
      output: asJson({ summary: run.summary ?? null, sourcesUsed: run.sourcesUsed }),
      error: status === "failed" ? asJson({ code: "AGENT_FAILED", message: run.summary ?? "Agent failed" }) : null,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw safeWriteError("agent run");
  }

  const evidenceIds = new Map<string, string>();
  for (const evidence of evidenceRows) {
    const dataSourceId = deterministicUuid(organizationId, `data-source:${evidence.source.dataset}`);
    const sourceAdapterKey = `source-${digest(evidence.source.dataset).slice(0, 24)}`;
    const { error: sourceConfigError } = await client.from("data_sources").upsert({
      id: dataSourceId,
      organization_id: organizationId,
      adapter_key: sourceAdapterKey,
      display_name: evidence.source.dataset,
      agency: evidence.source.agency,
      jurisdiction: "San José / Santa Clara County",
      base_url: new URL(evidence.source.sourceUrl).origin,
      configuration: asJson({ sourceUrl: evidence.source.sourceUrl }),
      enabled: true,
    }, { onConflict: "id" });
    if (sourceConfigError) throw safeWriteError("evidence data source");

    const rawPayload = asJson(evidence.payload ?? { title: evidence.title, excerpt: evidence.excerpt });
    const sourceChecksum = digest(rawPayload);
    const sourceRecordId = deterministicUuid(
      organizationId,
      `source-record:${dataSourceId}:${evidence.source.sourceRecordId}:${sourceChecksum}`,
    );
    const { error: sourceRecordError } = await client.from("source_records").upsert({
      id: sourceRecordId,
      organization_id: organizationId,
      data_source_id: dataSourceId,
      external_record_id: evidence.source.sourceRecordId,
      record_status: "normalized",
      source_uri: evidence.source.sourceUrl,
      retrieved_at: evidence.source.retrievedAt,
      payload_checksum: sourceChecksum,
      raw_payload: rawPayload,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (sourceRecordError) throw safeWriteError("evidence source record");

    const level = evidenceLevelFor(evidence, findings);
    const evidenceChecksum = digest({ title: evidence.title, excerpt: evidence.excerpt, payload: evidence.payload ?? null });
    const id = deterministicUuid(organizationId, `evidence:${externalSiteId}:${evidence.id}:${evidenceChecksum}`);
    evidenceIds.set(evidence.id, id);
    const { error } = await client.from("evidence").upsert({
      id,
      organization_id: organizationId,
      site_id: siteId,
      source_record_id: sourceRecordId,
      category: findings.find((finding) => finding.evidenceIds.includes(evidence.id))?.category ?? "research",
      title: evidence.title,
      agency: evidence.source.agency,
      source_uri: evidence.source.sourceUrl,
      retrieved_at: evidence.source.retrievedAt,
      evidence_level: level,
      excerpt: evidence.excerpt,
      structured_payload: evidence.payload === undefined ? null : asJson(evidence.payload),
      content_checksum: evidenceChecksum,
      media_type: "application/json",
      professional_verification_required: level === "professional_verification_required",
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw safeWriteError("evidence");
  }

  const findingIds = new Map<string, string>();
  for (const finding of findings) {
    const id = deterministicUuid(organizationId, `finding:${externalSiteId}:${finding.id}:${digest(finding)}`);
    findingIds.set(finding.id, id);
    const agentId = agentRuns.find((run) => run.agent === finding.category)?.id;
    const { error } = await client.from("findings").upsert({
      id,
      organization_id: organizationId,
      site_id: siteId,
      agent_run_id: agentId ? agentIds.get(agentId) ?? null : null,
      category: finding.category,
      field: finding.field,
      value_json: findingValueJson(finding.valueJson),
      status: finding.status,
      evidence_level: finding.evidenceLevel,
      confidence: finding.confidence,
      impact: finding.impact,
      note: finding.note ?? null,
      created_at: finding.createdAt,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw safeWriteError("finding", error);

    for (const externalEvidenceId of finding.evidenceIds) {
      const evidenceId = evidenceIds.get(externalEvidenceId);
      if (!evidenceId) continue;
      const { error: linkError } = await client.from("finding_evidence").upsert({
        organization_id: organizationId,
        site_id: siteId,
        finding_id: id,
        evidence_id: evidenceId,
        relationship: "supports",
      }, { onConflict: "finding_id,evidence_id", ignoreDuplicates: true });
      if (linkError) throw safeWriteError("finding evidence");
    }
  }

  const manifestChecksum = digest(bundle);
  const { error: snapshotError } = await client.from("research_snapshots").insert({
    id: snapshotId,
    organization_id: organizationId,
    site_id: siteId,
    workflow_run_id: workflowRunId,
    version: snapshotVersion(bundle.snapshot.createdAt),
    status: bundle.snapshot.status,
    accepted: true,
    accepted_at: bundle.snapshot.createdAt,
    acceptance_version: "sitevelocity-alpha-v1",
    manifest_version: bundle.snapshot.schemaVersion,
    manifest_checksum: manifestChecksum,
    source_cutoff_at: bundle.snapshot.sourceCutoff,
    summary: asJson({ timeline: bundle.timeline, externalSnapshotId: bundle.snapshot.id }),
    created_at: bundle.snapshot.createdAt,
  });
  if (snapshotError) throw safeWriteError("snapshot manifest");

  for (const evidenceId of evidenceIds.values()) {
    const { error } = await client.from("snapshot_evidence").upsert({ organization_id: organizationId, site_id: siteId, snapshot_id: snapshotId, evidence_id: evidenceId }, { onConflict: "snapshot_id,evidence_id", ignoreDuplicates: true });
    if (error) throw safeWriteError("snapshot evidence");
  }
  for (const findingId of findingIds.values()) {
    const { error } = await client.from("snapshot_findings").upsert({ organization_id: organizationId, site_id: siteId, snapshot_id: snapshotId, finding_id: findingId }, { onConflict: "snapshot_id,finding_id", ignoreDuplicates: true });
    if (error) throw safeWriteError("snapshot finding");
  }
  for (const agentRunId of agentIds.values()) {
    const { error } = await client.from("snapshot_agent_runs").upsert({ organization_id: organizationId, site_id: siteId, snapshot_id: snapshotId, agent_run_id: agentRunId }, { onConflict: "snapshot_id,agent_run_id", ignoreDuplicates: true });
    if (error) throw safeWriteError("snapshot agent run");
  }

  const eventIds: string[] = [];
  for (const event of timeline) {
    const eventKind = /permit/i.test(event.title)
      ? "permit"
      : /rezon|entitlement|approval/i.test(event.title)
        ? "entitlement"
        : "development";
    const primaryEvidenceId = event.evidenceId ? evidenceIds.get(event.evidenceId) ?? null : null;
    const primaryEvidence = event.evidenceId ? evidenceRows.find((evidence) => evidence.id === event.evidenceId) : undefined;
    const evidenceLevel = primaryEvidence ? evidenceLevelFor(primaryEvidence, findings) : "ai_researched";
    const eventId = deterministicUuid(organizationId, `development-event:${externalSiteId}:${event.year}:${event.title}:${event.description}`);
    eventIds.push(eventId);
    const { error } = await client.from("development_events").upsert({
      id: eventId,
      organization_id: organizationId,
      site_id: siteId,
      primary_evidence_id: primaryEvidenceId,
      event_kind: eventKind,
      event_type: eventKind === "entitlement" ? "planning_action" : eventKind === "permit" ? "permit_action" : "development_update",
      title: event.title,
      description: event.description,
      event_date: /^\d{4}$/.test(event.year) ? `${event.year}-01-01` : null,
      observed_at: bundle.snapshot.sourceCutoff,
      status: "observed",
      payload: asJson({ externalEvidenceId: event.evidenceId, displayYear: event.year }),
      evidence_level: evidenceLevel,
      confidence: primaryEvidence ? 0.9 : 0.5,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw safeWriteError("development event", error);
  }
  const materialSnapshotChanges = bundle.changes?.fromSnapshotId
    ? bundle.changes.changes.filter((item) => item.material)
    : [];
  for (const change of materialSnapshotChanges) {
    const externalEvidenceId = change.current?.evidenceIds[0] ?? change.previous?.evidenceIds[0] ?? null;
    const primaryEvidenceId = externalEvidenceId ? evidenceIds.get(externalEvidenceId) ?? null : null;
    const eventId = deterministicUuid(
      organizationId,
      `snapshot-change:${externalSiteId}:${bundle.changes?.fromSnapshotId ?? "initial"}:${bundle.snapshot.id}:${change.key}:${digest(change)}`,
    );
    eventIds.push(eventId);
    const { error } = await client.from("development_events").upsert({
      id: eventId,
      organization_id: organizationId,
      site_id: siteId,
      primary_evidence_id: primaryEvidenceId,
      event_kind: "development",
      event_type: `finding_${change.kind}`,
      title: `${change.field.replace(/_/g, " ")} ${change.kind === "not_observed" ? "not observed" : change.kind}`,
      description: change.summary,
      event_date: bundle.snapshot.createdAt.slice(0, 10),
      observed_at: bundle.snapshot.sourceCutoff,
      status: "observed",
      payload: asJson(change),
      evidence_level: change.current?.evidenceLevel ?? change.previous?.evidenceLevel ?? "professional_verification_required",
      confidence: change.current?.confidence ?? Math.min(change.previous?.confidence ?? 0.5, 0.5),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw safeWriteError("snapshot change event", error);
  }
  for (const developmentEventId of eventIds) {
    const { error } = await client.from("snapshot_events").upsert({ organization_id: organizationId, site_id: siteId, snapshot_id: snapshotId, development_event_id: developmentEventId }, { onConflict: "snapshot_id,development_event_id", ignoreDuplicates: true });
    if (error) throw safeWriteError("snapshot event", error);
  }
  if (eventIds.length > 0) {
    const { data: watchedBy, error: watchlistReadError } = await client
      .from("watchlist_sites")
      .select("watchlist_id")
      .eq("organization_id", organizationId)
      .eq("site_id", siteId);
    if (watchlistReadError) throw safeWriteError("watchlist lookup", watchlistReadError);
    for (const watch of watchedBy ?? []) {
      for (const developmentEventId of eventIds) {
        const eventChange = materialSnapshotChanges.find((change) =>
          developmentEventId === deterministicUuid(
            organizationId,
            `snapshot-change:${externalSiteId}:${bundle.changes?.fromSnapshotId ?? "initial"}:${bundle.snapshot.id}:${change.key}:${digest(change)}`,
          ),
        );
        const notificationId = deterministicUuid(organizationId, `watchlist-notification:${watch.watchlist_id}:${developmentEventId}`);
        const { error: notificationError } = await client.from("watchlist_notifications").upsert({
          id: notificationId,
          organization_id: organizationId,
          watchlist_id: watch.watchlist_id,
          site_id: siteId,
          development_event_id: developmentEventId,
          title: eventChange ? `Site finding changed: ${eventChange.field.replace(/_/g, " ")}` : "Development event observed",
          summary: eventChange?.summary ?? "A new evidence-backed development event was attached to this watched site.",
          severity: eventChange?.current?.impact === "fatal_constraint" ? "critical" : eventChange?.material ? "material" : "info",
        }, { onConflict: "id", ignoreDuplicates: true });
        if (notificationError) throw safeWriteError("watchlist notification", notificationError);
      }
    }
  }

  const scoreIds: string[] = [];
  for (const [scoreKey, score] of Object.entries(scores)) {
    if (!score) continue;
    const scoreType = scoreKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`) as ScoreType;
    const scoreId = deterministicUuid(organizationId, `score:${externalSiteId}:${score.type}:${score.version}:${score.inputHash}:${digest(score.output)}`);
    scoreIds.push(scoreId);
    const { error } = await client.from("site_scores").upsert({
      id: scoreId,
      organization_id: organizationId,
      site_id: siteId,
      score_type: scoreType,
      score: score.output.score,
      calculation_version: score.version,
      calculated_at: score.calculatedAt,
      input_hash: digest({ calculationInputHash: score.inputHash }),
      normalized_inputs: asJson({ calculationInputHash: score.inputHash, output: score.output }),
      rule_weights: asJson({ drivers: score.output.drivers }),
      warnings: asJson(score.warnings),
      material_flags: asJson([]),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw safeWriteError("site score");
  }
  for (const siteScoreId of scoreIds) {
    const { error } = await client.from("snapshot_scores").upsert({ organization_id: organizationId, site_id: siteId, snapshot_id: snapshotId, site_score_id: siteScoreId }, { onConflict: "snapshot_id,site_score_id", ignoreDuplicates: true });
    if (error) throw safeWriteError("snapshot score");
  }

  if (nextAction) {
    const action = nextAction;
    const actionId = deterministicUuid(organizationId, `next-action:${externalSiteId}:${action.id}:${digest(action)}`);
    const { error: actionError } = await client.from("next_actions").upsert({
      id: actionId,
      organization_id: organizationId,
      site_id: siteId,
      priority: 1,
      action_type: action.title,
      unresolved_question: action.questions[0] ?? action.title,
      why_it_matters: action.why,
      resolver_role: action.role,
      known_facts: asJson(action.knownFacts),
      questions_to_ask: asJson(action.questions),
      documents_to_request: asJson(action.documents),
      expected_follow_up: action.expectedFollowUp,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (actionError) throw safeWriteError("next action");
    const { error: actionLinkError } = await client.from("snapshot_next_actions").upsert({ organization_id: organizationId, site_id: siteId, snapshot_id: snapshotId, next_action_id: actionId }, { onConflict: "snapshot_id,next_action_id", ignoreDuplicates: true });
    if (actionLinkError) throw safeWriteError("snapshot next action");
  }

  const { error: activateError } = await client.rpc("activate_research_snapshot", { p_site_id: siteId, p_snapshot_id: snapshotId });
  if (activateError) throw safeWriteError("snapshot activation");

  return { siteId, snapshotId };
}
