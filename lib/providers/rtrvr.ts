import { z } from "zod";
import type { ProviderDiagnostic, WebResearchProvider, WebResearchRequest } from "./types";
import { fetchWithTimeout, safeHttpMessage } from "./http";

const RtrvrResponseSchema = z.object({
  protocol: z.object({ name: z.string() }).passthrough().optional(),
  run: z.object({ id: z.string().optional() }).passthrough().optional(),
  result: z.unknown().optional(),
  history: z.array(z.unknown()).optional(),
}).passthrough();

export class RtrvrWebResearchProvider implements WebResearchProvider {
  constructor(private readonly apiKey: string) {}

  async research(request: WebResearchRequest, signal?: AbortSignal): Promise<unknown> {
    const response = await fetchWithTimeout("https://api.rtrvr.ai/agent", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: request.task,
        urls: request.urls,
        response: { verbosity: "final" },
      }),
      signal,
    }, 120_000);

    if (!response.ok) {
      throw new Error(safeHttpMessage("Rtrvr", response.status));
    }

    return RtrvrResponseSchema.parse(await response.json());
  }
}

export function checkRtrvrConfiguration(apiKey?: string): ProviderDiagnostic {
  if (!apiKey) {
    return {
      id: "rtrvr",
      name: "Rtrvr.ai",
      status: "unconfigured",
      message: "Set RTRVR_API_KEY to enable targeted public-web research.",
    };
  }

  return {
    id: "rtrvr",
    name: "Rtrvr.ai",
    status: "configured",
    message: "Credential is configured. The diagnostics endpoint does not spend credits on an agent run.",
  };
}
