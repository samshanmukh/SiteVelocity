import "server-only";

import { z } from "zod";

const MEM0_API = "https://api.mem0.ai/v3";
const Mem0SearchResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    memory: z.string(),
    score: z.number().optional(),
  }).passthrough()).default([]),
}).passthrough();

export interface Mem0Memory {
  id: string;
  memory: string;
  score?: number;
}

async function request(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${MEM0_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Mem0 request failed with status ${response.status}.`);
  return response.json();
}

export async function rememberScoutPreference(input: {
  apiKey: string;
  memoryUserId: string;
  content: string;
  category: string;
}): Promise<void> {
  await request("/memories/add/", input.apiKey, {
    user_id: input.memoryUserId,
    messages: [{ role: "user", content: `SiteVelocity Scout preference (${input.category}): ${input.content}` }],
    metadata: { product: "sitevelocity", kind: "scout_preference", category: input.category },
  });
}

export async function recallScoutPreferences(input: {
  apiKey: string;
  memoryUserId: string;
  query: string;
  topK?: number;
}): Promise<Mem0Memory[]> {
  const payload = await request("/memories/search/", input.apiKey, {
    query: input.query,
    filters: { user_id: input.memoryUserId },
    top_k: Math.min(Math.max(input.topK ?? 5, 1), 10),
    rerank: false,
  });
  return Mem0SearchResponseSchema.parse(payload).results;
}

export function mem0UserId(organizationId: string): string {
  return `sitevelocity:${organizationId}`;
}
