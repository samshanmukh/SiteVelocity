import { assertAllowedSourceUrl } from "../../security/url-policy";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 15_000_000;

/**
 * Policy-checked JSON fetch for government/source endpoints.
 * Runs in plain Node (scripts, workflows) and Next server code alike, so it
 * avoids Next-specific RequestInit extensions.
 */
export async function fetchSourceJson(rawUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const url = assertAllowedSourceUrl(rawUrl);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Source ${url.hostname} returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error(`Source ${url.hostname} response exceeds the ${MAX_BODY_BYTES}-byte limit.`);
  }
  return JSON.parse(text) as unknown;
}
