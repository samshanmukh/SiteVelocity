import { existsSync } from "node:fs";
import path from "node:path";
import {
  RocketRideClient,
  type RocketRideClientConfig,
} from "rocketride";
import type { ProviderDiagnostic, WorkflowEngine } from "./types";

export const DEFAULT_ROCKETRIDE_URI = "https://api.rocketride.ai";
const PIPELINE_ROOT = path.join("pipelines", "rocketride");

interface RocketRideClientLike {
  connect(
    credential?: string | { code: string; verifier: string; redirectUri: string },
    options?: { uri?: string; timeout?: number },
  ): Promise<unknown>;
  disconnect(): Promise<void>;
  ping(token?: string): Promise<void>;
  use(options: {
    filepath: string;
    ttl?: number;
    name?: string;
    pipelineTraceLevel?: "none" | "metadata" | "summary" | "full";
  }): Promise<Record<string, unknown> & { token: string }>;
  send(
    token: string,
    data: string | Uint8Array,
    objinfo?: Record<string, unknown>,
    mimetype?: string,
  ): Promise<unknown>;
  terminate(token: string): Promise<void>;
}

type RocketRideClientFactory = (config: RocketRideClientConfig) => RocketRideClientLike;

const defaultClientFactory: RocketRideClientFactory = (config) => new RocketRideClient(config);

function validateUri(uri: string): string {
  const parsed = new URL(uri);
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
    throw new Error("RocketRide URI must use HTTP(S) or WS(S).");
  }
  if (parsed.username || parsed.password) {
    throw new Error("RocketRide URI must not contain credentials.");
  }
  return parsed.toString();
}

export function resolveRocketRidePipelinePath(configuredPath: string): string {
  if (path.isAbsolute(configuredPath)) {
    throw new Error("RocketRide pipeline paths must be repository-relative.");
  }
  const root = path.resolve(process.cwd(), PIPELINE_ROOT);
  const resolved = path.resolve(process.cwd(), configuredPath);
  if (!resolved.startsWith(`${root}${path.sep}`) || path.extname(resolved) !== ".pipe") {
    throw new Error("RocketRide pipelines must be .pipe files under pipelines/rocketride.");
  }
  return resolved;
}

export class RocketRideWorkflowEngine implements WorkflowEngine {
  private readonly uri: string;
  private readonly pipelinePath: string;

  constructor(
    private readonly apiKey: string,
    uri: string,
    configuredPipelinePath: string,
    private readonly taskName: string,
    private readonly clientFactory: RocketRideClientFactory = defaultClientFactory,
  ) {
    this.uri = validateUri(uri);
    this.pipelinePath = resolveRocketRidePipelinePath(configuredPipelinePath);
  }

  async start(input: unknown, signal?: AbortSignal): Promise<{ runId: string }> {
    if (!existsSync(this.pipelinePath)) {
      throw new Error("The configured RocketRide pipeline file does not exist.");
    }
    if (signal?.aborted) throw new DOMException("Workflow dispatch aborted.", "AbortError");

    const client = this.clientFactory({
      auth: this.apiKey,
      uri: this.uri,
      requestTimeout: 30_000,
      module: "sitevelocity",
      clientName: "SiteVelocity",
    });
    let token: string | null = null;
    const abort = () => { void client.disconnect(); };
    signal?.addEventListener("abort", abort, { once: true });

    try {
      await client.connect(undefined, { timeout: 10_000 });
      const run = await client.use({
        filepath: this.pipelinePath,
        ttl: 900,
        name: this.taskName,
        pipelineTraceLevel: "metadata",
      });
      token = run.token;
      await client.send(
        token,
        JSON.stringify(input),
        { name: `${this.taskName}.json` },
        "application/json",
      );
      return { runId: token };
    } catch (error) {
      if (token) {
        try { await client.terminate(token); } catch { /* Preserve the dispatch error. */ }
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      await client.disconnect().catch(() => undefined);
    }
  }
}

export async function checkRocketRideConnection(
  apiKey?: string,
  uri = DEFAULT_ROCKETRIDE_URI,
  researchPipeline?: string,
  ingestPipeline?: string,
  clientFactory: RocketRideClientFactory = defaultClientFactory,
): Promise<ProviderDiagnostic> {
  if (!apiKey) {
    return {
      id: "rocketride",
      name: "RocketRide Pipelines",
      status: "unconfigured",
      message: "Add ROCKETRIDE_APIKEY to enable the RocketRide workflow backend.",
    };
  }
  if (!researchPipeline || !ingestPipeline) {
    return {
      id: "rocketride",
      name: "RocketRide Pipelines",
      status: "configured",
      message: "Credential is present; configure both SiteVelocity .pipe paths before selecting RocketRide.",
    };
  }

  try {
    const paths = [researchPipeline, ingestPipeline].map(resolveRocketRidePipelinePath);
    if (paths.some((pipelinePath) => !existsSync(pipelinePath))) {
      return {
        id: "rocketride",
        name: "RocketRide Pipelines",
        status: "error",
        message: "A configured RocketRide pipeline file is missing from the deployment.",
      };
    }
    const startedAt = performance.now();
    const client = clientFactory({
      auth: apiKey,
      uri: validateUri(uri),
      requestTimeout: 5_000,
      module: "sitevelocity-diagnostic",
      clientName: "SiteVelocity",
    });
    try {
      await client.connect(undefined, { timeout: 5_000 });
      await client.ping();
      return {
        id: "rocketride",
        name: "RocketRide Pipelines",
        status: "connected",
        message: "RocketRide authenticated successfully and both workflow pipelines are available.",
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  } catch {
    return {
      id: "rocketride",
      name: "RocketRide Pipelines",
      status: "error",
      message: "RocketRide could not be authenticated within the diagnostic timeout.",
    };
  }
}
