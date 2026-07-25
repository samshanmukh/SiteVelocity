import { z } from "zod";
import { SourceRefSchema, type SourceRef } from "../../domain/schemas/core";

/**
 * Source record envelope module (Segment 2 — Government Ingestion).
 *
 * Behavioral contract: prompts/modules/source-record-envelope_typescript.prompt (R1–R11)
 * plus prompts/context/sitevelocity-preamble.prompt (P1–P8).
 * Contract tests: tests/contracts/source-record-envelope.contract.test.ts
 *
 * Wraps ONE raw payload already retrieved from a government endpoint into an
 * immutable, provenance-stamped source record, and groups records into pages.
 * It does not fetch, canonicalize, enrich, deduplicate, qualify, or rank.
 *
 * This module owns the vocabulary shared by every Segment 2 source adapter.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Stable identity of one public-records endpoint. */
export interface SourceDescriptor {
  agency: string;
  dataset: string;
  description: string;
  /** The queryable endpoint, without query string. */
  endpointUrl: string;
  /** Human-facing landing page, or null when the agency publishes none. */
  landingPage: string | null;
}

export const SourceDescriptorSchema = z.object({
  agency: z.string().min(1),
  dataset: z.string().min(1),
  description: z.string(),
  endpointUrl: z.string().url(),
  landingPage: z.string().url().nullable(),
});

/**
 * Injectable JSON transport for one already-policy-checked URL.
 * Adapters accept this so contract tests run offline and deterministically (P4);
 * production callers pass `fetchSourceJson` from ./http-json.
 */
export type SourceTransport = (url: string) => Promise<unknown>;

/** One immutable raw record plus the provenance that proves where it came from. */
export interface SourceRecord<TRaw = JsonValue> {
  provenance: SourceRef;
  raw: TRaw;
}

/** One retrieved page of records from a single query URL. */
export interface SourcePage<TRaw = JsonValue> {
  descriptor: SourceDescriptor;
  queryUrl: string;
  retrievedAt: string;
  pageNumber: number;
  records: SourceRecord<TRaw>[];
  /** Declared by the upstream response only — never inferred from record count. */
  hasMore: boolean;
}

export const EnvelopeRefusalCode = z.enum([
  "missing_source_identity",
  "invalid_source_identity",
  "missing_record_identifier",
  "missing_raw_payload",
]);
export type EnvelopeRefusalCode = z.infer<typeof EnvelopeRefusalCode>;

export interface EnvelopeRefusal {
  code: EnvelopeRefusalCode;
  explanation: string;
}

export type EnvelopeResult<TRaw = JsonValue> =
  | { status: "enveloped"; record: SourceRecord<TRaw> }
  | { status: "refused"; refusals: EnvelopeRefusal[] };

export interface EnvelopeInput<TRaw = JsonValue> {
  descriptor: SourceDescriptor;
  /** The exact URL that produced this payload. */
  queryUrl: string;
  /** ISO-8601 timestamp with offset, captured at retrieval. */
  retrievedAt: string;
  /** Raw field names that may carry the source record identifier, in priority order. */
  identifierFields: string[];
  raw: TRaw;
}

/** Recursively freeze a value so downstream stages cannot mutate retrieved evidence. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

/**
 * Select the source record identifier from the declared identifier fields only.
 * Returns null when no declared field carries a non-blank scalar — the caller
 * refuses rather than manufacturing an identifier (P7).
 */
export function selectRecordIdentifier(raw: unknown, identifierFields: string[]): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  for (const field of identifierFields) {
    const value = record[field];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** Envelope one raw payload into an immutable, provenance-stamped source record. */
export function toSourceRecord<TRaw = JsonValue>(input: EnvelopeInput<TRaw>): EnvelopeResult<TRaw> {
  const refusals: EnvelopeRefusal[] = [];

  if (input.raw === null || input.raw === undefined || typeof input.raw !== "object") {
    refusals.push({
      code: "missing_raw_payload",
      explanation: "The raw payload is absent or is not a record object.",
    });
    return { status: "refused", refusals };
  }

  if (input.descriptor === null || input.descriptor === undefined) {
    refusals.push({
      code: "missing_source_identity",
      explanation: "No source descriptor was declared for this payload.",
    });
  } else if (!SourceDescriptorSchema.safeParse(input.descriptor).success) {
    refusals.push({
      code: "invalid_source_identity",
      explanation: "The source descriptor does not declare a usable agency, dataset, and endpoint URL.",
    });
  }

  const sourceRecordId = selectRecordIdentifier(input.raw, input.identifierFields);
  if (sourceRecordId === null) {
    refusals.push({
      code: "missing_record_identifier",
      explanation: "No declared identifier field carried a non-blank scalar value.",
    });
  }

  const provenanceCandidate = {
    agency: input.descriptor?.agency,
    dataset: input.descriptor?.dataset,
    sourceRecordId: sourceRecordId ?? "",
    sourceUrl: input.queryUrl,
    retrievedAt: input.retrievedAt,
  };
  const provenanceCheck = SourceRefSchema.safeParse(provenanceCandidate);
  if (!provenanceCheck.success && sourceRecordId !== null) {
    refusals.push({
      code: "invalid_source_identity",
      explanation: "Provenance failed schema validation: query URL or retrieval timestamp is not well formed.",
    });
  }

  if (refusals.length > 0) {
    // Collapse duplicate codes so the refusal set stays deterministic.
    const seen = new Set<EnvelopeRefusalCode>();
    const unique = refusals.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
    return { status: "refused", refusals: unique };
  }

  return {
    status: "enveloped",
    record: deepFreeze({
      provenance: Object.freeze(provenanceCheck.data as SourceRef),
      // Clone before freezing so the caller's own object is never mutated or
      // made immutable as a side effect (R7).
      raw: deepFreeze(structuredClone(input.raw)),
    }),
  };
}

export interface PageInput<TRaw = JsonValue> {
  descriptor: SourceDescriptor;
  queryUrl: string;
  retrievedAt: string;
  pageNumber: number;
  records: SourceRecord<TRaw>[];
  /** Continuation declared by the upstream response envelope. */
  hasMore: boolean;
}

/** Group already-enveloped records into one immutable retrieved page. */
export function toSourcePage<TRaw = JsonValue>(input: PageInput<TRaw>): SourcePage<TRaw> {
  return Object.freeze({
    descriptor: input.descriptor,
    queryUrl: input.queryUrl,
    retrievedAt: input.retrievedAt,
    pageNumber: input.pageNumber,
    // Endpoint order is preserved verbatim; this module never sorts or filters.
    records: Object.freeze([...input.records]) as SourceRecord<TRaw>[],
    hasMore: input.hasMore,
  });
}
