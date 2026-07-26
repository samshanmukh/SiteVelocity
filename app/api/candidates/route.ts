import { NextResponse } from "next/server";
import { runtimeStoreForOrganization } from "@/lib/persistence/runtime-store";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let organizationId: string;
  try {
    organizationId = (await resolveRequestContext(request, "read")).organizationId;
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const set = await runtimeStoreForOrganization(organizationId).loadCandidateSet();
  if (!set) {
    return NextResponse.json(
      { error: "No candidate set ingested yet. Run `npm run ingest`." },
      { status: 404 },
    );
  }
  return NextResponse.json(set, { headers: { "Cache-Control": "no-store" } });
}
