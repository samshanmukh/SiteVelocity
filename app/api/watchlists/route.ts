import { NextResponse } from "next/server";
import { CreateWatchlistSchema } from "@/lib/domain/watchlist";
import { watchlistRepositoryForOrganization } from "@/lib/persistence/watchlist-store";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let organizationId: string;
  try {
    organizationId = (await resolveRequestContext(request, "read")).organizationId;
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  return NextResponse.json(await watchlistRepositoryForOrganization(organizationId).list(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let organizationId: string;
  try {
    organizationId = (await resolveRequestContext(request, "write")).organizationId;
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const payload = CreateWatchlistSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: "A valid watchlist name is required." }, { status: 400 });
  try {
    const watchlist = await watchlistRepositoryForOrganization(organizationId).create(payload.data);
    return NextResponse.json(watchlist, { status: 201 });
  } catch (error) {
    console.error("Watchlist creation failed", error);
    return NextResponse.json({ error: "The watchlist could not be created." }, { status: 409 });
  }
}
