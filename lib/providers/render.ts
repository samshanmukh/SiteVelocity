import { Render } from "@renderinc/sdk";
import type { ProviderDiagnostic, WorkflowEngine } from "./types";
import { fetchWithTimeout, safeHttpMessage } from "./http";

const TASK_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\/[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function siblingRenderTaskSlug(configuredTaskSlug: string, taskName: string): string {
  if (!TASK_SLUG_PATTERN.test(configuredTaskSlug) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(taskName)) {
    throw new Error("Render workflow task slug must use workflow-name/task-name format.");
  }
  return `${configuredTaskSlug.slice(0, configuredTaskSlug.indexOf("/"))}/${taskName}`;
}

export class RenderWorkflowEngine implements WorkflowEngine {
  private readonly client: Render;

  constructor(
    token: string,
    private readonly taskSlug: string,
  ) {
    if (!TASK_SLUG_PATTERN.test(taskSlug)) {
      throw new Error("Render workflow task slug must use workflow-name/task-name format.");
    }
    this.client = new Render({ token });
  }

  async start(input: unknown, signal?: AbortSignal): Promise<{ runId: string }> {
    const run = await this.client.workflows.startTask(this.taskSlug, [input], signal);
    return { runId: run.taskRunId };
  }
}

export async function checkRenderConnection(apiKey?: string, taskSlug?: string): Promise<ProviderDiagnostic> {
  if (!apiKey) {
    return {
      id: "render",
      name: "Render Workflows",
      status: "unconfigured",
      message: "Set RENDER_API_KEY and RENDER_WORKFLOW_TASK_SLUG to enable orchestration.",
    };
  }

  const startedAt = performance.now();
  try {
    const response = await fetchWithTimeout("https://api.render.com/v1/users", {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return { id: "render", name: "Render Workflows", status: "error", message: safeHttpMessage("Render", response.status), latencyMs };
    }

    return {
      id: "render",
      name: "Render Workflows",
      status: taskSlug ? "connected" : "configured",
      message: taskSlug
        ? "Render credential verified and a workflow task slug is configured."
        : "Render credential verified; add RENDER_WORKFLOW_TASK_SLUG before dispatching work.",
      latencyMs,
    };
  } catch {
    return {
      id: "render",
      name: "Render Workflows",
      status: "error",
      message: "Render could not be reached within the diagnostic timeout.",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
