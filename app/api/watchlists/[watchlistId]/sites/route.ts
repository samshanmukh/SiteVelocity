import { NextResponse } from "next/server";
import { z } from "zod";
import { AddWatchlistSiteSchema } from "@/lib/domain/watchlist";
import { runtimeStoreForOrganization } from "@/lib/persistence/runtime-store";
import { watchlistRepositoryForOrganization } from "@/lib/persistence/watchlist-store";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

const ParamsSchema = z.object({ watchlistId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ watchlistId: string }> }) {
  let organizationId: string;
  try {
    organizationId = (await resolveRequestContext(request, "write")).organizationId;
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const parsedParams = ParamsSchema.safeParse(await params);
  const payload = AddWatchlistSiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !payload.success) return NextResponse.json({ error: "A valid watchlist and site are required." }, { status: 400 });

  const candidates = await runtimeStoreForOrganization(organizationId).loadCandidateSet();
  if (!candidates?.sites.some((site) => site.id === payload.data.siteId)) {
    return NextResponse.json({ error: "Site not found." }, { status: 404 });
  }
  try {
    await watchlistRepositoryForOrganization(organizationId).addSite(parsedParams.data.watchlistId, payload.data.siteId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Adding a site to a watchlist failed", error);
    return NextResponse.json({ error: "The site could not be added to the watchlist." }, { status: 409 });
  }
}
