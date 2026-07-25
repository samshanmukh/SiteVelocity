import { queryArcgis } from "../lib/adapters/sources/arcgis";
import { fetchSourceJson } from "../lib/adapters/sources/http-json";
import { AB2011_MAPPING, SAN_JOSE_AB2011, SCC_PARCELS, SCC_PARCEL_MAPPING } from "../lib/adapters/sources/registry";
import { normalizeCandidate, type JsonValue } from "../lib/domain/candidate-normalizer";
import { ALPHA_THESIS, qualifyValues } from "../lib/domain/buy-box";
import { formatApn, type CandidateSet, type CandidateSite } from "../lib/domain/site";
import type { Evidence } from "../lib/domain/schemas/core";
import { runCalculation } from "../lib/calculations/registry";
import { strategyFit, type ScoreOutput } from "../lib/calculations/scoring/alpha-scores";
import type { CalculationRun } from "../lib/calculations/registry";
import { saveCandidateSet, saveRawSourcePage } from "../lib/persistence/file-store";

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

async function main(): Promise<void> {
  const retrievedAt = new Date().toISOString();
  console.log(`[ingest] thesis: ${ALPHA_THESIS.name}`);

  // 1. Real AB 2011 records — vacant parcels with the City's screening flags.
  const where = "VACANT='YES'";
  const ab2011QueryUrl = `${SAN_JOSE_AB2011.layerUrl}/query?where=${encodeURIComponent(where)}`;
  const abFeatures = await queryArcgis(SAN_JOSE_AB2011.layerUrl, {
    where,
    outFields: "*",
    resultRecordCount: RAW_FETCH_LIMIT,
    returnGeometry: false,
  });
  console.log(`[ingest] AB2011 vacant parcels fetched: ${abFeatures.length}`);
  await saveRawSourcePage("ab2011-vacant", 1, {
    source: { ...SAN_JOSE_AB2011, queryUrl: ab2011QueryUrl, retrievedAt },
    features: abFeatures,
  });

  // 2. Enrich by APN from county parcels, in Socrata batches.
  const apns = [...new Set(
    abFeatures
      .map((f) => String(f.attributes.APN ?? "").trim())
      .filter((apn) => /^\d{8}$/.test(apn)),
  )];
  const parcelByApn = new Map<string, SccParcel>();
  const batchSize = 50;
  for (let i = 0; i < apns.length; i += batchSize) {
    const batch = apns.slice(i, i + batchSize);
    const list = batch.map((a) => `'${a}'`).join(",");
    const url = `${SCC_PARCELS.endpoint}?$where=apn in(${list})&$limit=${batchSize * 2}`;
    const rows = (await fetchSourceJson(encodeURI(url).replace(/\$/g, "%24"))) as SccParcel[];
    for (const row of rows) {
      if (row.apn && !parcelByApn.has(row.apn)) parcelByApn.set(row.apn, row);
    }
    if (i / batchSize < 3 || i + batchSize >= apns.length) {
      await saveRawSourcePage("scc-parcels", i / batchSize + 1, {
        source: { ...SCC_PARCELS, queryUrl: url, retrievedAt },
        rows,
      });
    }
    process.stdout.write(`\r[ingest] county parcels enriched: ${parcelByApn.size}/${apns.length}`);
  }
  console.log("");

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
        retrievedAt,
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
      const parcelResult = normalizeCandidate({
        source: {
          agency: SCC_PARCELS.agency,
          dataset: SCC_PARCELS.dataset,
          sourceRecordId: apn,
          sourceUrl: `${SCC_PARCELS.endpoint}?apn=${apn}`,
          retrievedAt,
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
          retrievedAt,
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
          retrievedAt,
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
      ALPHA_THESIS,
    );
    if (!qualification.qualified) continue;
    qualifiedCount += 1;

    const fit: CalculationRun<ScoreOutput> = runCalculation(strategyFit, {
      jurisdictionCanonical,
      parcelAcres: acresDerived?.value ?? null,
      sizeWindow: { min: ALPHA_THESIS.minAcres, max: ALPHA_THESIS.maxAcres },
      reportedCapacity: null,
      preferredMinCapacity: ALPHA_THESIS.preferredMinCapacity,
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
    thesisId: ALPHA_THESIS.id,
    funnel: {
      rawRecords: abFeatures.length,
      enriched: parcelByApn.size,
      qualified: qualifiedCount,
      shortlisted: shortlist.length,
    },
    sources: [
      { agency: SAN_JOSE_AB2011.agency, dataset: SAN_JOSE_AB2011.dataset, url: ab2011QueryUrl, retrievedAt, recordCount: abFeatures.length },
      { agency: SCC_PARCELS.agency, dataset: SCC_PARCELS.dataset, url: SCC_PARCELS.landingPage, retrievedAt, recordCount: parcelByApn.size },
    ],
    sites: shortlist,
  };

  await saveCandidateSet(set);
  console.log(`[ingest] funnel: raw ${set.funnel.rawRecords} -> enriched ${set.funnel.enriched} -> qualified ${set.funnel.qualified} -> shortlist ${set.funnel.shortlisted}`);
  console.log("[ingest] wrote data/candidates.json");
}

main().catch((error) => {
  console.error("[ingest] failed:", error);
  process.exitCode = 1;
});
