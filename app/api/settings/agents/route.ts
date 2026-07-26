import { NextResponse } from "next/server";
import { UpdateWorkspaceAgentSettingsSchema } from "@/lib/domain/workspace-settings";
import { workspaceSettingsRepositoryForOrganization } from "@/lib/persistence/workspace-settings-store";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await resolveRequestContext(request, "read");
    return NextResponse.json(await workspaceSettingsRepositoryForOrganization(context.organizationId).get(), {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    return requestContextErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  let context;
  try {
    context = await resolveRequestContext(request, "admin");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const payload = UpdateWorkspaceAgentSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: "Invalid agent settings.", issues: payload.error.issues }, { status: 422 });
  try {
    const saved = await workspaceSettingsRepositoryForOrganization(context.organizationId).update(payload.data, context.demoMode ? null : context.userId);
    return NextResponse.json(saved, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Agent settings could not be saved." }, { status: 503 });
  }
}
