"use client";

interface WorkflowStatusPayload {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "partial";
}

export async function waitForWorkflow(workflowId: string, timeoutMs = 5 * 60 * 1_000): Promise<WorkflowStatusPayload> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("workflow_status_failed");
    const payload = await response.json() as WorkflowStatusPayload;
    if (["succeeded", "partial", "failed", "cancelled"].includes(payload.status)) return payload;
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
  }
  throw new Error("workflow_timeout");
}

export function commandId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `command-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
