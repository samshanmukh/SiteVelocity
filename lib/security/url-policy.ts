/**
 * Source URL policy module (Segment 2 — Government Ingestion), docs/SYSTEM_DESIGN.md §19.2.
 *
 * Behavioral contract: prompts/modules/source-url-policy_typescript.prompt (R1–R16)
 * plus prompts/context/sitevelocity-preamble.prompt (P1–P8).
 * Contract tests: tests/contracts/source-url-policy.contract.test.ts
 *
 * Decides whether ONE outbound URL may be fetched as a public-records source.
 * It admits the parsed URL or refuses it — it never fetches, resolves, redirects,
 * rewrites, caches, or logs. This is the SSRF control for the whole ingestion
 * segment: every server-side fetch of an external source passes through it.
 *
 * The decision is made from the input string and the declared allowlists alone.
 * No DNS lookup and no network call is performed (R13), so a hostname that
 * resolves to a private address is stopped by the allowlist, not by inspection.
 */

/** Hosts admitted by default: the endpoints Alpha's source adapters declare. */
const STATIC_ALLOWLIST: readonly string[] = Object.freeze([
  "services.arcgis.com",
  "www.arcgis.com",
  "geo.sanjoseca.gov",
  "data.sccgov.org",
  "hazards.fema.gov",
  "geopub.epa.gov",
  "echodata.epa.gov",
]);

const STATIC_ALLOWLIST_SET: ReadonlySet<string> = new Set(STATIC_ALLOWLIST);

export type SourceUrlRefusalCode =
  | "malformed_url"
  | "scheme_not_https"
  | "credentials_present"
  | "private_destination"
  | "host_not_allowlisted";

export interface SourceUrlRefusal {
  code: SourceUrlRefusalCode;
  /** The parsed host, lowercased — or null when no host could be parsed (P2: unknown stays unknown). */
  host: string | null;
  /** Names the host and the reason only. Never carries path, query, fragment, or credentials (R11). */
  explanation: string;
}

export type SourceUrlDecision =
  | { status: "admitted"; url: URL }
  | { status: "refused"; refusal: SourceUrlRefusal };

export interface UrlPolicyOptions {
  /**
   * Hosts admitted in addition to the static allowlist, as a comma-separated
   * string or an array. When omitted, RESEARCH_URL_ALLOWLIST supplies it — the
   * module's one declared external dependency (P4).
   */
  environmentAllowlist?: string | readonly string[];
}

/** Thrown by assertAllowedSourceUrl; carries the structured refusal. */
export class SourceUrlPolicyError extends Error {
  readonly refusal: SourceUrlRefusal;

  constructor(refusal: SourceUrlRefusal) {
    super(refusal.explanation);
    this.name = "SourceUrlPolicyError";
    this.refusal = refusal;
  }
}

/** The static allowlist, exposed for diagnostics as a frozen, non-mutable array (R16). */
export function listAllowedSourceHosts(): readonly string[] {
  return STATIC_ALLOWLIST;
}

/**
 * One canonical spelling of a host, used for the private-destination check, the
 * allowlist check, and refusal reporting alike (R7, R10).
 *
 * A trailing dot is the DNS root label: `localhost.` and `localhost` name the
 * same destination, so the rooted form must not slip past the private-destination
 * check (R5/R6). Normalizing once means the deny check and the allow check can
 * never disagree about which host they are judging.
 */
function normalizeHost(value: string): string {
  const lower = value.trim().toLowerCase();
  return lower.length > 1 && lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

const NO_HOSTS: ReadonlySet<string> = Object.freeze(new Set<string>()) as ReadonlySet<string>;

function refuse(
  code: SourceUrlRefusalCode,
  host: string | null,
  explanation: string,
): SourceUrlDecision {
  return Object.freeze({
    status: "refused" as const,
    refusal: Object.freeze({ code, host, explanation }),
  });
}

/** Split a declared allowlist into normalized hosts, dropping blank entries (R8). */
function readAllowlist(supplied: unknown): ReadonlySet<string> {
  const source = supplied ?? process.env.RESEARCH_URL_ALLOWLIST ?? "";

  // Boundary validation (P5): anything that is neither a comma-separated string
  // nor an array contributes no hosts rather than throwing (R17). Failing this
  // way is fail-closed — an unusable allowlist can only refuse, never admit.
  let entries: readonly unknown[];
  if (typeof source === "string") entries = source.split(",");
  else if (Array.isArray(source)) entries = source as readonly unknown[];
  else return NO_HOSTS;

  const hosts = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== "string") continue; // A non-string entry admits nothing (R17).
    const host = normalizeHost(entry);
    if (host === "") continue; // A blank entry admits nothing (R8).
    hosts.add(host);
  }
  return hosts;
}

const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIpv4Octets(octets: readonly number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved
  return false;
}

function isPrivateIpv4(host: string): boolean {
  const match = IPV4_LITERAL.exec(host);
  if (match === null) return false;
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some((octet) => octet > 255)) return false; // Not an IPv4 literal at all.
  return isPrivateIpv4Octets(octets);
}

function parseHextet(text: string): number | null {
  if (!/^[0-9a-f]{1,4}$/.test(text)) return null;
  return Number.parseInt(text, 16);
}

/** Expand an IPv6 literal (brackets already stripped) into its eight 16-bit groups. */
function parseIpv6(literal: string): number[] | null {
  if (!literal.includes(":")) return null;
  let text = literal;

  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);

  // An embedded IPv4 tail (::ffff:127.0.0.1) occupies the final two groups.
  let embedded: [number, number] | null = null;
  const lastColon = text.lastIndexOf(":");
  const lastGroup = text.slice(lastColon + 1);
  if (lastGroup.includes(".")) {
    const parts = lastGroup.split(".");
    if (parts.length !== 4) return null;
    const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
    if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) return null;
    embedded = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const headText = halves[0] === "" ? [] : halves[0].split(":");
  const tailText = halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : [];

  const groups: number[] = [];
  for (const part of headText) {
    const value = parseHextet(part);
    if (value === null) return null;
    groups.push(value);
  }
  if (halves.length === 2) {
    const missing = 8 - headText.length - tailText.length;
    if (missing < 0) return null;
    for (let i = 0; i < missing; i += 1) groups.push(0);
  }
  for (const part of tailText) {
    const value = parseHextet(part);
    if (value === null) return null;
    groups.push(value);
  }
  if (groups.length !== 8) return null;

  if (embedded !== null) {
    groups[6] = embedded[0];
    groups[7] = embedded[1];
  }
  return groups;
}

function isPrivateIpv6(groups: readonly number[]): boolean {
  const leadingZeros = groups.slice(0, 7).every((group) => group === 0);
  if (leadingZeros && (groups[7] === 0 || groups[7] === 1)) return true; // :: and ::1
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)

  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96) forms inherit the
  // embedded address's disposition, so ::ffff:127.0.0.1 is loopback.
  const first5Zero = groups.slice(0, 5).every((group) => group === 0);
  if (first5Zero && (groups[5] === 0xffff || groups[5] === 0)) {
    const octets = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    return isPrivateIpv4Octets(octets);
  }
  return false;
}

/**
 * Loopback / private / link-local / unique-local test over the *literal* host.
 * Decided without DNS (R13): a name that is not an IP literal is judged only by
 * the allowlist, which is why the allowlist is the authoritative control.
 */
function isPrivateDestination(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isPrivateIpv4(host)) return true;
  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIpv6(host.slice(1, -1));
    if (groups !== null && isPrivateIpv6(groups)) return true;
  }
  return false;
}

/**
 * Decide whether one URL may be fetched as a public-records source.
 * Synchronous, side-effect free, and total: it returns a decision and never throws (R1).
 */
export function checkSourceUrl(rawUrl: string, options: UrlPolicyOptions = {}): SourceUrlDecision {
  // The options bag is itself an external boundary (P5): a null or non-object
  // value must not turn a policy decision into a thrown TypeError (R1, R17).
  const suppliedAllowlist: unknown =
    options !== null && typeof options === "object"
      ? (options as UrlPolicyOptions).environmentAllowlist
      : undefined;

  // Boundary validation (P5). Nothing from the input is echoed back (R11).
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return refuse("malformed_url", null, "URL policy: the source URL is absent or is not a string.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return refuse("malformed_url", null, "URL policy: the source URL could not be parsed.");
  }

  const host = url.hostname === "" ? null : normalizeHost(url.hostname);
  const named = host === null ? "" : ` (host ${host})`;

  if (url.protocol !== "https:") {
    return refuse(
      "scheme_not_https",
      host,
      `URL policy: only the https scheme is admitted; got ${url.protocol}${named}.`,
    );
  }

  if (url.username !== "" || url.password !== "") {
    return refuse(
      "credentials_present",
      host,
      `URL policy: credential-bearing URLs are refused${named}.`,
    );
  }

  if (host === null) {
    return refuse("malformed_url", null, "URL policy: the source URL declares no host.");
  }

  // Ordered before the allowlist check so no allowlist entry can re-admit a
  // loopback, private, link-local, or unique-local destination (R6, R9).
  if (isPrivateDestination(host)) {
    return refuse(
      "private_destination",
      host,
      `URL policy: host ${host} is a loopback, private, link-local, or unique-local destination.`,
    );
  }

  const allowed = STATIC_ALLOWLIST_SET.has(host) || readAllowlist(suppliedAllowlist).has(host);
  if (!allowed) {
    return refuse(
      "host_not_allowlisted",
      host,
      `URL policy: host ${host} is not on the declared source allowlist.`,
    );
  }

  // Admitted: the URL is returned intact so the caller fetches exactly what was
  // declared — path, query, and fragment are preserved, never rewritten (R12/P1).
  return Object.freeze({ status: "admitted" as const, url });
}

/**
 * Admit one source URL or throw. Signature preserved for
 * lib/adapters/sources/http-json.ts and any other server-side fetch path.
 */
export function assertAllowedSourceUrl(rawUrl: string, options: UrlPolicyOptions = {}): URL {
  const decision = checkSourceUrl(rawUrl, options);
  if (decision.status === "refused") {
    throw new SourceUrlPolicyError(decision.refusal);
  }
  return decision.url;
}
