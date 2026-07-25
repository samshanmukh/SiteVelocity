import {
  SourceDescriptorSchema,
  type SourceDescriptor,
} from "../sources/source-record";
import { assertAllowedSourceUrl } from "../../security/url-policy";
import {
  AB2011_MAPPING,
  SAN_JOSE_AB2011,
  SAN_JOSE_GENERAL_PLAN,
  SAN_JOSE_ZONING,
  SCC_PARCELS,
} from "../sources/registry";

/**
 * San José jurisdiction adapter (Segment 2 — Government Ingestion).
 *
 * Behavioral contract: prompts/modules/san-jose-jurisdiction-adapter_typescript.prompt (R1–R14)
 * plus prompts/context/sitevelocity-preamble.prompt (P1–P8).
 * Contract tests: tests/contracts/san-jose-jurisdiction-adapter.contract.test.ts
 *
 * Implements the JurisdictionAdapter port from docs/SYSTEM_DESIGN.md §9.4.
 *
 * This module DECLARES sources. It never retrieves, reads, or interprets a
 * government record, and it performs no network, file, clock, or random access.
 * Every endpoint here is copied verbatim from lib/adapters/sources/registry.ts;
 * no endpoint is authored in this file (P1, P7).
 *
 * FEMA's National Flood Hazard Layer is deliberately absent: it is a federal
 * overlay dataset, not a record category published by this jurisdiction (R6).
 */

/** The six record categories declared by the JurisdictionAdapter port. */
export type RecordCategory =
  | "parcel"
  | "zoning"
  | "planningCase"
  | "permit"
  | "code"
  | "agendaHearing";

export const RECORD_CATEGORIES: readonly RecordCategory[] = Object.freeze([
  "parcel",
  "zoning",
  "planningCase",
  "permit",
  "code",
  "agendaHearing",
]);

/**
 * Jurisdiction adapter port (docs/SYSTEM_DESIGN.md §9.4).
 * Declared here because the port has no other TypeScript home yet.
 */
export interface JurisdictionAdapter {
  getParcelSources(): SourceDescriptor[];
  getZoningSources(): SourceDescriptor[];
  getPlanningCaseSources(): SourceDescriptor[];
  getPermitSources(): SourceDescriptor[];
  getCodeSources(): SourceDescriptor[];
  getAgendaHearingSources(): SourceDescriptor[];
  normalizeParcelId(raw: string): string;
  terminology(): Record<string, string>;
}

/**
 * The two authorities whose records govern land use inside San José, exactly as
 * the prompt vocabulary defines "jurisdiction authority". An agency name is a
 * jurisdiction authority only when it begins with one of these (R6).
 *
 * This list is written from the rule, NOT derived from the registry entries the
 * module happens to declare — deriving it would make the R6 check self-fulfilling.
 */
export const JURISDICTION_AUTHORITY_PREFIXES: readonly string[] = Object.freeze([
  "City of San José",
  "County of Santa Clara",
]);

/** True when `agency` names one of the two jurisdiction authorities (R6). */
export function isJurisdictionAuthority(agency: string): boolean {
  return JURISDICTION_AUTHORITY_PREFIXES.some((prefix) => agency.startsWith(prefix));
}

/**
 * The distinct agencies this module declares. A descriptor from any other agency
 * is not a record published by this jurisdiction (R6).
 */
export const JURISDICTION_AUTHORITIES: readonly string[] = Object.freeze([
  ...new Set([
    SAN_JOSE_AB2011.agency,
    SAN_JOSE_ZONING.agency,
    SAN_JOSE_GENERAL_PLAN.agency,
    SCC_PARCELS.agency,
  ]),
]);

/**
 * Validate one source declaration at the module boundary (R4, R6, R14, P5).
 * Throws on refusal; returns a frozen descriptor on admission.
 *
 * The URL policy is applied with an empty environment allowlist so admission
 * depends only on the security layer's declared static allowlist: the check is
 * deterministic and reads no environment (R12, R13), and it is never looser than
 * the policy's default behaviour, which can only add hosts.
 */
export function declareSourceDescriptor(input: SourceDescriptor): SourceDescriptor {
  const parsed = SourceDescriptorSchema.parse(input);

  if (!isJurisdictionAuthority(parsed.agency)) {
    throw new Error(
      `Source declaration refused: agency for dataset "${parsed.dataset}" is not a San José jurisdiction authority. `
      + "A federal or statewide overlay is not a record published by this jurisdiction.",
    );
  }

  const endpoint = new URL(parsed.endpointUrl);
  if (endpoint.protocol !== "https:") {
    throw new Error(
      `Source declaration refused: endpoint for dataset "${parsed.dataset}" is not served over https.`,
    );
  }
  // R4: the endpoint must be one the source url policy admits, checked here and
  // not left to the contract test, so a future declaration cannot slip past it.
  assertAllowedSourceUrl(parsed.endpointUrl, { environmentAllowlist: [] });

  if (parsed.landingPage !== null) {
    const landing = new URL(parsed.landingPage);
    if (landing.protocol !== "https:") {
      throw new Error(
        `Source declaration refused: landing page for dataset "${parsed.dataset}" is not served over https.`,
      );
    }
    assertAllowedSourceUrl(parsed.landingPage, { environmentAllowlist: [] });
  }

  return Object.freeze({
    agency: parsed.agency,
    dataset: parsed.dataset,
    description: parsed.description,
    endpointUrl: parsed.endpointUrl,
    // null denotes "no landing page is recorded", never "none exists" (R5, P2).
    landingPage: parsed.landingPage,
  });
}

/* -------------------------------------------------------------------------- */
/* Declared sources — every field copied verbatim from the source registry.    */
/* -------------------------------------------------------------------------- */

const AB2011_PARCELS = declareSourceDescriptor({
  agency: SAN_JOSE_AB2011.agency,
  dataset: SAN_JOSE_AB2011.dataset,
  description: SAN_JOSE_AB2011.description,
  endpointUrl: SAN_JOSE_AB2011.layerUrl,
  landingPage: SAN_JOSE_AB2011.landingPage,
});

const COUNTY_PARCELS = declareSourceDescriptor({
  agency: SCC_PARCELS.agency,
  dataset: SCC_PARCELS.dataset,
  description: SCC_PARCELS.description,
  endpointUrl: SCC_PARCELS.endpoint,
  landingPage: SCC_PARCELS.landingPage,
});

const ZONING_DISTRICTS = declareSourceDescriptor({
  agency: SAN_JOSE_ZONING.agency,
  dataset: SAN_JOSE_ZONING.dataset,
  description: SAN_JOSE_ZONING.description,
  endpointUrl: SAN_JOSE_ZONING.layerUrl,
  // The registry records no landing page for this layer (R5, P2).
  landingPage: null,
});

const GENERAL_PLAN = declareSourceDescriptor({
  agency: SAN_JOSE_GENERAL_PLAN.agency,
  dataset: SAN_JOSE_GENERAL_PLAN.dataset,
  description: SAN_JOSE_GENERAL_PLAN.description,
  endpointUrl: SAN_JOSE_GENERAL_PLAN.layerUrl,
  landingPage: null,
});

/**
 * Category → declared sources. Both parcel sources are retained: the City's
 * AB 2011 screening and the County parcel fabric may disagree, and this module
 * keeps both rather than electing a winner (P3).
 */
const DECLARED_SOURCES: Readonly<Record<RecordCategory, readonly SourceDescriptor[]>> =
  Object.freeze({
    parcel: Object.freeze([AB2011_PARCELS, COUNTY_PARCELS]),
    zoning: Object.freeze([ZONING_DISTRICTS, GENERAL_PLAN]),
    planningCase: Object.freeze([]),
    permit: Object.freeze([]),
    code: Object.freeze([]),
    agendaHearing: Object.freeze([]),
  });

/** Every descriptor this module declares, in category order. */
export const DECLARED_DESCRIPTORS: readonly SourceDescriptor[] = Object.freeze(
  RECORD_CATEGORIES.flatMap((category) => [...DECLARED_SOURCES[category]]),
);

/**
 * What an empty descriptor list means. An empty list is a statement about this
 * registry, never about the City's publishing practice (R2, R3, P2).
 */
export const UNDECLARED_CATEGORY_NOTE =
  "No source is declared for this record category in the SiteVelocity source registry. "
  + "Coverage is unknown: this empty list carries no information about what the jurisdiction publishes.";

export interface DeclaredCoverage {
  category: RecordCategory;
  status: "declared";
  descriptors: SourceDescriptor[];
}

export interface UndeclaredCoverage {
  category: RecordCategory;
  status: "undeclared";
  descriptors: SourceDescriptor[];
  meaning: "unknown";
  note: string;
}

export type SourceCoverage = DeclaredCoverage | UndeclaredCoverage;

/** Fresh, frozen copy so a caller cannot mutate this module's declarations (R12). */
function copyDescriptors(category: RecordCategory): SourceDescriptor[] {
  return [...DECLARED_SOURCES[category]];
}

/** Report the coverage status of one record category, with the meaning of empty made explicit. */
export function getSourceCoverage(category: RecordCategory): SourceCoverage {
  const descriptors = copyDescriptors(category);
  if (descriptors.length === 0) {
    return {
      category,
      status: "undeclared",
      descriptors,
      meaning: "unknown",
      note: UNDECLARED_CATEGORY_NOTE,
    };
  }
  return { category, status: "declared", descriptors };
}

/* -------------------------------------------------------------------------- */
/* Parcel identifier normalization                                             */
/* -------------------------------------------------------------------------- */

/** The only characters this jurisdiction prints inside a parcel identifier. */
export const PARCEL_ID_PRESENTATION_SEPARATORS: readonly string[] = Object.freeze(["-", " "]);

/** San José / Santa Clara County APNs are eight decimal digits, e.g. 259-38-014 → 25938014. */
export const CANONICAL_PARCEL_ID_PATTERN = /^\d{8}$/;
export const CANONICAL_PARCEL_ID_DIGITS = 8;

export type ParcelIdReasonCode =
  | "blank_input"
  | "non_digit_character"
  | "unexpected_digit_count";

export interface NormalizedParcelId {
  status: "normalized";
  raw: string;
  value: string;
}

export interface UnrecognizedParcelId {
  status: "unrecognized";
  raw: string;
  /** The caller's input, returned unchanged — never coerced into the canonical shape. */
  value: string;
  reasonCode: ParcelIdReasonCode;
  explanation: string;
}

export type ParcelIdNormalization = NormalizedParcelId | UnrecognizedParcelId;

/**
 * Explanations are static text. Input is never echoed back, so text embedded in
 * a retrieved record cannot travel into a diagnostic or a prompt (P6).
 */
const PARCEL_ID_EXPLANATIONS: Readonly<Record<ParcelIdReasonCode, string>> = Object.freeze({
  blank_input:
    "No characters remained after declared presentation separators were removed; the parcel identifier is unknown.",
  non_digit_character:
    "A character other than a decimal digit remained after declared presentation separators were removed.",
  unexpected_digit_count:
    "The remaining digits do not number exactly eight, so the value does not match the declared parcel identifier shape.",
});

function unrecognized(raw: string, reasonCode: ParcelIdReasonCode): UnrecognizedParcelId {
  return Object.freeze({
    status: "unrecognized" as const,
    raw,
    value: raw,
    reasonCode,
    explanation: PARCEL_ID_EXPLANATIONS[reasonCode],
  });
}

/**
 * Normalize one parcel identifier by removing ONLY declared presentation
 * separators. Nothing is padded, truncated, reordered, or substituted (R7, R8, P7).
 */
export function normalizeParcelIdentifier(raw: string): ParcelIdNormalization {
  let candidate = "";
  for (const character of raw) {
    if (PARCEL_ID_PRESENTATION_SEPARATORS.includes(character)) continue;
    candidate += character;
  }

  if (candidate.length === 0) return unrecognized(raw, "blank_input");
  if (!/^\d+$/.test(candidate)) return unrecognized(raw, "non_digit_character");
  if (candidate.length !== CANONICAL_PARCEL_ID_DIGITS) {
    return unrecognized(raw, "unexpected_digit_count");
  }

  return Object.freeze({ status: "normalized" as const, raw, value: candidate });
}

/** Port-shaped accessor: the normalized digits, or the caller's input unchanged. */
export function normalizeParcelId(raw: string): string {
  return normalizeParcelIdentifier(raw).value;
}

/* -------------------------------------------------------------------------- */
/* Terminology                                                                 */
/* -------------------------------------------------------------------------- */

export const CANONICAL_TERMS: readonly string[] = Object.freeze([
  "parcelIdentifier",
  "parcelFabric",
  "siteAddress",
  "zoningDistrict",
  "plannedDevelopmentOverlay",
  "generalPlan",
  "planningAgency",
  "streamlinedResidentialPathway",
]);

/** The raw APN field name the AB 2011 layer publishes, per the source registry. */
const AB2011_APN_FIELD = AB2011_MAPPING.selectors.apn;
if (AB2011_APN_FIELD === undefined) {
  throw new Error(
    "Source registry declares no APN field for AB2011Parcels2024; the parcel-identifier term cannot be attested.",
  );
}

export type TerminologyCitation =
  | { kind: "source_descriptor"; dataset: string; field: "agency" | "dataset" | "description" }
  | { kind: "source_field"; dataset: string; fieldName: string };

export interface TerminologyAttestation {
  canonicalTerm: string;
  localTerm: string;
  citation: TerminologyCitation;
}

/**
 * Every local term below appears verbatim in a declared source. Nothing here is
 * a term this module invented for the City (R10, R11, P7).
 *
 * Annotated rather than cast: a typo in a citation `field` or a missing key is a
 * compile error here, where a trailing `as TerminologyAttestation[]` would hide it.
 */
const TERMINOLOGY_ATTESTATION_DECLARATIONS: readonly TerminologyAttestation[] = [
  {
    canonicalTerm: "parcelIdentifier",
    localTerm: "APN",
    citation: {
      kind: "source_field",
      dataset: SAN_JOSE_AB2011.dataset,
      fieldName: AB2011_APN_FIELD,
    },
  },
  {
    canonicalTerm: "parcelFabric",
    localTerm: "County parcel fabric",
    citation: { kind: "source_descriptor", dataset: SCC_PARCELS.dataset, field: "description" },
  },
  {
    canonicalTerm: "siteAddress",
    localTerm: "situs address",
    citation: { kind: "source_descriptor", dataset: SCC_PARCELS.dataset, field: "description" },
  },
  {
    canonicalTerm: "zoningDistrict",
    localTerm: "Zoning District",
    citation: { kind: "source_descriptor", dataset: SAN_JOSE_ZONING.dataset, field: "dataset" },
  },
  {
    canonicalTerm: "plannedDevelopmentOverlay",
    localTerm: "PD overlay",
    citation: { kind: "source_descriptor", dataset: SAN_JOSE_ZONING.dataset, field: "description" },
  },
  {
    canonicalTerm: "generalPlan",
    localTerm: "Envision San José 2040 General Plan",
    citation: {
      kind: "source_descriptor",
      dataset: SAN_JOSE_GENERAL_PLAN.dataset,
      field: "description",
    },
  },
  {
    canonicalTerm: "planningAgency",
    localTerm: "Planning, Building & Code Enforcement",
    citation: { kind: "source_descriptor", dataset: SAN_JOSE_AB2011.dataset, field: "agency" },
  },
  {
    canonicalTerm: "streamlinedResidentialPathway",
    localTerm: "AB 2011",
    citation: { kind: "source_descriptor", dataset: SAN_JOSE_AB2011.dataset, field: "description" },
  },
];

export const TERMINOLOGY_ATTESTATIONS: readonly TerminologyAttestation[] = Object.freeze(
  TERMINOLOGY_ATTESTATION_DECLARATIONS.map((attestation) => {
    Object.freeze(attestation.citation);
    return Object.freeze(attestation);
  }),
);

const TERMINOLOGY: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    TERMINOLOGY_ATTESTATIONS.map((a) => [a.canonicalTerm, a.localTerm]),
  ),
);

/** Canonical SiteVelocity term → the wording San José and Santa Clara County publish. */
export function terminology(): Record<string, string> {
  return { ...TERMINOLOGY };
}

/* -------------------------------------------------------------------------- */
/* Port implementation                                                         */
/* -------------------------------------------------------------------------- */

export const sanJoseJurisdictionAdapter: JurisdictionAdapter = Object.freeze({
  getParcelSources: () => copyDescriptors("parcel"),
  getZoningSources: () => copyDescriptors("zoning"),
  getPlanningCaseSources: () => copyDescriptors("planningCase"),
  getPermitSources: () => copyDescriptors("permit"),
  getCodeSources: () => copyDescriptors("code"),
  getAgendaHearingSources: () => copyDescriptors("agendaHearing"),
  normalizeParcelId,
  terminology,
});

export default sanJoseJurisdictionAdapter;
