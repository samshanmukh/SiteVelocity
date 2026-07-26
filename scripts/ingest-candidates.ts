import { pathToFileURL } from "node:url";
import { queryArcgis } from "../lib/adapters/sources/arcgis";
import { fetchSourceJson } from "../lib/adapters/sources/http-json";
import { AB2011_MAPPING, SAN_JOSE_AB2011, SCC_PARCELS, SCC_PARCEL_MAPPING } from "../lib/adapters/sources/registry";
import { normalizeCandidate, type JsonValue } from "../lib/domain/candidate-normalizer";
import { ALPHA_THESIS, qualifyValues, type DevelopmentThesis } from "../lib/domain/buy-box";
import { formatApn, type CandidateSet, type CandidateSite } from "../lib/domain/site";
import type { Evidence } from "../lib/domain/schemas/core";
import { runCalculation } from "../lib/calculations/registry";
import { strategyFit, type ScoreOutput } from "../lib/calculations/scoring/alpha-scores";
import type { CalculationRun } from "../lib/calculations/registry";
import { runtimeStoreForOrganization, type RuntimeStore } from "../lib/persistence/runtime-store";
import { getIntegrationConfig } from "../lib/config/env";
import type { ManagedDatasetKey, PersistedManagedIngestionBatch } from "../lib/ingestion/managed-batch";
import { loadLatestManagedIngestionBatch } from "../lib/persistence/managed-ingestion-store";

/**
 * Candidate ingestion (docs/SYSTEM_DESIGN.md §10):
 *   1. Fetch real City of San José AB 2011 opportunity parcels (official inventory).
 *   2. Preserve raw source pages.
 *   3. Enrich by APN from County of Santa Clara parcels (address, jurisdiction,
 *      geometry-derived acreage and centroid — labeled as derivations).
 *   4. Normalize each source record through the candidate-normalizer contract.
 *   5. Qualify against the Alpha buy box; rank deterministically by Strategy Fit.
 *   6. Persist data/candidates.json with provenance and funnel numbers.
 */

const SHORTLIST_SIZE = 15;
const RAW_FETCH_LIMIT = 400;

interface SccParcel {
  apn: string;
  jurisdiction?: string;
  situs_house_number?: string;
  situs_street_name?: string;
  situs_street_type?: string;
  situs_city_name?: string;
  situs_zip_code?: string;
  shape_area_stateplane?: string;
  the_geom?: { type: string; coordinates: number[][][][] };
}

function centroidOfMultiPolygon(geom: SccParcel["the_geom"]): { latitude: number; longitude: number } | null {
  const ring = geom?.coordinates?.[0]?.[0];
  if (!ring || ring.length === 0) return null;
  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
  }
  return { latitude: sumLat / ring.length, longitude: sumLon / ring.length };
}

function buildAddress(parcel: SccParcel): string | null {
  const parts = [parcel.situs_house_number, parcel.situs_street_name, parcel.situs_street_type].filter(
    (p) => typeof p === "string" && p.trim() !== "",
  );
  if (parts.length === 0) return null;
  const city = parcel.situs_city_name?.trim();
  return `${parts.join(" ")}${city ? `, ${titleCase(city)}` : ""}`;
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export interface CandidateIngestionOptions {
  store?: Pick<RuntimeStore, "saveCandidateSet" | "saveRawSourcePage">;
  organizationId?: string;
  loadManagedBatch?: (datasetKey: ManagedDatasetKey) => Promise<PersistedManagedIngestionBatch | null>;
  now?: () => Date;
  log?: (message: string) => void;
  thesis?: DevelopmentThesis;
}

function managedBatchLoader(options: CandidateIngestionOptions) {
  if (options.loadManagedBatch) return options.loadManagedBatch;
  const config = getIntegrationConfig();
  const organizationId = options.organizationId ?? config.SITEVELOCITY_ORGANIZATION_ID;
  const canReadManagedBatches = Boolean(
    organizationId
    && config.SUPABASE_URL
    && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY)
    && config.PERSISTENCE_BACKEND !== "file",
  );
  return canReadManagedBatches && organizationId
    ? (datasetKey: ManagedDatasetKey) => loadLatestManagedIngestionBatch(organizationId, datasetKey)
    : async () => null;
}

function sccParcelFromPayload(payload: Record<string, JsonValue>): SccParcel | null {
  if (typeof payload.apn !== "string" || !/^\d{8}$/.test(payload.apn)) return null;
  return payload as unknown as SccParcel;
}

export async function ingestCandidates(options: CandidateIngestionOptions = {}): Promise<CandidateSet> {
  const store = options.store ?? runtimeStoreForOrganization();
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const log = options.log ?? console.log;
  const loadManagedBatch = managedBatchLoader(options);
  const thesis = options.thesis ?? ALPHA_THESIS;
  log(`[ingest] thesis: ${thesis.name}`);

  // 1. Real AB 2011 records — vacant parcels with the City's screening flags.
  const where = "VACANT='YES'";
  const ab2011QueryUrl = `${SAN_JOSE_AB2011.layerUrl}/query?where=${encodeURIComponent(where)}`;
  const abBatch = await loadManagedBatch("san_jose_ab2011");
  const abRetrievedAt = abBatch?.retrievedAt ?? retrievedAt;
  const abFeatures = abBatch
    ? abBatch.records
      .map((record) => ({ attributes: record.payload }))
      .filter((feature) => feature.attributes.VACANT === "YES")
      .slice(0, RAW_FETCH_LIMIT)
    : await queryArcgis(SAN_JOSE_AB2011.layerUrl, {
      where,
      outFields: "*",
      resultRecordCount: RAW_FETCH_LIMIT,
      returnGeometry: false,
    });
  log(`[ingest] AB2011 vacant parcels ${abBatch ? "loaded from Nexla" : "fetched directly"}: ${abFeatures.length}`);
  await store.saveRawSourcePage("ab2011-vacant", 1, {
    source: {
      ...SAN_JOSE_AB2011,
      queryUrl: ab2011QueryUrl,
      retrievedAt: abRetrievedAt,
      transport: abBatch ? "nexla" : "direct",
      managedBatchId: abBatch?.id ?? null,
    },
    features: abFeatures,
  });

  // 2. Enrich by APN from county parcels, in Socrata batches.
  const apns = [...new Set(
    abFeatures
      .map((f) => String(f.attributes.APN ?? "").trim())
      .filter((apn) => /^\d{8}$/.test(apn)),
  )];
  const parcelByApn = new Map<string, SccParcel>();
  const parcelRetrievedAt = new Map<string, string>();
  const parcelBatch = await loadManagedBatch("santa_clara_parcels");
  if (parcelBatch) {
    const relevantApns = new Set(apns);
    for (const record of parcelBatch.records) {
      const parcel = sccParcelFromPayload(record.payload);
      if (!parcel || !relevantApns.has(parcel.apn) || parcelByApn.has(parcel.apn)) continue;
      parcelByApn.set(parcel.apn, parcel);
      parcelRetrievedAt.set(parcel.apn, parcelBatch.retrievedAt);
    }
    await store.saveRawSourcePage("scc-parcels-managed", 1, {
      source: {
        ...SCC_PARCELS,
        retrievedAt: parcelBatch.retrievedAt,
        transport: "nexla",
        managedBatchId: parcelBatch.id,
      },
      recordsConsidered: parcelBatch.records.length,
      matchedApns: parcelByApn.size,
    });
    log(`[ingest] county parcels loaded from Nexla: ${parcelByApn.size}/${apns.length}`);
  }
  const batchSize = 50;
  const missingApns = apns.filter((apn) => !parcelByApn.has(apn));
  for (let i = 0; i < missingApns.length; i += batchSize) {
    const batch = missingApns.slice(i, i + batchSize);
    const list = batch.map((a) => `'${a}'`).join(",");
    const url = `${SCC_PARCELS.endpoint}?$where=apn in(${list})&$limit=${batchSize * 2}`;
    const rows = (await fetchSourceJson(encodeURI(url).replace(/\$/g, "%24"))) as SccParcel[];
    for (const row of rows) {
      if (row.apn && !parcelByApn.has(row.apn)) {
        parcelByApn.set(row.apn, row);
        parcelRetrievedAt.set(row.apn, retrievedAt);
      }
    }
    if (i / batchSize < 3 || i + batchSize >= missingApns.length) {
      await store.saveRawSourcePage("scc-parcels", i / batchSize + 1, {
        source: { ...SCC_PARCELS, queryUrl: url, retrievedAt },
        rows,
      });
    }
    log(`[ingest] county parcels enriched: ${parcelByApn.size}/${apns.length}`);
  }

  // 3–5. Normalize, merge, qualify, score.
  const sites: CandidateSite[] = [];
  let qualifiedCount = 0;

  for (const feature of abFeatures) {
    const abResult = normalizeCandidate({
      source: {
        agency: SAN_JOSE_AB2011.agency,
        dataset: SAN_JOSE_AB2011.dataset,
        sourceRecordId: String(feature.attributes.OBJECTID ?? feature.attributes.APN ?? "unknown"),
        sourceUrl: ab2011QueryUrl,
        retrievedAt: abRetrievedAt,
      },
      rawPayload: feature.attributes as { [key: string]: JsonValue },
      mapping: AB2011_MAPPING,
    });
    if (abResult.status !== "accepted" || abResult.candidate.apn.status !== "known") continue;
    const apn = abResult.candidate.apn.value;

    const parcel = parcelByApn.get(apn);
    let parcelCandidate = null;
    if (parcel) {
      const { the_geom: _geom, ...parcelAttributes } = parcel;
      void _geom;
      const parcelResult = normalizeCandidate({
        source: {
          agency: SCC_PARCELS.agency,
          dataset: SCC_PARCELS.dataset,
          sourceRecordId: apn,
          sourceUrl: `${SCC_PARCELS.endpoint}?apn=${apn}`,
          retrievedAt: parcelRetrievedAt.get(apn) ?? retrievedAt,
        },
        rawPayload: parcelAttributes as { [key: string]: JsonValue },
        mapping: SCC_PARCEL_MAPPING,
      });
      if (parcelResult.status === "accepted") parcelCandidate = parcelResult.candidate;
    }

    const abEvidenceId = `ev-ab2011-${apn}`;
    const parcelEvidenceId = `ev-sccparcel-${apn}`;
    const evidence: Evidence[] = [
      {
        id: abEvidenceId,
        source: {
          agency: SAN_JOSE_AB2011.agency,
          dataset: SAN_JOSE_AB2011.dataset,
          sourceRecordId: String(feature.attributes.OBJECTID ?? apn),
          sourceUrl: ab2011QueryUrl,
          retrievedAt: abRetrievedAt,
        },
        title: `AB 2011 eligible parcel screening — APN ${formatApn(apn)}`,
        excerpt: `City screening (Apr 2024): zoning ${String(feature.attributes.ZONINGABBR ?? "—")}, vacant ${String(feature.attributes.VACANT ?? "—")}, flood ${String(feature.attributes.FLOOD ?? "—")}, wetlands ${String(feature.attributes.WETLANDS ?? "—")}, historic ${String(feature.attributes.HISTORICSI ?? "—")}.`,
        payload: feature.attributes,
      },
    ];
    if (parcel) {
      evidence.push({
        id: parcelEvidenceId,
        source: {
          agency: SCC_PARCELS.agency,
          dataset: SCC_PARCELS.dataset,
          sourceRecordId: apn,
          sourceUrl: `${SCC_PARCELS.landingPage}`,
          retrievedAt: parcelRetrievedAt.get(apn) ?? retrievedAt,
        },
        title: `County parcel record — APN ${formatApn(apn)}`,
        excerpt: `Situs ${buildAddress(parcel) ?? "not recorded"} · jurisdiction ${parcel.jurisdiction ?? "—"} · state-plane area ${parcel.shape_area_stateplane ?? "—"} sq ft.`,
        payload: { ...parcel, the_geom: undefined },
      });
    }

    const areaSqFt = parcel?.shape_area_stateplane ? Number(parcel.shape_area_stateplane) : NaN;
    const acresDerived = Number.isFinite(areaSqFt) && areaSqFt > 0 && parcel
      ? {
          value: Math.round((areaSqFt / 43_560) * 100) / 100,
          method: "county_parcel_stateplane_area_sqft / 43560 (GIS-derived, not a survey)",
          evidenceId: parcelEvidenceId,
        }
      : null;
    const centroid = parcel ? centroidOfMultiPolygon(parcel.the_geom) : null;
    const coordinates = centroid && parcel
      ? { ...centroid, method: "county_parcel_geometry_centroid (GIS-derived)", evidenceId: parcelEvidenceId }
      : null;

    const jurisdictionFact = parcelCandidate?.jurisdiction;
    const jurisdictionCanonical = jurisdictionFact?.status === "known"
      ? jurisdictionFact.value.resolution === "canonical"
      : null;
    const jurisdictionLabel = jurisdictionFact?.status === "known" ? jurisdictionFact.value.value : null;

    const qualification = qualifyValues(
      {
        jurisdictionCanonical,
        jurisdictionLabel,
        county: parcel ? "Santa Clara" : null,
        acres: acresDerived?.value ?? null,
        capacity: null,
        hasLocationIdentity: coordinates !== null || apn.length > 0,
      },
      thesis,
    );
    if (!qualification.qualified) continue;
    qualifiedCount += 1;

    const fit: CalculationRun<ScoreOutput> = runCalculation(strategyFit, {
      jurisdictionCanonical,
      parcelAcres: acresDerived?.value ?? null,
      sizeWindow: { min: thesis.minAcres, max: thesis.maxAcres },
      reportedCapacity: null,
      preferredMinCapacity: thesis.preferredMinCapacity,
      hasLocationIdentity: coordinates !== null,
      fromAuthoritativeInventory: true,
    }, () => retrievedAt);

    const screens: Record<string, string> = {};
    for (const key of ["FLOOD", "WETLANDS", "HISTORICSI", "HABITAT", "FARMLAND", "CONSERVATI", "WASTESITE", "FREEWAY500", "URBANVILLA", "VACANT"]) {
      const value = feature.attributes[key];
      if (typeof value === "string") screens[key] = value;
    }

    sites.push({
      id: `sj-${apn}`,
      apn,
      apnFormatted: formatApn(apn),
      jurisdiction: jurisdictionLabel ?? "San José",
      county: parcel ? "Santa Clara" : null,
      address: parcel ? buildAddress(parcel) : null,
      acresDerived,
      coordinates,
      zoningAbbr: typeof feature.attributes.ZONINGABBR === "string" ? feature.attributes.ZONINGABBR : null,
      vacant: feature.attributes.VACANT === "YES" ? true : feature.attributes.VACANT === "NO" ? false : null,
      cityScreens: screens,
      evidence,
      qualification,
      strategyFit: fit,
      rank: 0,
      scoutReasons: [
        "Listed in the City of San José AB 2011 opportunity screening (Apr 2024)",
        ...qualification.reasons,
      ],
    });
  }

  // Deterministic ranking: Strategy Fit desc, then clean city screens, then APN.
  const cleanScreenCount = (s: CandidateSite) =>
    Object.entries(s.cityScreens).filter(([k, v]) => k !== "VACANT" && k !== "URBANVILLA" && v === "NO").length;
  sites.sort((a, b) =>
    b.strategyFit.output.score - a.strategyFit.output.score
    || cleanScreenCount(b) - cleanScreenCount(a)
    || a.apn.localeCompare(b.apn));
  const shortlist = sites.slice(0, SHORTLIST_SIZE).map((site, index) => ({ ...site, rank: index + 1 }));

  const set: CandidateSet = {
    generatedAt: retrievedAt,
    thesisId: thesis.id,
    funnel: {
      rawRecords: abFeatures.length,
      enriched: parcelByApn.size,
      qualified: qualifiedCount,
      shortlisted: shortlist.length,
    },
    sources: [
      { agency: SAN_JOSE_AB2011.agency, dataset: SAN_JOSE_AB2011.dataset, url: ab2011QueryUrl, retrievedAt: abRetrievedAt, recordCount: abFeatures.length },
      { agency: SCC_PARCELS.agency, dataset: SCC_PARCELS.dataset, url: SCC_PARCELS.landingPage, retrievedAt: parcelBatch?.retrievedAt ?? retrievedAt, recordCount: parcelByApn.size },
    ],
    sites: shortlist,
  };

  await store.saveCandidateSet(set);
  log(`[ingest] funnel: raw ${set.funnel.rawRecords} -> enriched ${set.funnel.enriched} -> qualified ${set.funnel.qualified} -> shortlist ${set.funnel.shortlisted}`);
  return set;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  ingestCandidates().catch((error) => {
    console.error("[ingest] failed:", error);
    process.exitCode = 1;
  });
}
