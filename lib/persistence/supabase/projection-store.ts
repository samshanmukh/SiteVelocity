import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateSet } from "@/lib/domain/site";
import { CandidateSetSchema } from "@/lib/domain/site";
import { ResearchSnapshotSchema } from "@/lib/domain/schemas/core";
import type { Database, Json } from "../database.types";
import type { SnapshotBundle, SnapshotWriteContext } from "../file-store";
import { createSupabaseAdminClient } from "./admin";
import { writeNormalizedCandidateSet } from "./candidate-write-model";
import { writeNormalizedSnapshotBundle } from "./snapshot-write-model";
import { createSnapshotDiff } from "@/lib/research/snapshot-diff";

type ProjectionKind = "candidate_set" | "snapshot_bundle" | "raw_source_page";
type ProjectionStatus = "complete" | "partial";

export interface SupabaseProjectionStoreConfig {
  organizationId: string;
  client?: SupabaseClient<Database>;
  writeNormalizedRecords?: boolean;
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function checksum(value: Json): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeProjectionError(operation: string): Error {
  return new Error(`Supabase projection ${operation} failed.`);
}

function projectionConflictError(): Error {
  return new Error("Supabase projection version conflicts with different content.");
}

function isConflict(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export function createSupabaseProjectionStore(config: SupabaseProjectionStoreConfig) {
  const client = config.client ?? createSupabaseAdminClient();
  const organizationId = config.organizationId;
  const writeNormalizedRecords = config.writeNormalizedRecords ?? !config.client;

  async function insertProjection(input: {
    kind: ProjectionKind;
    scopeKey: string;
    versionKey: string;
    status: ProjectionStatus;
    sourceCutoffAt: string;
    payload: unknown;
  }): Promise<string> {
    const payload = asJson(input.payload);
    const id = randomUUID();
    const contentChecksum = checksum(payload);
    const { error } = await client.from("domain_projections").insert({
      id,
      organization_id: organizationId,
      projection_kind: input.kind,
      scope_key: input.scopeKey,
      version_key: input.versionKey,
      status: input.status,
      source_cutoff_at: input.sourceCutoffAt,
      payload,
      content_checksum: contentChecksum,
    });

    if (error && !isConflict(error)) throw safeProjectionError("write");
    if (isConflict(error)) {
      const { data: existing, error: readError } = await client
        .from("domain_projections")
        .select("content_checksum")
        .eq("organization_id", organizationId)
        .eq("projection_kind", input.kind)
        .eq("scope_key", input.scopeKey)
        .eq("version_key", input.versionKey)
        .maybeSingle();

      if (readError) throw safeProjectionError("conflict check");
      if (existing && existing.content_checksum !== contentChecksum) {
        throw projectionConflictError();
      }
    }
    return `supabase:domain_projections/${input.kind}/${input.scopeKey}/${contentChecksum}`;
  }

  async function latest(kind: ProjectionKind, scopeKey?: string, status?: ProjectionStatus): Promise<Json | null> {
    let query = client
      .from("domain_projections")
      .select("payload")
      .eq("organization_id", organizationId)
      .eq("projection_kind", kind);
    if (scopeKey) query = query.eq("scope_key", scopeKey);
    if (status) query = query.eq("status", status);
    const { data, error } = await query
      .order("source_cutoff_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw safeProjectionError("read");
    return data?.payload ?? null;
  }

  return {
    async saveCandidateSet(set: CandidateSet): Promise<void> {
      const validated = CandidateSetSchema.parse(set);
      if (writeNormalizedRecords) {
        await writeNormalizedCandidateSet(client, organizationId, validated);
      }
      await insertProjection({
        kind: "candidate_set",
        scopeKey: validated.thesisId,
        versionKey: validated.generatedAt,
        status: "complete",
        sourceCutoffAt: validated.generatedAt,
        payload: validated,
      });
    },

    async loadCandidateSet(): Promise<CandidateSet | null> {
      const payload = await latest("candidate_set");
      if (!payload) return null;
      const parsed = CandidateSetSchema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    },

    async saveRawSourcePage(dataset: string, page: number, payload: unknown): Promise<string> {
      const now = new Date().toISOString();
      return insertProjection({
        kind: "raw_source_page",
        scopeKey: `${dataset}:${page}`,
        versionKey: now,
        status: "complete",
        sourceCutoffAt: now,
        payload: { dataset, page, payload },
      });
    },

    async saveSnapshotBundle(bundle: SnapshotBundle, context?: SnapshotWriteContext): Promise<void> {
      const snapshot = ResearchSnapshotSchema.parse(bundle.snapshot);
      if (snapshot.status === "failed") throw new Error("Failed snapshots cannot become active projections.");
      const { data: existingVersion, error: existingVersionError } = await client
        .from("domain_projections")
        .select("payload")
        .eq("organization_id", organizationId)
        .eq("projection_kind", "snapshot_bundle")
        .eq("scope_key", snapshot.siteId)
        .eq("version_key", snapshot.id)
        .maybeSingle();
      if (existingVersionError) throw safeProjectionError("snapshot identity check");
      if (existingVersion?.payload && typeof existingVersion.payload === "object" && !Array.isArray(existingVersion.payload)) {
        const existingBundle = existingVersion.payload as unknown as SnapshotBundle;
        const { changes: _existingChanges, ...existingCore } = existingBundle;
        void _existingChanges;
        if (checksum(asJson(existingCore)) !== checksum(asJson(bundle))) throw projectionConflictError();
        return;
      }
      const previousPayload = await latest("snapshot_bundle", snapshot.siteId, "complete")
        ?? await latest("snapshot_bundle", snapshot.siteId, "partial");
      const previous = previousPayload && typeof previousPayload === "object" && !Array.isArray(previousPayload)
        ? previousPayload as unknown as SnapshotBundle
        : null;
      const persistedBundle: SnapshotBundle = {
        ...bundle,
        changes: createSnapshotDiff(previous, bundle),
      };
      if (writeNormalizedRecords) {
        await writeNormalizedSnapshotBundle(client, organizationId, persistedBundle, context);
      }
      await insertProjection({
        kind: "snapshot_bundle",
        scopeKey: snapshot.siteId,
        versionKey: snapshot.id,
        status: snapshot.status,
        sourceCutoffAt: snapshot.sourceCutoff,
        payload: persistedBundle,
      });
    },

    async loadActiveSnapshot(siteId: string): Promise<SnapshotBundle | null> {
      const payload = await latest("snapshot_bundle", siteId, "complete")
        ?? await latest("snapshot_bundle", siteId, "partial");
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
      const candidate = payload as unknown as SnapshotBundle;
      return ResearchSnapshotSchema.safeParse(candidate.snapshot).success ? candidate : null;
    },

    async listResearchedSiteIds(): Promise<string[]> {
      const { data, error } = await client
        .from("domain_projections")
        .select("scope_key")
        .eq("organization_id", organizationId)
        .eq("projection_kind", "snapshot_bundle");
      if (error) throw safeProjectionError("list");
      return [...new Set((data ?? []).map((row: { scope_key: string }) => row.scope_key))].sort();
    },
  };
}
