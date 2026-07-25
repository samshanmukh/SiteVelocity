/**
 * Research URL policy (docs/SYSTEM_DESIGN.md §19.2).
 * Server-side fetches to external sources must pass this policy.
 * Known-source adapters use an explicit host allowlist; https only;
 * loopback/private/link-local and credential-bearing URLs are refused.
 */

const KNOWN_SOURCE_HOSTS = new Set([
  "services.arcgis.com",
  "www.arcgis.com",
  "geo.sanjoseca.gov",
  "data.sccgov.org",
  "hazards.fema.gov",
  "geopub.epa.gov",
  "echodata.epa.gov",
]);

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
];

export function assertAllowedSourceUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error(`URL policy: only https is permitted (got ${url.protocol}).`);
  }
  if (url.username || url.password) {
    throw new Error("URL policy: credential-bearing URLs are refused.");
  }
  if (PRIVATE_HOST_PATTERNS.some((p) => p.test(url.hostname))) {
    throw new Error("URL policy: loopback/private/link-local destinations are refused.");
  }
  const allowedFromEnv = (process.env.RESEARCH_URL_ALLOWLIST ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const allowed = KNOWN_SOURCE_HOSTS.has(url.hostname.toLowerCase())
    || allowedFromEnv.includes(url.hostname.toLowerCase());
  if (!allowed) {
    throw new Error(`URL policy: host ${url.hostname} is not on the source allowlist.`);
  }
  return url;
}
