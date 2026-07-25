import { z } from "zod";
import type { ModelGateway, ModelMessage, ProviderDiagnostic } from "./types";
import { fetchWithTimeout, safeHttpMessage } from "./http";

const ModelsSchema = z.object({
  data: z.array(z.object({ id: z.string() }).passthrough()),
}).passthrough();

const ChatCompletionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }).passthrough(),
  }).passthrough()).min(1),
}).passthrough();

export class MiniMaxModelGateway implements ModelGateway {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(messages: ModelMessage[], signal?: AbortSignal): Promise<string> {
    const response = await fetchWithTimeout("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, messages }),
      signal,
    }, 120_000);

    if (!response.ok) {
      throw new Error(safeHttpMessage("MiniMax", response.status));
    }

    const parsed = ChatCompletionSchema.parse(await response.json());
    const content = parsed.choices[0]?.message.content;
    if (!content) throw new Error("MiniMax returned no message content.");
    return content;
  }
}

export async function checkMiniMaxConnection(apiKey?: string): Promise<ProviderDiagnostic> {
  if (!apiKey) {
    return {
      id: "minimax",
      name: "MiniMax",
      status: "unconfigured",
      message: "Set MINIMAX_API_KEY to enable structured extraction and synthesis.",
    };
  }

  const startedAt = performance.now();
  try {
    const response = await fetchWithTimeout("https://api.minimax.io/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return { id: "minimax", name: "MiniMax", status: "error", message: safeHttpMessage("MiniMax", response.status), latencyMs };
    }

    const models = ModelsSchema.parse(await response.json()).data.length;
    return {
      id: "minimax",
      name: "MiniMax",
      status: "connected",
      message: `MiniMax credential verified; ${models} model${models === 1 ? "" : "s"} available.`,
      latencyMs,
    };
  } catch {
    return {
      id: "minimax",
      name: "MiniMax",
      status: "error",
      message: "MiniMax could not be reached or returned an invalid model list.",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
