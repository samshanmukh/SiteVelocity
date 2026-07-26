import { NextResponse } from "next/server";
import { z } from "zod";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";
import { getResearchWorkflowRun } from "@/lib/workflows/workflow-store";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ workflowId: z.string().uuid() });

export async function GET(request: Request, { params }: { params: Promise<{ workflowId: string }> }) {
  let organizationId: string;
  try {
    organizationId = (await resolveRequestContext(request, "read")).organizationId;
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "invalid_workflow" }, { status: 400 });
  const workflow = await getResearchWorkflowRun(organizationId, parsed.data.workflowId);
  if (!workflow) return NextResponse.json({ error: "workflow_not_found" }, { status: 404 });
  return NextResponse.json(workflow, { headers: { "Cache-Control": "no-store, private" } });
}
