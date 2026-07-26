import { NextResponse } from "next/server";
import { getIntegrationConfig } from "@/lib/config/env";
import { CreateScoutPreferenceSchema } from "@/lib/domain/scout-preference";
import { scoutPreferenceRepositoryForOrganization } from "@/lib/persistence/scout-preference-store";
import { mem0UserId, recallScoutPreferences, rememberScoutPreference } from "@/lib/providers/mem0";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let context;
  try {
    context = await resolveRequestContext(request, "read");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  try {
    const preferences = await scoutPreferenceRepositoryForOrganization(context.organizationId).list();
    const config = getIntegrationConfig();
    const query = new URL(request.url).searchParams.get("q")?.slice(0, 500) || "Scout investment and workflow preferences";
    const memories = config.MEM0_API_KEY
      ? await recallScoutPreferences({ apiKey: config.MEM0_API_KEY, memoryUserId: mem0UserId(context.organizationId), query }).catch(() => [])
      : [];
    return NextResponse.json({ preferences, memories, mem0Enabled: Boolean(config.MEM0_API_KEY) }, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    return NextResponse.json({ error: "Scout preferences could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let context;
  try {
    context = await resolveRequestContext(request, "write");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const payload = CreateScoutPreferenceSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: "Invalid Scout preference.", issues: payload.error.issues }, { status: 422 });
  try {
    const preference = await scoutPreferenceRepositoryForOrganization(context.organizationId).add(payload.data);
    const config = getIntegrationConfig();
    let mem0Synced = false;
    if (config.MEM0_API_KEY) {
      mem0Synced = await rememberScoutPreference({
        apiKey: config.MEM0_API_KEY,
        memoryUserId: mem0UserId(context.organizationId),
        content: preference.content,
        category: preference.category,
      }).then(() => true).catch(() => false);
    }
    return NextResponse.json({ preference, mem0Synced }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Scout preference could not be saved." }, { status: 503 });
  }
}
