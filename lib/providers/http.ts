const DEFAULT_TIMEOUT_MS = 8_000;

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await fetch(input, { ...init, signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

export function safeHttpMessage(provider: string, status: number): string {
  if (status === 401 || status === 403) {
    return `${provider} rejected the configured credential.`;
  }
  if (status === 429) {
    return `${provider} credential is valid but the diagnostic was rate limited.`;
  }
  return `${provider} returned HTTP ${status}.`;
}
