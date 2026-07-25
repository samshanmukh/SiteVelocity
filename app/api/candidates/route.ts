import { NextResponse } from "next/server";
import { loadCandidateSet } from "@/lib/persistence/file-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const set = await loadCandidateSet();
  if (!set) {
    return NextResponse.json(
      { error: "No candidate set ingested yet. Run `npm run ingest`." },
      { status: 404 },
    );
  }
  return NextResponse.json(set, { headers: { "Cache-Control": "no-store" } });
}
