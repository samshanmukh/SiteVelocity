import { NextResponse } from "next/server";
import { runtimeStoreForOrganization } from "@/lib/persistence/runtime-store";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  let organizationId: string;
  try {
    organizationId = (await resolveRequestContext(request, "read")).organizationId;
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const { siteId } = await params;
  const store = runtimeStoreForOrganization(organizationId);
  const set = await store.loadCandidateSet();
  const site = set?.sites.find((s) => s.id === siteId);
  if (!site) {
    return NextResponse.json({ error: `Unknown site ${siteId}` }, { status: 404 });
  }
  const snapshot = await store.loadActiveSnapshot(siteId);
  return NextResponse.json({ site, snapshot }, { headers: { "Cache-Control": "no-store" } });
}
