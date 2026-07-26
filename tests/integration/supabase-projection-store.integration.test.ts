import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CandidateSetSchema } from "../../lib/domain/site";
import { deterministicUuid } from "../../lib/persistence/identity";
import { ManagedIngestionBatchSchema } from "../../lib/ingestion/managed-batch";
import {
  acceptManagedIngestionBatch,
  loadLatestManagedIngestionBatch,
  ManagedIngestionError,
} from "../../lib/persistence/managed-ingestion-store";
import { feasibilityRepositoryForOrganization } from "../../lib/persistence/feasibility-store";
import type { FeasibilityAssumptions } from "../../lib/domain/feasibility";
import type { SnapshotBundle } from "../../lib/persistence/file-store";
import { createSupabaseProjectionStore } from "../../lib/persistence/supabase/projection-store";
import {
  attachProviderRun,
  completeWorkflowRun,
  createResearchWorkflowRun,
  getResearchWorkflowRun,
  markWorkflowRunning,
  WorkflowCommandError,
} from "../../lib/workflows/workflow-store";

const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

test("round-trips a real candidate projection through Supabase", { skip: !configured }, async () => {
  const organizationId = randomUUID();
  const admin = (await import("../../lib/persistence/supabase/admin")).createSupabaseAdminClient();
  const organization = await admin.from("organizations").insert({
    id: organizationId,
    name: "SiteVelocity projection integration test",
    slug: `projection-integration-${organizationId}`,
  });
  assert.equal(organization.error, null);

  const fixture = CandidateSetSchema.parse(
    JSON.parse(await readFile("data/candidates.json", "utf8")) as unknown,
  );
  const store = createSupabaseProjectionStore({ organizationId });

  const managedPayload = {
    schemaVersion: "1.0",
    organizationId,
    provider: "nexla",
    datasetKey: "san_jose_ab2011",
    batchId: "integration-managed-batch-1",
    source: {
      agency: "City of San Jose",
      dataset: "AB 2011 Opportunity Parcels",
      sourceUrl: "https://services2.arcgis.com/example/FeatureServer/0",
    },
    retrievedAt: "2026-07-25T12:00:00.000Z",
    records: [{ externalRecordId: "1", payload: { APN: "23018033", VACANT: "YES" } }],
  } as const;
  const managedBatch = ManagedIngestionBatchSchema.parse(managedPayload);
  const managedRaw = JSON.stringify(managedPayload);
  const firstAcceptance = await acceptManagedIngestionBatch(managedBatch, managedRaw);
  assert.equal(firstAcceptance.replayed, false);
  assert.equal((await acceptManagedIngestionBatch(managedBatch, managedRaw)).replayed, true);
  assert.equal(
    (await loadLatestManagedIngestionBatch(organizationId, "san_jose_ab2011"))?.batchId,
    managedPayload.batchId,
  );
  const conflictingPayload = ManagedIngestionBatchSchema.parse({
    ...managedPayload,
    records: [{ externalRecordId: "2", payload: { APN: "27415017", VACANT: "YES" } }],
  });
  await assert.rejects(
    () => acceptManagedIngestionBatch(conflictingPayload, JSON.stringify(conflictingPayload)),
    (error: unknown) => error instanceof ManagedIngestionError && error.code === "batch_conflict",
  );
  const immutableUpdate = await admin.from("managed_ingestion_batches")
    .update({ record_count: 2 })
    .eq("organization_id", organizationId)
    .eq("id", firstAcceptance.batch.id);
  assert.notEqual(immutableUpdate.error, null);

  await store.saveCandidateSet(fixture);
  const restored = await store.loadCandidateSet();

  assert.deepEqual(restored, fixture);

  const siteId = deterministicUuid(
    organizationId,
    `site:${fixture.sites[0].id}`,
  );
  const normalized = await admin
    .from("sites")
    .select("normalized_apn")
    .eq("organization_id", organizationId)
    .eq("id", siteId)
    .single();
  assert.equal(normalized.error, null);
  assert.equal(normalized.data?.normalized_apn, fixture.sites[0].apn);

  const feasibilityAssumptions: FeasibilityAssumptions = {
    setbackPercent: 0.15,
    nonBuildablePercent: 0.1,
    far: 2.5,
    densityUnitsPerAcre: 80,
    maxStories: 5,
    parkingSpacesPerUnit: 0.75,
    averageUnitSqFt: 850,
    residentialEfficiency: 0.82,
    landPrice: 8_000_000,
    hardCostPerGrossSqFt: 350,
    softCostPercent: 0.25,
    monthlyRentPerUnit: 3_200,
    monthlyOtherIncomePerUnit: 150,
    operatingExpensePercent: 0.32,
    exitCapRate: 0.05,
    loanToCost: 0.65,
    annualInterestRate: 0.065,
    targetProfitMargin: 0.15,
  };
  const feasibility = feasibilityRepositoryForOrganization(organizationId);
  const scenario = await feasibility.create({
    externalSiteId: fixture.sites[0].id,
    parcelAcres: fixture.sites[0].acresDerived?.value ?? 1,
    fatalConstraintCount: 0,
    materialUnknownCount: 1,
    userId: null,
    name: "Integration base case",
    assumptions: feasibilityAssumptions,
  });
  assert.equal((await feasibility.listForSite(fixture.sites[0].id))[0]?.id, scenario.id);
  assert.equal((await feasibility.create({
    externalSiteId: fixture.sites[0].id,
    parcelAcres: fixture.sites[0].acresDerived?.value ?? 1,
    fatalConstraintCount: 0,
    materialUnknownCount: 1,
    userId: null,
    name: "Integration base case",
    assumptions: feasibilityAssumptions,
  })).id, scenario.id);
  const immutableScenarioUpdate = await admin.from("feasibility_scenarios")
    .update({ name: "Mutated" })
    .eq("organization_id", organizationId)
    .eq("id", scenario.id);
  assert.notEqual(immutableScenarioUpdate.error, null);

  const queued = await createResearchWorkflowRun({
    organizationId,
    userId: null,
    externalSiteId: fixture.sites[0].id,
    idempotencyKey: "integration-research-command-1",
  });
  assert.equal(queued.status, "queued");
  assert.equal(queued.replayed, false);
  const replayed = await createResearchWorkflowRun({
    organizationId,
    userId: null,
    externalSiteId: fixture.sites[0].id,
    idempotencyKey: "integration-research-command-1",
  });
  assert.equal(replayed.id, queued.id);
  assert.equal(replayed.replayed, true);
  await assert.rejects(
    () => createResearchWorkflowRun({
      organizationId,
      userId: null,
      externalSiteId: fixture.sites[1].id,
      idempotencyKey: "integration-research-command-1",
    }),
    (error: unknown) => error instanceof WorkflowCommandError && error.code === "idempotency_conflict",
  );
  assert.equal((await markWorkflowRunning(organizationId, queued.id))?.status, "running");
  await attachProviderRun({ organizationId, workflowRunId: queued.id, providerRunId: "trn-integration" });
  await completeWorkflowRun({
    organizationId,
    workflowRunId: queued.id,
    status: "succeeded",
    output: { snapshotId: "integration-snapshot", status: "complete", evidenceCount: 1, findingCount: 1 },
  });
  const completedWorkflow = await getResearchWorkflowRun(organizationId, queued.id);
  assert.equal(completedWorkflow?.status, "succeeded");
  assert.equal(completedWorkflow?.providerRunId, "trn-integration");

  const snapshot = JSON.parse(
    await readFile("data/sites/sj-23018033/snapshots/snap-2026-07-25T21-34-52-873Z.json", "utf8"),
  ) as SnapshotBundle;
  await store.saveSnapshotBundle(snapshot, { workflowRunId: queued.id });
  const activeSnapshot = await store.loadActiveSnapshot(snapshot.snapshot.siteId);
  assert.deepEqual(activeSnapshot && { ...activeSnapshot, changes: undefined }, { ...snapshot, changes: undefined });
  assert.equal(activeSnapshot?.changes?.fromSnapshotId, null);
  assert.ok((activeSnapshot?.changes?.changes.length ?? 0) > 0);

  const normalizedSnapshot = await admin
    .from("research_snapshots")
    .select("id,status,accepted,workflow_run_id")
    .eq("organization_id", organizationId)
    .eq("site_id", siteId)
    .single();
  assert.equal(normalizedSnapshot.error, null);
  assert.equal(normalizedSnapshot.data?.status, snapshot.snapshot.status);
  assert.equal(normalizedSnapshot.data?.accepted, true);
  assert.equal(normalizedSnapshot.data?.workflow_run_id, queued.id);

  const [evidence, findings, scores, actions] = await Promise.all([
    admin.from("evidence").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("site_id", siteId),
    admin.from("findings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("site_id", siteId),
    admin.from("site_scores").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("site_id", siteId),
    admin.from("next_actions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("site_id", siteId),
  ]);
  assert.equal(evidence.error, null);
  assert.equal(findings.error, null);
  assert.equal(scores.error, null);
  assert.equal(actions.error, null);
  assert.ok((evidence.count ?? 0) > 0);
  assert.ok((findings.count ?? 0) > 0);
  assert.ok((scores.count ?? 0) >= 3);
  assert.ok((actions.count ?? 0) > 0);

  const watchlistId = deterministicUuid(organizationId, "integration-watchlist");
  const watchlistInsert = await admin.from("watchlists").upsert({
    id: watchlistId,
    organization_id: organizationId,
    name: "Integration monitored sites",
  }, { onConflict: "id" });
  assert.equal(watchlistInsert.error, null);
  const watchlistSiteInsert = await admin.from("watchlist_sites").upsert({
    organization_id: organizationId,
    watchlist_id: watchlistId,
    site_id: siteId,
    external_site_id: snapshot.snapshot.siteId,
  }, { onConflict: "watchlist_id,site_id" });
  assert.equal(watchlistSiteInsert.error, null);

  const changedSnapshot = structuredClone(snapshot);
  changedSnapshot.snapshot.id = "snap-2026-07-26T21-34-52-873Z";
  changedSnapshot.snapshot.createdAt = "2026-07-26T21:34:52.873Z";
  changedSnapshot.snapshot.sourceCutoff = "2026-07-26T21:34:52.873Z";
  const changedFinding = changedSnapshot.findings.find((item) =>
    typeof item === "object" && item !== null && "field" in item && item.field === "residential_permitted_use",
  ) as Record<string, unknown>;
  changedFinding.valueJson = "conditional";
  changedFinding.status = "probable";
  changedFinding.evidenceLevel = "ai_researched";
  changedFinding.confidence = 0.6;
  changedFinding.impact = "cost_timing_risk";
  await store.saveSnapshotBundle(changedSnapshot);

  const notifications = await admin
    .from("watchlist_notifications")
    .select("id,severity,summary")
    .eq("organization_id", organizationId)
    .eq("watchlist_id", watchlistId);
  assert.equal(notifications.error, null);
  assert.ok((notifications.data?.length ?? 0) > 0);
  assert.ok(notifications.data?.some((notification) => notification.severity === "material" && /permitted use/i.test(notification.summary)));

  const eventSnapshot = JSON.parse(
    await readFile("data/sites/sj-27415017/snapshots/snap-2026-07-25T21-34-53-512Z.json", "utf8"),
  ) as SnapshotBundle;
  await store.saveSnapshotBundle(eventSnapshot);
  const eventSiteId = deterministicUuid(organizationId, `site:${eventSnapshot.snapshot.siteId}`);
  const events = await admin
    .from("development_events")
    .select("id,title,primary_evidence_id")
    .eq("organization_id", organizationId)
    .eq("site_id", eventSiteId);
  assert.equal(events.error, null);
  assert.ok((events.data?.length ?? 0) > 0);
  assert.ok(events.data?.some((event) => event.title === "Rezoning approved" && event.primary_evidence_id));
});
