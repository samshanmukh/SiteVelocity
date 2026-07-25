import { NextResponse } from "next/server";
import { loadCandidateSet } from "@/lib/persistence/file-store";
import { researchSite } from "@/lib/research/pipeline";

export const dynamic = "force-dynamic";

/**
 * Start (or refresh) research for one site. Alpha runs the pipeline in-process;
 * the same pipeline is exposed to Render Workflows via workflows/research-site.
 * A failed run records diagnostics and never replaces the active snapshot
 * (the file store only surfaces valid snapshots).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const set = await loadCandidateSet();
  const site = set?.sites.find((s) => s.id === siteId);
  if (!site) {
    return NextResponse.json({ error: `Unknown site ${siteId}` }, { status: 404 });
  }
  try {
    const bundle = await researchSite(site);
    return NextResponse.json({
      snapshotId: bundle.snapshot.id,
      status: bundle.snapshot.status,
      evidence: bundle.evidence.length,
      findings: bundle.findings.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Research run failed; the previous valid snapshot remains active.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
