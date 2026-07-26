import type { IntegrationConfig } from "@/lib/config/env";
import { RenderWorkflowEngine, siblingRenderTaskSlug } from "./render";
import {
  DEFAULT_ROCKETRIDE_URI,
  RocketRideWorkflowEngine,
} from "./rocketride";
import type { WorkflowEngine, WorkflowProviderId } from "./types";

export type WorkflowKind = "research-site" | "ingest-candidates";

export interface ConfiguredWorkflowEngine {
  provider: WorkflowProviderId;
  engine: WorkflowEngine;
}

export function configuredWorkflowEngine(
  config: IntegrationConfig,
  kind: WorkflowKind,
): ConfiguredWorkflowEngine | null {
  if (config.WORKFLOW_PROVIDER === "rocketride") {
    const pipeline = kind === "research-site"
      ? config.ROCKETRIDE_RESEARCH_PIPELINE
      : config.ROCKETRIDE_INGEST_PIPELINE;
    if (!config.ROCKETRIDE_APIKEY || !pipeline) return null;
    return {
      provider: "rocketride",
      engine: new RocketRideWorkflowEngine(
        config.ROCKETRIDE_APIKEY,
        config.ROCKETRIDE_URI ?? DEFAULT_ROCKETRIDE_URI,
        pipeline,
        kind,
      ),
    };
  }

  if (!config.RENDER_API_KEY || !config.RENDER_WORKFLOW_TASK_SLUG) return null;
  const taskSlug = kind === "research-site"
    ? config.RENDER_WORKFLOW_TASK_SLUG
    : siblingRenderTaskSlug(config.RENDER_WORKFLOW_TASK_SLUG, "ingestCandidates");
  return {
    provider: "render",
    engine: new RenderWorkflowEngine(config.RENDER_API_KEY, taskSlug),
  };
}
