import { z } from "zod";
import { fetchSourceJson } from "./http-json";
import {
  SourceDescriptorSchema,
  toSourcePage,
  toSourceRecord,
  type EnvelopeRefusal,
  type JsonValue,
  type SourceDescriptor,
  type SourcePage,
  type SourceRecord,
  type SourceTransport,
} from "./source-record";

/**
 * ArcGIS feature source adapter (Segment 2 — Government Ingestion).
 *
 * Behavioral contract: prompts/modules/arcgis-feature-source-adapter_typescript.prompt (R1–R19)
 * plus prompts/context/sitevelocity-preamble.prompt (P1–P8).
 * Contract tests: tests/contracts/arcgis-feature-source-adapter.contract.test.ts
 *
 * Lists features from ONE ArcGIS REST feature/map-service layer as
 * provenance-stamped source pages, following pagination until a declared record
 * limit. It does not normalize, deduplicate, qualify, or rank.
 *
 * The single most important behavior in this module: ArcGIS answers HTTP 200
 * with an `error` object in the body on failure. That body is surfaced as a
 * declared failure and is NEVER reported as "zero features found" (R5/R6, P2).
 */

/* ------------------------------------------------------------------ */
/* Pre-existing single-shot helper — kept for scripts/ingest-candidates */
/* and lib/research/pipeline. Signature unchanged.                      */
/* ------------------------------------------------------------------ */

export const ArcgisFeatureSchema = z.object({
  attributes: z.record(z.string(), z.unknown()),
  geometry: z.unknown().optional(),
});
export type ArcgisFeature = z.infer<typeof ArcgisFeatureSchema>;

const ArcgisQueryResponseSchema = z.object({
  features: z.array(ArcgisFeatureSchema).default([]),
  exceededTransferLimit: z.boolean().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
}).passthrough();

export interface ArcgisQueryOptions {
  where?: string;
  outFields?: string;
  resultRecordCount?: number;
  resultOffset?: number;
  returnGeometry?: boolean;
  outSR?: number;
  geometry?: { x: number; y: number };
  inSR?: number;
}

export async function queryArcgis(layerUrl: string, options: ArcgisQueryOptions = {}): Promise<ArcgisFeature[]> {
  const params = new URLSearchParams({
    where: options.where ?? "1=1",
    outFields: options.outFields ?? "*",
    f: "json",
    returnGeometry: String(options.returnGeometry ?? false),
  });
  if (options.resultRecordCount !== undefined) params.set("resultRecordCount", String(options.resultRecordCount));
  if (options.resultOffset !== undefined) params.set("resultOffset", String(options.resultOffset));
  if (options.outSR !== undefined) params.set("outSR", String(options.outSR));
  if (options.geometry) {
    params.set("geometry", `${options.geometry.x},${options.geometry.y}`);
    params.set("geometryType", "esriGeometryPoint");
    params.set("spatialRel", "esriSpatialRelIntersects");
    params.set("inSR", String(options.inSR ?? 4326));
  }

  const payload = await fetchSourceJson(`${layerUrl}/query?${params.toString()}`);
  const parsed = ArcgisQueryResponseSchema.parse(payload);
  if (parsed.error) {
    throw new Error(`ArcGIS query failed: ${parsed.error.code} ${parsed.error.message}`);
  }
  return parsed.features;
}

/* ------------------------------------------------------------------ */
/* Paged, provenance-stamped listing (the contracted surface)          */
/* ------------------------------------------------------------------ */

/** One feature's attribute bag, preserved verbatim (R14). */
export type ArcgisAttributes = Record<string, JsonValue>;

export type ArcgisSourcePage = SourcePage<ArcgisAttributes>;
export type ArcgisSourceRecord = SourceRecord<ArcgisAttributes>;

/** Declared query input. Nothing else ever reaches the request URL (R1/R2). */
export interface ArcgisListQuery {
  where?: string;
  outFields?: string;
  returnGeometry?: boolean;
  pageSize?: number;
  startOffset?: number;
  /** Declared record limit — pagination never retrieves more features than this. */
  maxRecordCount: number;
}

/** Injected dependencies, so contract tests run offline and deterministically (P4). */
export interface ArcgisListOptions {
  transport: SourceTransport;
  /** Injected clock returning an ISO-8601 timestamp with offset. */
  now: () => string;
  /** Attribute names carrying the source record identifier, in priority order. */
  identifierFields: string[];
  /** Declared page bound. */
  maxPages?: number;
  /** Declared retry bound — additional transport calls per page. Default zero (R16). */
  retryLimit?: number;
}

export type ArcgisStopReason = "exhausted" | "record_limit_reached" | "page_limit_reached";

export type ArcgisFailureCode =
  | "rejected_request"
  | "endpoint_error"
  | "malformed_response"
  | "transport_rejected";

export interface ArcgisFailure {
  code: ArcgisFailureCode;
  /** Authored by this module — never sourced from, or fabricated about, the endpoint. */
  explanation: string;
  /** The request URL under attempt, or null when no request had been built yet. */
  queryUrl: string | null;
  /** One-based page number under attempt, or null when no request had been built yet. */
  pageNumber: number | null;
  /** Verbatim from the endpoint error object, or null when the endpoint declared none (P7). */
  endpointErrorCode: number | null;
  endpointErrorMessage: string | null;
}

export interface ArcgisRefusedFeature {
  pageNumber: number;
  featureIndex: number;
  refusals: EnvelopeRefusal[];
}

export type ArcgisListResult =
  | {
      status: "listed";
      pages: ArcgisSourcePage[];
      recordCount: number;
      stopReason: ArcgisStopReason;
      /** Restates the last retrieved page's exceededTransferLimit (R9). */
      moreRecordsRemain: boolean;
      refusedFeatures: ArcgisRefusedFeature[];
      requestCount: number;
    }
  | {
      status: "failed";
      failure: ArcgisFailure;
      /** Pages retrieved before the failure — never discarded (R17, P3). */
      pages: ArcgisSourcePage[];
      recordCount: number;
      refusedFeatures: ArcgisRefusedFeature[];
      requestCount: number;
    };

export const ARCGIS_DEFAULT_PAGE_SIZE = 1000;
export const ARCGIS_DEFAULT_MAX_PAGES = 100;

const IsoWithOffset = z.string().datetime({ offset: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Build the request URL from the declared query input only (R1/R2).
 * Parameter order is fixed so identical input yields an identical URL (R15/P4).
 */
export function buildArcgisQueryUrl(
  endpointUrl: string,
  query: ArcgisListQuery,
  resultOffset: number,
  resultRecordCount: number,
): string {
  const params = new URLSearchParams();
  params.set("where", query.where ?? "1=1");
  params.set("outFields", query.outFields ?? "*");
  params.set("f", "json");
  params.set("returnGeometry", String(query.returnGeometry ?? false));
  params.set("resultOffset", String(resultOffset));
  params.set("resultRecordCount", String(resultRecordCount));
  return `${endpointUrl.replace(/\/+$/, "")}/query?${params.toString()}`;
}

/**
 * Read the ArcGIS error member that arrives under HTTP 200.
 *
 * ANY present error member other than null/undefined/false is an endpoint error,
 * whatever its shape. Gateways and older services answer with `error: "..."` or
 * `error: [{...}]` rather than the documented object; if those shapes were not
 * recognised, a body such as `{ error: "Token Required.", features: [] }` would
 * take the empty-page path and be reported as an exhausted listing of zero
 * records — exactly the outcome R6/P2 forbid.
 *
 * Values are copied verbatim; a missing code or message stays null rather than
 * being invented (P7).
 */
function readEndpointError(body: unknown): { code: number | null; message: string | null } | null {
  if (!isRecord(body)) return null;
  const error = body.error;
  if (error === undefined || error === null || error === false) return null;
  if (typeof error === "string") return { code: null, message: error };
  if (!isRecord(error)) return { code: null, message: null };
  return {
    code: typeof error.code === "number" && Number.isFinite(error.code) ? error.code : null,
    message: typeof error.message === "string" ? error.message : null,
  };
}

function readFeatures(body: unknown): unknown[] | null {
  if (!isRecord(body)) return null;
  return Array.isArray(body.features) ? body.features : null;
}

/** The attributes bag of one feature, or undefined — the envelope refuses the latter. */
function readAttributes(feature: unknown): unknown {
  if (!isRecord(feature)) return undefined;
  return feature.attributes;
}

function rejectRequest(explanation: string): ArcgisListResult {
  return {
    status: "failed",
    failure: {
      code: "rejected_request",
      explanation,
      queryUrl: null,
      pageNumber: null,
      endpointErrorCode: null,
      endpointErrorMessage: null,
    },
    pages: [],
    recordCount: 0,
    refusedFeatures: [],
    requestCount: 0,
  };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * A layer endpoint URL addresses one layer and carries no query string and no
 * fragment (R18). Rejecting the rest is what keeps R2 true of the descriptor as
 * well as of this module: an endpoint URL such as `.../0?token=SECRET` would
 * otherwise be concatenated into `.../0?token=SECRET/query?where=...`, riding a
 * credential into every request URL and swallowing the declared parameters into
 * the token value.
 */
function isLayerEndpointUrl(endpointUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return false;
  }
  return parsed.search === "" && parsed.hash === "";
}

/**
 * List features from ONE ArcGIS layer as provenance-stamped source pages.
 *
 * Resolves with a declared result for every outcome — including an endpoint
 * error object and a transport rejection — and never rejects.
 */
export async function listArcgisFeatures(
  descriptor: SourceDescriptor,
  query: ArcgisListQuery,
  options: ArcgisListOptions,
): Promise<ArcgisListResult> {
  // R18/P5: validate the request boundary before any transport call is issued.
  if (!SourceDescriptorSchema.safeParse(descriptor).success) {
    return rejectRequest("The source descriptor does not declare a usable agency, dataset, and endpoint URL.");
  }
  if (!isLayerEndpointUrl(descriptor.endpointUrl)) {
    return rejectRequest("The descriptor endpoint URL must address one layer and carry no query string and no fragment.");
  }
  if (!Array.isArray(options.identifierFields) || options.identifierFields.length === 0) {
    return rejectRequest("No identifier fields were declared, so no record identifier could be selected.");
  }
  if (!isPositiveInteger(query.maxRecordCount)) {
    return rejectRequest("The declared record limit must be a positive integer.");
  }
  if (query.pageSize !== undefined && !isPositiveInteger(query.pageSize)) {
    return rejectRequest("The declared page size must be a positive integer.");
  }
  if (query.startOffset !== undefined && (!Number.isInteger(query.startOffset) || query.startOffset < 0)) {
    return rejectRequest("The declared start offset must be a non-negative integer.");
  }
  if (options.maxPages !== undefined && !isPositiveInteger(options.maxPages)) {
    return rejectRequest("The declared page bound must be a positive integer.");
  }
  if (options.retryLimit !== undefined && (!Number.isInteger(options.retryLimit) || options.retryLimit < 0)) {
    return rejectRequest("The declared retry bound must be a non-negative integer.");
  }

  const pageSize = query.pageSize ?? ARCGIS_DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? ARCGIS_DEFAULT_MAX_PAGES;
  const retryLimit = options.retryLimit ?? 0;

  const pages: ArcgisSourcePage[] = [];
  const refusedFeatures: ArcgisRefusedFeature[] = [];
  let recordCount = 0;
  let requestCount = 0;
  let retrievedFeatureCount = 0;
  let resultOffset = query.startOffset ?? 0;
  let moreRecordsRemain = false;
  let stopReason: ArcgisStopReason = "exhausted";

  const failWith = (
    code: ArcgisFailureCode,
    explanation: string,
    queryUrl: string,
    pageNumber: number,
    endpointErrorCode: number | null = null,
    endpointErrorMessage: string | null = null,
  ): ArcgisListResult => ({
    status: "failed",
    failure: { code, explanation, queryUrl, pageNumber, endpointErrorCode, endpointErrorMessage },
    pages,
    recordCount,
    refusedFeatures,
    requestCount,
  });

  for (;;) {
    // R9/R10: stopping because of a declared bound is reported, never silent.
    if (pages.length >= maxPages) {
      stopReason = "page_limit_reached";
      break;
    }
    if (retrievedFeatureCount >= query.maxRecordCount) {
      stopReason = "record_limit_reached";
      break;
    }

    const pageNumber = pages.length + 1;
    const remaining = query.maxRecordCount - retrievedFeatureCount;
    const queryUrl = buildArcgisQueryUrl(descriptor.endpointUrl, query, resultOffset, Math.min(pageSize, remaining));

    const retrievedAt = options.now();
    if (!IsoWithOffset.safeParse(retrievedAt).success) {
      return failWith(
        "rejected_request",
        "The injected clock did not return an ISO-8601 timestamp with an offset.",
        queryUrl,
        pageNumber,
      );
    }

    // R16: at most one plus the declared retry bound transport calls per page.
    let body: unknown;
    let transportRejected = false;
    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      requestCount++;
      try {
        body = await options.transport(queryUrl);
        transportRejected = false;
        break;
      } catch {
        transportRejected = true;
        body = undefined;
      }
    }

    // R17: a transport rejection keeps the pages already retrieved.
    if (transportRejected) {
      return failWith(
        "transport_rejected",
        "The injected transport rejected the page request.",
        queryUrl,
        pageNumber,
      );
    }

    // R5/R6 (P2): the endpoint error object is checked BEFORE any feature read,
    // so an error body can never be reported as "zero features found".
    const endpointError = readEndpointError(body);
    if (endpointError !== null) {
      return failWith(
        "endpoint_error",
        "The endpoint returned an ArcGIS error object instead of a feature set.",
        queryUrl,
        pageNumber,
        endpointError.code,
        endpointError.message,
      );
    }

    // R7/P5: a body carrying neither an error object nor a features array is malformed.
    const features = readFeatures(body);
    if (features === null) {
      return failWith(
        "malformed_response",
        "The response carried neither an ArcGIS error object nor a features array.",
        queryUrl,
        pageNumber,
      );
    }

    // R8: continuation is declared by the endpoint alone, never inferred from counts.
    const hasMore = isRecord(body) && body.exceededTransferLimit === true;

    if (features.length === 0 && hasMore) {
      return failWith(
        "malformed_response",
        "The endpoint declared further records but returned no features at this offset.",
        queryUrl,
        pageNumber,
      );
    }

    // R11/R12/R13/R14: endpoint order preserved; attributes enveloped verbatim;
    // a feature the envelope refuses is reported, never dropped in silence.
    const records: ArcgisSourceRecord[] = [];
    for (let featureIndex = 0; featureIndex < features.length; featureIndex++) {
      const enveloped = toSourceRecord<ArcgisAttributes>({
        descriptor,
        queryUrl,
        retrievedAt,
        identifierFields: options.identifierFields,
        raw: readAttributes(features[featureIndex]) as ArcgisAttributes,
      });
      if (enveloped.status === "enveloped") {
        records.push(enveloped.record);
      } else {
        refusedFeatures.push({ pageNumber, featureIndex, refusals: enveloped.refusals });
      }
    }

    pages.push(
      toSourcePage<ArcgisAttributes>({
        descriptor,
        queryUrl,
        retrievedAt,
        pageNumber,
        records,
        hasMore,
      }),
    );

    // R19/P3: the record limit shrinks the NEXT request (resultRecordCount above),
    // it never truncates what the endpoint already returned. An endpoint that
    // ignores resultRecordCount therefore yields a listing larger than the
    // declared limit, reported under record_limit_reached — retrieved evidence is
    // never silently discarded to make a count look tidy.
    recordCount += records.length;
    retrievedFeatureCount += features.length;
    resultOffset += features.length;
    moreRecordsRemain = hasMore;

    if (!hasMore) {
      stopReason = "exhausted";
      break;
    }
  }

  return {
    status: "listed",
    pages,
    recordCount,
    stopReason,
    moreRecordsRemain,
    refusedFeatures,
    requestCount,
  };
}
