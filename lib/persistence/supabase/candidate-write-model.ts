import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateSet } from "@/lib/domain/site";
import type { Database, Json } from "../database.types";
import { deterministicUuid } from "../identity";

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sourceAdapterKey(dataset: string): string {
  return `source-${digest(dataset).slice(0, 24)}`;
}

function safeWriteError(stage: string): Error {
  return new Error(`Supabase normalized candidate write failed at ${stage}.`);
}

export async function writeNormalizedCandidateSet(
  client: SupabaseClient<Database>,
  organizationId: string,
  set: CandidateSet,
): Promise<void> {
  const thesisId = deterministicUuid(organizationId, `thesis:${set.thesisId}`);
  const existingThesis = await client.from("development_theses").select("id").eq("organization_id", organizationId).eq("id", thesisId).maybeSingle();
  if (existingThesis.error) throw safeWriteError("thesis read");
  if (!existingThesis.data) {
    const { error: thesisError } = await client.from("development_theses").insert({
      id: thesisId,
      organization_id: organizationId,
      name: set.thesisId,
      market: "San José, California",
      strategy: "Multifamily / mixed-use residential redevelopment",
      status: "active",
      version: 1,
      criteria: asJson({ externalThesisId: set.thesisId, funnel: set.funnel }),
    });
    if (thesisError) throw safeWriteError("thesis");
  }

  const dataSourceIds = new Map<string, string>();
  for (const source of set.sources) {
    const dataSourceId = deterministicUuid(organizationId, `data-source:${source.dataset}`);
    dataSourceIds.set(source.dataset, dataSourceId);
    const { error } = await client.from("data_sources").upsert({
      id: dataSourceId,
      organization_id: organizationId,
      adapter_key: sourceAdapterKey(source.dataset),
      display_name: source.dataset,
      agency: source.agency,
      jurisdiction: "San José / Santa Clara County",
      base_url: new URL(source.url).origin,
      configuration: asJson({ sourceUrl: source.url }),
      enabled: true,
    }, { onConflict: "id" });
    if (error) throw safeWriteError("data source");
  }

  for (const site of set.sites) {
    const candidateId = deterministicUuid(organizationId, `candidate:${site.id}`);
    const siteId = deterministicUuid(organizationId, `site:${site.id}`);
    const { error: candidateError } = await client.from("candidate_sites").upsert({
      id: candidateId,
      organization_id: organizationId,
      thesis_id: thesisId,
      status: "candidate",
      jurisdiction: site.jurisdiction,
      apn: site.apn,
      normalized_apn: site.apn,
      address: site.address,
      city: "San José",
      region: "CA",
      parcel_acres: site.acresDerived?.value ?? null,
      latitude: site.coordinates?.latitude ?? null,
      longitude: site.coordinates?.longitude ?? null,
      signals: asJson(Object.entries(site.cityScreens).map(([key, value]) => ({ key, value }))),
      normalized_payload: asJson(site),
    }, { onConflict: "id" });
    if (candidateError) throw safeWriteError("candidate");

    const { error: siteError } = await client.from("sites").upsert({
      id: siteId,
      organization_id: organizationId,
      candidate_site_id: candidateId,
      name: site.address ?? `APN ${site.apnFormatted}`,
      jurisdiction: site.jurisdiction,
      apn: site.apn,
      normalized_apn: site.apn,
      address: site.address,
      city: "San José",
      region: "CA",
      latitude: site.coordinates?.latitude ?? null,
      longitude: site.coordinates?.longitude ?? null,
      geometry_provenance: site.coordinates?.method ?? null,
    }, { onConflict: "id" });
    if (siteError) throw safeWriteError("site");

    for (const evidence of site.evidence) {
      let dataSourceId = dataSourceIds.get(evidence.source.dataset);
      if (!dataSourceId) {
        dataSourceId = deterministicUuid(organizationId, `data-source:${evidence.source.dataset}`);
        const { error } = await client.from("data_sources").upsert({
          id: dataSourceId,
          organization_id: organizationId,
          adapter_key: sourceAdapterKey(evidence.source.dataset),
          display_name: evidence.source.dataset,
          agency: evidence.source.agency,
          jurisdiction: site.jurisdiction,
          base_url: new URL(evidence.source.sourceUrl).origin,
          configuration: asJson({ sourceUrl: evidence.source.sourceUrl }),
          enabled: true,
        }, { onConflict: "id" });
        if (error) throw safeWriteError("evidence data source");
        dataSourceIds.set(evidence.source.dataset, dataSourceId);
      }

      const rawPayload = asJson(evidence.payload ?? { title: evidence.title, excerpt: evidence.excerpt });
      const payloadChecksum = digest(rawPayload);
      const sourceRecordId = deterministicUuid(
        organizationId,
        `source-record:${dataSourceId}:${evidence.source.sourceRecordId}:${payloadChecksum}`,
      );
      const { error: sourceError } = await client.from("source_records").upsert({
        id: sourceRecordId,
        organization_id: organizationId,
        data_source_id: dataSourceId,
        external_record_id: evidence.source.sourceRecordId,
        record_status: "normalized",
        source_uri: evidence.source.sourceUrl,
        retrieved_at: evidence.source.retrievedAt,
        payload_checksum: payloadChecksum,
        raw_payload: rawPayload,
      }, { onConflict: "id", ignoreDuplicates: true });
      if (sourceError) throw safeWriteError("source record");

      const { error: candidateLinkError } = await client.from("candidate_source_records").upsert({
        organization_id: organizationId,
        candidate_site_id: candidateId,
        source_record_id: sourceRecordId,
        match_method: "source_identity",
        match_confidence: 1,
      }, { onConflict: "candidate_site_id,source_record_id", ignoreDuplicates: true });
      if (candidateLinkError) throw safeWriteError("candidate provenance");

      const { error: siteLinkError } = await client.from("site_source_records").upsert({
        organization_id: organizationId,
        site_id: siteId,
        source_record_id: sourceRecordId,
        relationship: "origin",
      }, { onConflict: "site_id,source_record_id", ignoreDuplicates: true });
      if (siteLinkError) throw safeWriteError("site provenance");
    }
  }
}
