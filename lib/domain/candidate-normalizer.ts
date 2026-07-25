import { z } from "zod";

/**
 * Candidate normalization module.
 *
 * Behavioral contract: prompts/modules/candidate-normalizer.prompt (R1–R12)
 * plus prompts/context/sitevelocity-preamble.prompt (P1–P8).
 * Contract tests: tests/contracts/candidate-normalizer.contract.test.ts
 *
 * Converts ONE raw government candidate record, whose source mapping has
 * already been declared, into a canonical candidate-normalization result.
 * It does not fetch data, infer schemas, enrich, deduplicate, qualify, or rank.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const DiagnosticCode = z.enum([
  "missing",
  "blank",
  "malformed",
  "out_of_bounds",
  "not_finite",
  "unresolved_jurisdiction",
]);
export type DiagnosticCode = z.infer<typeof DiagnosticCode>;

export const RejectionCode = z.enum([
  "missing_source_identity",
  "invalid_source_identity",
  "missing_raw_payload",
  "no_location_identity",
]);
export type RejectionCode = z.infer<typeof RejectionCode>;

export interface Diagnostic {
  field: CanonicalField;
  code: DiagnosticCode;
  explanation: string;
}

export interface RejectionReason {
  code: RejectionCode;
  explanation: string;
}

export type CanonicalField =
  | "jurisdiction"
  | "county"
  | "address"
  | "apn"
  | "parcelAcres"
  | "reportedCapacity"
  | "coordinates";

export type Fact<T> =
  | { status: "known"; value: T }
  | { status: "unknown"; reasonCode: DiagnosticCode };

const NumericBounds = z.object({ min: z.number(), max: z.number() });

export const SourceMappingSchema = z.object({
  selectors: z.object({
    jurisdiction: z.string().optional(),
    county: z.string().optional(),
    address: z.string().optional(),
    apn: z.string().optional(),
    parcelAcres: z.string().optional(),
    reportedCapacity: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
  }),
  /** Raw jurisdiction spellings recognized as canonical San José (compared case-insensitively, trimmed). */
  sanJoseAliases: z.array(z.string().min(1)),
  /** Presentation separators that may be removed from a declared APN. Nothing else is altered. */
  apnSeparators: z.array(z.string().min(1)),
  bounds: z.object({
    parcelAcres: NumericBounds,
    reportedCapacity: NumericBounds,
    latitude: NumericBounds,
    longitude: NumericBounds,
  }),
});
export type SourceMapping = z.infer<typeof SourceMappingSchema>;

export const RawSourceSchema = z.object({
  agency: z.string().trim().min(1),
  dataset: z.string().trim().min(1),
  sourceRecordId: z.string().trim().min(1),
  sourceUrl: z.string().trim().url(),
  retrievedAt: z.string().datetime({ offset: true }),
});
export type RawSource = z.infer<typeof RawSourceSchema>;

export interface RawCandidateNormalizationInput {
  source: RawSource;
  rawPayload: { [key: string]: JsonValue };
  mapping: SourceMapping;
}

export interface CanonicalCandidate {
  source: RawSource;
  jurisdiction: Fact<{ value: string; resolution: "canonical" | "unresolved" }>;
  county: Fact<string>;
  address: Fact<string>;
  apn: Fact<string>;
  parcelAcres: Fact<number>;
  reportedCapacity: Fact<number>;
  coordinates: Fact<{ latitude: number; longitude: number }>;
}

export interface Provenance {
  source: RawSource;
  rawPayload: { [key: string]: JsonValue };
  selectedRawValues: Partial<Record<CanonicalField, JsonValue>>;
}

export type CandidateNormalizationResult =
  | { status: "accepted"; candidate: CanonicalCandidate; provenance: Provenance; diagnostics: Diagnostic[] }
  | { status: "rejected"; provenance: Provenance | null; rejectionReasons: RejectionReason[]; diagnostics: Diagnostic[] };

export const CANONICAL_JURISDICTION = "San José";

/** Resolve a dot path ("attributes.APN") against the raw payload. Returns undefined when absent. */
function select(payload: { [key: string]: JsonValue }, path: string | undefined): JsonValue | undefined {
  if (!path) return undefined;
  let current: JsonValue | undefined = payload;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as { [key: string]: JsonValue })[part];
    if (current === undefined) return undefined;
  }
  return current;
}

function unknownFact<T>(code: DiagnosticCode): Fact<T> {
  return { status: "unknown", reasonCode: code };
}

function stringFact(
  raw: JsonValue | undefined,
  field: CanonicalField,
  diagnostics: Diagnostic[],
): Fact<string> {
  if (raw === undefined || raw === null) {
    diagnostics.push({ field, code: "missing", explanation: `${field} not present in raw record.` });
    return unknownFact("missing");
  }
  if (typeof raw !== "string") {
    if (typeof raw === "number" && Number.isFinite(raw)) return { status: "known", value: String(raw) };
    diagnostics.push({ field, code: "malformed", explanation: `${field} is not textual.` });
    return unknownFact("malformed");
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    diagnostics.push({ field, code: "blank", explanation: `${field} is blank.` });
    return unknownFact("blank");
  }
  return { status: "known", value: trimmed };
}

function numberFact(
  raw: JsonValue | undefined,
  field: CanonicalField,
  bounds: { min: number; max: number },
  diagnostics: Diagnostic[],
): Fact<number> {
  if (raw === undefined || raw === null) {
    diagnostics.push({ field, code: "missing", explanation: `${field} not present in raw record.` });
    return unknownFact("missing");
  }
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string" && raw.trim() !== "") {
    const cleaned = raw.trim().replace(/,/g, "");
    // The COMPLETE value must be numeric (R6); partial parses are malformed.
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      diagnostics.push({ field, code: "malformed", explanation: `${field} is not a complete numeric value.` });
      return unknownFact("malformed");
    }
    value = Number(cleaned);
  } else {
    diagnostics.push({ field, code: "malformed", explanation: `${field} is not numeric.` });
    return unknownFact("malformed");
  }
  if (!Number.isFinite(value)) {
    diagnostics.push({ field, code: "not_finite", explanation: `${field} is not finite.` });
    return unknownFact("not_finite");
  }
  if (value < bounds.min || value > bounds.max) {
    diagnostics.push({ field, code: "out_of_bounds", explanation: `${field} ${value} is outside [${bounds.min}, ${bounds.max}].` });
    return unknownFact("out_of_bounds");
  }
  return { status: "known", value };
}

export function normalizeCandidate(input: RawCandidateNormalizationInput): CandidateNormalizationResult {
  const diagnostics: Diagnostic[] = [];

  // R8: reject on missing/invalid source identity or raw payload.
  const sourceParse = RawSourceSchema.safeParse(input.source);
  if (!sourceParse.success) {
    return {
      status: "rejected",
      provenance: null,
      rejectionReasons: [{
        code: "invalid_source_identity",
        explanation: "Source agency, dataset, record identifier, URL, or retrieval timestamp is missing or invalid.",
      }],
      diagnostics,
    };
  }
  const source = sourceParse.data;

  if (input.rawPayload === null || typeof input.rawPayload !== "object" || Array.isArray(input.rawPayload)) {
    return {
      status: "rejected",
      provenance: null,
      rejectionReasons: [{ code: "missing_raw_payload", explanation: "Raw payload is missing or not an object." }],
      diagnostics,
    };
  }

  const mapping = SourceMappingSchema.parse(input.mapping);
  const payload = input.rawPayload;
  const sel = mapping.selectors;

  const selectedRawValues: Partial<Record<CanonicalField, JsonValue>> = {};
  const record = (field: CanonicalField, path: string | undefined) => {
    const value = select(payload, path);
    if (value !== undefined) selectedRawValues[field] = value;
    return value;
  };

  // R2/R10/P1: provenance carries source identity and the untouched raw payload.
  const provenance: Provenance = { source, rawPayload: payload, selectedRawValues };

  // Jurisdiction (R4)
  const rawJurisdiction = record("jurisdiction", sel.jurisdiction);
  const jurisdictionText = stringFact(rawJurisdiction, "jurisdiction", diagnostics);
  let jurisdiction: CanonicalCandidate["jurisdiction"];
  if (jurisdictionText.status === "known") {
    const isSanJose = mapping.sanJoseAliases.some(
      (alias) => alias.trim().toLowerCase() === jurisdictionText.value.toLowerCase(),
    );
    if (isSanJose) {
      jurisdiction = { status: "known", value: { value: CANONICAL_JURISDICTION, resolution: "canonical" } };
    } else {
      diagnostics.push({
        field: "jurisdiction",
        code: "unresolved_jurisdiction",
        explanation: `Jurisdiction "${jurisdictionText.value}" is not a recognized San José variant; retained as unresolved.`,
      });
      jurisdiction = { status: "known", value: { value: jurisdictionText.value, resolution: "unresolved" } };
    }
  } else {
    jurisdiction = { status: "unknown", reasonCode: jurisdictionText.reasonCode };
  }

  const county = stringFact(record("county", sel.county), "county", diagnostics);
  const address = stringFact(record("address", sel.address), "address", diagnostics);

  // APN (R5): remove only declared presentation separators; never manufacture digits.
  const rawApn = record("apn", sel.apn);
  const apnText = stringFact(rawApn, "apn", diagnostics);
  let apn: Fact<string>;
  if (apnText.status === "known") {
    let normalized = apnText.value;
    for (const separator of mapping.apnSeparators) {
      normalized = normalized.split(separator).join("");
    }
    normalized = normalized.trim();
    if (normalized === "") {
      diagnostics.push({ field: "apn", code: "blank", explanation: "APN contains only separators." });
      apn = unknownFact("blank");
    } else {
      apn = { status: "known", value: normalized };
    }
  } else {
    apn = { status: "unknown", reasonCode: apnText.reasonCode };
  }

  const parcelAcres = numberFact(record("parcelAcres", sel.parcelAcres), "parcelAcres", mapping.bounds.parcelAcres, diagnostics);
  const reportedCapacity = numberFact(record("reportedCapacity", sel.reportedCapacity), "reportedCapacity", mapping.bounds.reportedCapacity, diagnostics);

  const latitude = numberFact(record("coordinates", sel.latitude), "coordinates", mapping.bounds.latitude, diagnostics);
  const longitude = numberFact(select(payload, sel.longitude), "coordinates", mapping.bounds.longitude, diagnostics);
  if (sel.longitude) {
    const value = select(payload, sel.longitude);
    if (value !== undefined) selectedRawValues.coordinates = [selectedRawValues.coordinates ?? null, value];
  }
  const coordinates: Fact<{ latitude: number; longitude: number }> =
    latitude.status === "known" && longitude.status === "known"
      ? { status: "known", value: { latitude: latitude.value, longitude: longitude.value } }
      : unknownFact(latitude.status === "unknown" ? latitude.reasonCode : (longitude as { reasonCode: DiagnosticCode }).reasonCode);

  // R9: a record with neither coordinates nor an APN has no location identity.
  if (coordinates.status !== "known" && apn.status !== "known") {
    return {
      status: "rejected",
      provenance,
      rejectionReasons: [{
        code: "no_location_identity",
        explanation: "Neither valid coordinates nor a non-empty APN is available after normalization.",
      }],
      diagnostics,
    };
  }

  const candidate: CanonicalCandidate = {
    source,
    jurisdiction,
    county,
    address,
    apn,
    parcelAcres,
    reportedCapacity,
    coordinates,
  };

  return { status: "accepted", candidate, provenance, diagnostics };
}
