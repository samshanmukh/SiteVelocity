import "server-only";

import { createHash } from "node:crypto";
import type { Json } from "@/lib/persistence/database.types";
import {
  ManagedIngestionBatchSchema,
  type ManagedDatasetKey,
  type ManagedIngestionBatch,
  type PersistedManagedIngestionBatch,
} from "@/lib/ingestion/managed-batch";
import { deterministicUuid } from "@/lib/persistence/identity";
import { createSupabaseAdminClient } from "@/lib/persistence/supabase/admin";

export class ManagedIngestionError extends Error {
  override readonly name = "ManagedIngestionError";

  constructor(readonly code: "batch_conflict" | "persistence_failed") {
    super(code);
  }
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function managedBatchChecksum(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function persisted(row: {
  id: string;
  payload_checksum: string;
  payload: Json;
  created_at: string;
}): PersistedManagedIngestionBatch {
  const batch = ManagedIngestionBatchSchema.parse(row.payload);
  return {
    ...batch,
    id: row.id,
    payloadChecksum: row.payload_checksum,
    createdAt: row.created_at,
  };
}

export async function acceptManagedIngestionBatch(
  batch: ManagedIngestionBatch,
  rawBody: string,
): Promise<{ batch: PersistedManagedIngestionBatch; replayed: boolean }> {
  const client = createSupabaseAdminClient();
  const payloadChecksum = managedBatchChecksum(rawBody);
  const id = deterministicUuid(
    batch.organizationId,
    `managed-ingestion:${batch.provider}:${batch.datasetKey}:${batch.batchId}:${payloadChecksum}`,
  );
  const { data, error } = await client.from("managed_ingestion_batches").insert({
    id,
    organization_id: batch.organizationId,
    provider: batch.provider,
    dataset_key: batch.datasetKey,
    external_batch_id: batch.batchId,
    source_uri: batch.source.sourceUrl,
    retrieved_at: batch.retrievedAt,
    record_count: batch.records.length,
    payload_checksum: payloadChecksum,
    payload: asJson(batch),
  }).select("id,payload_checksum,payload,created_at").single();

  if (!error && data) return { batch: persisted(data), replayed: false };
  if (error?.code !== "23505") throw new ManagedIngestionError("persistence_failed");

  const { data: existing, error: readError } = await client
    .from("managed_ingestion_batches")
    .select("id,payload_checksum,payload,created_at")
    .eq("organization_id", batch.organizationId)
    .eq("provider", batch.provider)
    .eq("dataset_key", batch.datasetKey)
    .eq("external_batch_id", batch.batchId)
    .maybeSingle();
  if (readError || !existing) throw new ManagedIngestionError("persistence_failed");
  if (existing.payload_checksum !== payloadChecksum) throw new ManagedIngestionError("batch_conflict");
  return { batch: persisted(existing), replayed: true };
}

export async function loadLatestManagedIngestionBatch(
  organizationId: string,
  datasetKey: ManagedDatasetKey,
): Promise<PersistedManagedIngestionBatch | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("managed_ingestion_batches")
    .select("id,payload_checksum,payload,created_at")
    .eq("organization_id", organizationId)
    .eq("provider", "nexla")
    .eq("dataset_key", datasetKey)
    .order("retrieved_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ManagedIngestionError("persistence_failed");
  return data ? persisted(data) : null;
}
