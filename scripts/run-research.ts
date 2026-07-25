import { loadCandidateSet } from "../lib/persistence/file-store";
import { researchSite } from "../lib/research/pipeline";

/**
 * Research the top N shortlisted candidates and persist Research Snapshots.
 * Usage: npm run research [-- <count>]   (default 5)
 */

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 5);
  const set = await loadCandidateSet();
  if (!set) {
    console.error("[research] no data/candidates.json — run `npm run ingest` first.");
    process.exitCode = 1;
    return;
  }
  const targets = set.sites.slice(0, count);
  for (const site of targets) {
    console.log(`[research] #${site.rank} ${site.apnFormatted} ${site.address ?? ""}`);
    try {
      const bundle = await researchSite(site);
      console.log(
        `  snapshot ${bundle.snapshot.status}: ${bundle.evidence.length} evidence, ${bundle.findings.length} findings, ${bundle.agentRuns.length} agent runs`,
      );
    } catch (error) {
      console.error(`  failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

main().catch((error) => {
  console.error("[research] failed:", error);
  process.exitCode = 1;
});
