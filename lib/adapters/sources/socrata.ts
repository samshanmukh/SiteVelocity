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
 * Socrata resource source adapter (Segment 2 — Government Ingestion).
 *
 * Behavioral contract: prompts/modules/socrata-resource-source-adapter_typescript.prompt (R1–R21)
 * plus prompts/context/sitevelocity-preamble.prompt (P1–P8).
 * Contract tests: tests/contracts/socrata-resource-source-adapter.contract.test.ts
 *
 * Lists rows from ONE Socrata resource endpoint (for example County of Santa Clara
 * parcels, https://data.sccgov.org/resource/ubcd-cewv.json) as provenance-stamped
 * source pages, including batched lookups of a declared key set.
 *
 * It does not fetch on its own (every retrieval goes through an injected
 * SourceTransport), does not read a clock other than the injected one, and does not
 * canonicalize, deduplicate, merge, or reconcile rows — those belong to the
 * Candidate Pipeline segment.
 */

/** One raw Socrata row. Field names are the dataset's own; nothing is renamed here. */
export type SocrataRow = { [key: string]: JsonValue };

/** Injected retrieval clock — the module's only declared external dependency (R13, P4). */
export type SourceClock = () => Date;

export interface SocrataAdapterOptions {
  /** Injected transport so contract tests run offline (R1). */
  transport: SourceTransport;
  /** Injected clock; defaults to the wall clock in production callers. */
  now?: SourceClock;
}

/** Closed predicate set. There is deliberately no free-form `$where` escape hatch (R5, R6). */
export type SocrataPredicate =
  | { kind: "equals"; field: string; value: string }
  | { kind: "keyIn"; field: string; values: string[] }
  | { kind: "isNotNull"; field: string };

export interface SocrataListQuery {
  /** Raw field names that may carry the source record identifier, in priority order. */
  identifierFields: string[];
  /** Socrata `$limit` — also the paging stride and the short-page threshold. */
  limit: number;
  /** Socrata `$offset` for the first page. Defaults to 0. */
  offset?: number;
  /** Upper bound on pages retrieved. Defaults to DEFAULT_MAX_PAGES. */
  maxPages?: number;
  select?: string[];
  order?: string[];
  where?: SocrataPredicate[];
}

export interface SocrataKeySetQuery {
  identifierFields: string[];
  /** The field the declared keys are matched against. */
  keyField: string;
  /** Requested keys, preserved verbatim including order and repeats (R9). */
  keys: string[];
  /** Number of keys per `in(...)` predicate. */
  batchSize: number;
  /** Socrata `$limit` used while paging inside one batch. */
  limit: number;
  maxPagesPerBatch?: number;
  select?: string[];
  order?: string[];
  /** Further declared predicates ANDed with the key-set predicate. */
  additionalPredicates?: SocrataPredicate[];
}

export type SocrataFailureCode =
  | "malformed_descriptor"
  | "malformed_query"
  | "malformed_field_name"
  | "non_array_response"
  | "transport_rejected";

export interface SocrataFailure {
  code: SocrataFailureCode;
  /** The URL that was attempted, or null when the refusal happened before any call. */
  queryUrl: string | null;
  explanation: string;
}

/** A row the shared envelope declined — retained so no row disappears without a trace (R8, P2). */
export interface SocrataRowRefusal {
  queryUrl: string;
  batchNumber: number | null;
  pageNumber: number;
  rowIndex: number;
  refusals: EnvelopeRefusal[];
}

export type SocrataListResult =
  | {
      status: "listed";
      pages: SourcePage<SocrataRow>[];
      rowRefusals: SocrataRowRefusal[];
      /** True when the page cap stopped paging while the endpoint still declared more. */
      stoppedAtPageLimit: boolean;
    }
  | { status: "failed"; failure: SocrataFailure };

/**
 * Per-requested-key accounting (R10, R11, P2).
 * `not_returned` records only that the endpoint returned no such row. It is NOT a
 * zero count and NOT a claim that the record does not exist.
 */
export type SocrataKeyAccount =
  | { key: string; status: "returned"; rowCount: number; batchNumbers: number[] }
  | { key: string; status: "not_returned"; existence: "unknown"; explanation: string };

export interface SocrataBatchResult {
  batchNumber: number;
  /** The batch's slice of the declared key set, verbatim. */
  keys: string[];
  /** Pages in retrieval order; page numbers restart at 1 within each batch. */
  pages: SourcePage<SocrataRow>[];
}

export type SocrataKeyLookupResult =
  | {
      status: "looked_up";
      batches: SocrataBatchResult[];
      accounting: SocrataKeyAccount[];
      rowRefusals: SocrataRowRefusal[];
      stoppedAtPageLimit: boolean;
    }
  | { status: "failed"; failure: SocrataFailure };

const DEFAULT_MAX_PAGES = 50;

/** Socrata identifiers are bare: leading letter/underscore, then letters, digits, underscores. */
const BARE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ORDER_TERM = /^[A-Za-z_][A-Za-z0-9_]*(?: (?:ASC|DESC|asc|desc))?$/;
const CREDENTIAL_PARAM_NAME = /(?:token|secret|password|signature|apikey|api_key|auth)/i;

const NOT_RETURNED_EXPLANATION =
  "The endpoint returned no row carrying this key at the declared key field. "
  + "Whether a record with this key is held by the agency remains unknown.";

type Checked<T> = { ok: true; value: T } | { ok: false; failure: SocrataFailure };

function fail(code: SocrataFailureCode, explanation: string, queryUrl: string | null = null): SocrataFailure {
  return { code, queryUrl, explanation };
}

/**
 * Strip anything credential-shaped out of free text before it reaches a caller (R17).
 * Transports phrase their errors freely, so this covers the four shapes a credential
 * actually arrives in: URL userinfo (with and without a scheme), a query parameter,
 * a header or key/value pair, and a bare `Bearer`/`Basic`/`Token` value.
 */
function redactCredentials(text: string): string {
  return text
    .replace(/\/\/[^/\s@]+:[^/\s@]+@/g, "//[redacted]@")
    .replace(/\b[\w.%+-]+:[^\s/@]+@([\w.-]+)/g, "[redacted]@$1")
    .replace(
      /([?&#])([\w.-]*(?:token|secret|password|signature|apikey|api_key|auth)[\w.-]*)=([^&\s"']*)/gi,
      "$1$2=[redacted]",
    )
    .replace(
      /\b([\w-]*(?:token|secret|password|signature|apikey|api[_-]?key|authorization|credential)[\w-]*)\s*[:=]\s*(?:Bearer\s+|Basic\s+|Token\s+)?["']?[^\s"',;)]+/gi,
      "$1=[redacted]",
    )
    .replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]");
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Quote one SoQL string literal. A single quote inside the value is doubled, so no
 * character in a caller-supplied key can end, extend, or add a predicate term (R6).
 */
function quoteSoqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Boundary check on the descriptor before any transport call (R16, P5). */
function checkDescriptor(descriptor: SourceDescriptor): SocrataFailure | null {
  const parsed = SourceDescriptorSchema.safeParse(descriptor);
  if (!parsed.success) {
    return fail(
      "malformed_descriptor",
      "The source descriptor does not declare an agency, dataset, and endpoint URL.",
    );
  }
  let endpoint: URL;
  try {
    endpoint = new URL(descriptor.endpointUrl);
  } catch {
    return fail("malformed_descriptor", "The descriptor endpoint is not a parsable URL.");
  }
  if (endpoint.username !== "" || endpoint.password !== "") {
    return fail("malformed_descriptor", "The descriptor endpoint carries userinfo credentials.");
  }
  if (endpoint.search !== "") {
    const carriesCredential = [...endpoint.searchParams.keys()].some((name) =>
      CREDENTIAL_PARAM_NAME.test(name),
    );
    return fail(
      "malformed_descriptor",
      carriesCredential
        ? "The descriptor endpoint carries a credential query parameter."
        : "The descriptor endpoint carries a query string; query parameters must be declared by the caller.",
    );
  }
  if (endpoint.hash !== "") {
    return fail("malformed_descriptor", "The descriptor endpoint carries a fragment.");
  }
  return null;
}

function checkPositiveInteger(value: number, label: string): SocrataFailure | null {
  if (!Number.isInteger(value) || value < 1) {
    return fail("malformed_query", `${label} must be an integer of at least 1.`);
  }
  return null;
}

function checkIdentifierFields(identifierFields: unknown): SocrataFailure | null {
  if (!Array.isArray(identifierFields) || identifierFields.length === 0) {
    return fail("malformed_query", "At least one identifier field must be declared.");
  }
  const allNamed = identifierFields.every((field) => typeof field === "string" && field.trim() !== "");
  if (!allNamed) {
    return fail("malformed_query", "Every declared identifier field must be a non-blank field name.");
  }
  return null;
}

function checkProjection(select: string[] | undefined, order: string[] | undefined): SocrataFailure | null {
  // Boundary validation, not type trust: these arrive from callers and from stored
  // descriptors, so a non-array must be a declared failure, never a thrown TypeError (P5).
  if (select !== undefined && !Array.isArray(select)) {
    return fail("malformed_query", "$select must be declared as an array of bare field names.");
  }
  if (order !== undefined && !Array.isArray(order)) {
    return fail("malformed_query", "$order must be declared as an array of order terms.");
  }
  for (const field of select ?? []) {
    if (typeof field !== "string" || !BARE_FIELD_NAME.test(field)) {
      return fail("malformed_field_name", "A declared $select field is not a bare field name.");
    }
  }
  for (const term of order ?? []) {
    if (typeof term !== "string" || !ORDER_TERM.test(term)) {
      return fail("malformed_field_name", "A declared $order term is not a bare field name with an optional direction.");
    }
  }
  return null;
}

/** Compile declared predicates into one `$where` clause, or refuse (R5, R6). */
function compileWhere(predicates: SocrataPredicate[]): Checked<string | null> {
  if (!Array.isArray(predicates)) {
    return { ok: false, failure: fail("malformed_query", "Declared predicates must be supplied as an array.") };
  }
  const terms: string[] = [];
  for (const predicate of predicates) {
    if (typeof predicate?.field !== "string" || !BARE_FIELD_NAME.test(predicate.field)) {
      return {
        ok: false,
        failure: fail("malformed_field_name", "A declared predicate field is not a bare field name."),
      };
    }
    switch (predicate.kind) {
      case "equals": {
        if (typeof predicate.value !== "string") {
          return { ok: false, failure: fail("malformed_query", "An equals predicate value must be a string.") };
        }
        terms.push(`${predicate.field} = ${quoteSoqlLiteral(predicate.value)}`);
        break;
      }
      case "keyIn": {
        if (!Array.isArray(predicate.values) || predicate.values.length === 0) {
          return { ok: false, failure: fail("malformed_query", "A keyIn predicate must declare at least one key.") };
        }
        if (!predicate.values.every((value) => typeof value === "string")) {
          return { ok: false, failure: fail("malformed_query", "Every keyIn predicate key must be a string.") };
        }
        terms.push(`${predicate.field} in(${predicate.values.map(quoteSoqlLiteral).join(",")})`);
        break;
      }
      case "isNotNull": {
        terms.push(`${predicate.field} IS NOT NULL`);
        break;
      }
      default: {
        return { ok: false, failure: fail("malformed_query", "An undeclared predicate kind was supplied.") };
      }
    }
  }
  return { ok: true, value: terms.length === 0 ? null : terms.join(" AND ") };
}

/** Compose a query URL from the endpoint plus the declared parameters, in fixed order (R2). */
function buildQueryUrl(endpointUrl: string, params: Array<[string, string]>): string {
  const query = params
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  return query === "" ? endpointUrl : `${endpointUrl}?${query}`;
}

interface PageSpec {
  identifierFields: string[];
  select?: string[];
  order?: string[];
  where: string | null;
  limit: number;
  offset: number;
  maxPages: number;
  batchNumber: number | null;
  /** When set, the string form of this field is observed on every retrieved row (R10). */
  keyField?: string;
}

interface PageRun {
  pages: SourcePage<SocrataRow>[];
  rowRefusals: SocrataRowRefusal[];
  stoppedAtPageLimit: boolean;
  /**
   * Key-field string form of every row the endpoint RETRIEVED, in retrieval order,
   * including rows the shared envelope declined. Key accounting is about what the
   * endpoint returned, not about what survived enveloping (R10, R11).
   */
  retrievedKeyForms: string[];
}

type PageRunOutcome = { ok: true; value: PageRun } | { ok: false; failure: SocrataFailure };

/**
 * Page through one query with `$limit`/`$offset` until a short page (R3, R4, R12).
 * Row order and page order are preserved verbatim (R7, R20).
 */
async function pageThrough(
  descriptor: SourceDescriptor,
  spec: PageSpec,
  transport: SourceTransport,
  now: SourceClock,
): Promise<PageRunOutcome> {
  const pages: SourcePage<SocrataRow>[] = [];
  const rowRefusals: SocrataRowRefusal[] = [];
  const retrievedKeyForms: string[] = [];
  let offset = spec.offset;
  let stoppedAtPageLimit = false;

  for (let pageNumber = 1; pageNumber <= spec.maxPages; pageNumber += 1) {
    const params: Array<[string, string]> = [];
    if (spec.select && spec.select.length > 0) params.push(["$select", spec.select.join(",")]);
    if (spec.where !== null) params.push(["$where", spec.where]);
    if (spec.order && spec.order.length > 0) params.push(["$order", spec.order.join(",")]);
    params.push(["$limit", String(spec.limit)]);
    params.push(["$offset", String(offset)]);
    const queryUrl = buildQueryUrl(descriptor.endpointUrl, params);

    const retrievedAt = now().toISOString();

    let body: unknown;
    try {
      body = await transport(queryUrl);
    } catch (error) {
      return {
        ok: false,
        failure: fail(
          "transport_rejected",
          redactCredentials(`The source transport rejected the request: ${describeError(error)}`),
          queryUrl,
        ),
      };
    }

    if (!Array.isArray(body)) {
      return {
        ok: false,
        failure: fail(
          "non_array_response",
          "The endpoint returned a body that is not a JSON array; this is a retrieval failure, not an empty page.",
          queryUrl,
        ),
      };
    }

    const records: SourceRecord<SocrataRow>[] = [];
    body.forEach((row: unknown, rowIndex: number) => {
      if (spec.keyField !== undefined && row !== null && typeof row === "object" && !Array.isArray(row)) {
        // Observed before enveloping: a row the envelope declines was still returned by
        // the endpoint, so its key must not silently become a not-returned key (R10, R11).
        const form = stringForm((row as SocrataRow)[spec.keyField]);
        if (form !== null) retrievedKeyForms.push(form);
      }
      const enveloped = toSourceRecord<SocrataRow>({
        descriptor,
        queryUrl,
        retrievedAt,
        identifierFields: spec.identifierFields,
        raw: row as SocrataRow,
      });
      if (enveloped.status === "enveloped") {
        records.push(enveloped.record);
      } else {
        rowRefusals.push({
          queryUrl,
          batchNumber: spec.batchNumber,
          pageNumber,
          rowIndex,
          refusals: enveloped.refusals,
        });
      }
    });

    // Socrata declares exhaustion by returning fewer rows than the requested $limit.
    const hasMore = body.length >= spec.limit;
    pages.push(
      toSourcePage<SocrataRow>({ descriptor, queryUrl, retrievedAt, pageNumber, records, hasMore }),
    );

    if (!hasMore) {
      return { ok: true, value: { pages, rowRefusals, retrievedKeyForms, stoppedAtPageLimit: false } };
    }
    offset += spec.limit;
    // R21: the cap ended retrieval, which the caller must be able to tell apart from
    // a retrieval that ended at a short page.
    if (pageNumber === spec.maxPages) stoppedAtPageLimit = true;
  }

  return { ok: true, value: { pages, rowRefusals, retrievedKeyForms, stoppedAtPageLimit } };
}

/** List rows from one Socrata resource endpoint as provenance-stamped source pages. */
export async function listSocrataRows(
  descriptor: SourceDescriptor,
  query: SocrataListQuery,
  options: SocrataAdapterOptions,
): Promise<SocrataListResult> {
  const now = options.now ?? (() => new Date());

  const descriptorFailure = checkDescriptor(descriptor);
  if (descriptorFailure) return { status: "failed", failure: descriptorFailure };

  const identifierFailure = checkIdentifierFields(query.identifierFields);
  if (identifierFailure) return { status: "failed", failure: identifierFailure };

  const limitFailure = checkPositiveInteger(query.limit, "$limit");
  if (limitFailure) return { status: "failed", failure: limitFailure };

  const offset = query.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    return { status: "failed", failure: fail("malformed_query", "$offset must be an integer of at least 0.") };
  }

  const maxPages = query.maxPages ?? DEFAULT_MAX_PAGES;
  const maxPagesFailure = checkPositiveInteger(maxPages, "maxPages");
  if (maxPagesFailure) return { status: "failed", failure: maxPagesFailure };

  const projectionFailure = checkProjection(query.select, query.order);
  if (projectionFailure) return { status: "failed", failure: projectionFailure };

  const where = compileWhere(query.where ?? []);
  if (!where.ok) return { status: "failed", failure: where.failure };

  const outcome = await pageThrough(
    descriptor,
    {
      identifierFields: query.identifierFields,
      select: query.select,
      order: query.order,
      where: where.value,
      limit: query.limit,
      offset,
      maxPages,
      batchNumber: null,
    },
    options.transport,
    now,
  );
  if (!outcome.ok) return { status: "failed", failure: outcome.failure };

  return {
    status: "listed",
    pages: outcome.value.pages,
    rowRefusals: outcome.value.rowRefusals,
    stoppedAtPageLimit: outcome.value.stoppedAtPageLimit,
  };
}

/** The exact string form of a raw cell, or null when the cell carries no scalar. */
function stringForm(value: JsonValue | undefined): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** What one batch's retrieval observed at the declared key field, in retrieval order. */
interface KeyObservation {
  batchNumber: number;
  forms: string[];
}

/**
 * Account for every requested key exactly once — one entry per occurrence in the
 * declared key set, in declared order (R10, R11).
 *
 * This counts what the endpoint RETRIEVED, including rows the shared envelope
 * declined; a refusal is recorded separately and must never turn a key the endpoint
 * did return into a not-returned key. It counts and locates only — it never merges,
 * joins, or rewrites rows (R20).
 */
function accountForKeys(keys: string[], observations: KeyObservation[]): SocrataKeyAccount[] {
  const observed = new Map<string, { rowCount: number; batchNumbers: number[] }>();
  for (const observation of observations) {
    for (const form of observation.forms) {
      const entry = observed.get(form) ?? { rowCount: 0, batchNumbers: [] };
      entry.rowCount += 1;
      if (!entry.batchNumbers.includes(observation.batchNumber)) {
        entry.batchNumbers.push(observation.batchNumber);
      }
      observed.set(form, entry);
    }
  }

  return keys.map((key): SocrataKeyAccount => {
    const entry = observed.get(key);
    if (entry === undefined) {
      return { key, status: "not_returned", existence: "unknown", explanation: NOT_RETURNED_EXPLANATION };
    }
    return { key, status: "returned", rowCount: entry.rowCount, batchNumbers: [...entry.batchNumbers] };
  });
}

/** Look up a declared key set in batches, accounting for every requested key. */
export async function lookupSocrataRowsByKey(
  descriptor: SourceDescriptor,
  query: SocrataKeySetQuery,
  options: SocrataAdapterOptions,
): Promise<SocrataKeyLookupResult> {
  const now = options.now ?? (() => new Date());

  const descriptorFailure = checkDescriptor(descriptor);
  if (descriptorFailure) return { status: "failed", failure: descriptorFailure };

  const identifierFailure = checkIdentifierFields(query.identifierFields);
  if (identifierFailure) return { status: "failed", failure: identifierFailure };

  if (typeof query.keyField !== "string" || !BARE_FIELD_NAME.test(query.keyField)) {
    return {
      status: "failed",
      failure: fail("malformed_field_name", "The declared key field is not a bare field name."),
    };
  }
  if (!Array.isArray(query.keys) || !query.keys.every((key) => typeof key === "string")) {
    return { status: "failed", failure: fail("malformed_query", "Every declared key must be a string.") };
  }

  const batchSizeFailure = checkPositiveInteger(query.batchSize, "batchSize");
  if (batchSizeFailure) return { status: "failed", failure: batchSizeFailure };

  const limitFailure = checkPositiveInteger(query.limit, "$limit");
  if (limitFailure) return { status: "failed", failure: limitFailure };

  const maxPagesPerBatch = query.maxPagesPerBatch ?? DEFAULT_MAX_PAGES;
  const maxPagesFailure = checkPositiveInteger(maxPagesPerBatch, "maxPagesPerBatch");
  if (maxPagesFailure) return { status: "failed", failure: maxPagesFailure };

  const projectionFailure = checkProjection(query.select, query.order);
  if (projectionFailure) return { status: "failed", failure: projectionFailure };

  if (query.additionalPredicates !== undefined && !Array.isArray(query.additionalPredicates)) {
    return {
      status: "failed",
      failure: fail("malformed_query", "Declared predicates must be supplied as an array."),
    };
  }

  // The requested key set is preserved verbatim: order and repeats intact (R9, R20).
  const keys = [...query.keys];
  const batches: SocrataBatchResult[] = [];
  const rowRefusals: SocrataRowRefusal[] = [];
  const keyObservations: KeyObservation[] = [];
  let stoppedAtPageLimit = false;

  for (let start = 0, batchNumber = 1; start < keys.length; start += query.batchSize, batchNumber += 1) {
    const batchKeys = keys.slice(start, start + query.batchSize);
    const where = compileWhere([
      { kind: "keyIn", field: query.keyField, values: batchKeys },
      ...(query.additionalPredicates ?? []),
    ]);
    if (!where.ok) return { status: "failed", failure: where.failure };

    const outcome = await pageThrough(
      descriptor,
      {
        identifierFields: query.identifierFields,
        select: query.select,
        order: query.order,
        where: where.value,
        limit: query.limit,
        offset: 0,
        maxPages: maxPagesPerBatch,
        batchNumber,
        keyField: query.keyField,
      },
      options.transport,
      now,
    );
    if (!outcome.ok) return { status: "failed", failure: outcome.failure };

    batches.push({ batchNumber, keys: batchKeys, pages: outcome.value.pages });
    rowRefusals.push(...outcome.value.rowRefusals);
    keyObservations.push({ batchNumber, forms: outcome.value.retrievedKeyForms });
    stoppedAtPageLimit = stoppedAtPageLimit || outcome.value.stoppedAtPageLimit;
  }

  return {
    status: "looked_up",
    batches,
    accounting: accountForKeys(keys, keyObservations),
    rowRefusals,
    stoppedAtPageLimit,
  };
}
