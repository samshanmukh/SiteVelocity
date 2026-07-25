export type ProviderStatus = "connected" | "configured" | "unconfigured" | "error";

export interface ProviderDiagnostic {
  id: "supabase" | "render" | "rtrvr" | "minimax";
  name: string;
  status: ProviderStatus;
  message: string;
  latencyMs?: number;
}

export interface WebResearchRequest {
  task: string;
  urls: string[];
}

export interface WebResearchProvider {
  research(request: WebResearchRequest, signal?: AbortSignal): Promise<unknown>;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelGateway {
  complete(messages: ModelMessage[], signal?: AbortSignal): Promise<string>;
}

export interface WorkflowEngine {
  start(input: unknown, signal?: AbortSignal): Promise<{ runId: string }>;
}
