import { NextResponse } from "next/server";
import { loadActiveSnapshot, loadCandidateSet } from "@/lib/persistence/file-store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const set = await loadCandidateSet();
  const site = set?.sites.find((s) => s.id === siteId);
  if (!site) {
    return NextResponse.json({ error: `Unknown site ${siteId}` }, { status: 404 });
  }
  const snapshot = await loadActiveSnapshot(siteId);
  return NextResponse.json({ site, snapshot }, { headers: { "Cache-Control": "no-store" } });
}
