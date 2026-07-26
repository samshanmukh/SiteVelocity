import { NextResponse } from "next/server";
import { CreateFeasibilityScenarioSchema } from "@/lib/domain/feasibility";
import { feasibilityRepositoryForOrganization } from "@/lib/persistence/feasibility-store";
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
  return NextResponse.json(
    await feasibilityRepositoryForOrganization(organizationId).listForSite(siteId),
    { headers: { "Cache-Control": "no-store, private" } },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  let context;
  try {
    context = await resolveRequestContext(request, "write");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const payload = CreateFeasibilityScenarioSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: "A valid, bounded feasibility scenario is required.", issues: payload.error.issues }, { status: 422 });
  }
  const { siteId } = await params;
  const store = runtimeStoreForOrganization(context.organizationId);
  const [candidates, snapshot] = await Promise.all([store.loadCandidateSet(), store.loadActiveSnapshot(siteId)]);
  const site = candidates?.sites.find((candidate) => candidate.id === siteId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  if (!site.acresDerived?.value) {
    return NextResponse.json({ error: "A sourced parcel acreage is required before feasibility can run." }, { status: 409 });
  }
  const findings = snapshot?.findings as Array<{ status?: string; impact?: string }> | undefined;
  const scenario = await feasibilityRepositoryForOrganization(context.organizationId).create({
    ...payload.data,
    externalSiteId: siteId,
    parcelAcres: site.acresDerived.value,
    fatalConstraintCount: findings?.filter((finding) => finding.impact === "fatal_constraint").length ?? 0,
    materialUnknownCount: findings?.filter((finding) => finding.status === "unknown" && finding.impact !== "opportunity").length ?? 0,
    userId: context.userId,
  });
  return NextResponse.json(scenario, { status: 201, headers: { "Cache-Control": "no-store, private" } });
}
