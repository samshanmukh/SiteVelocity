import "server-only";
import type { AgentRun, Evidence, Finding, NextAction, ResearchSnapshot } from "../domain/schemas/core";
import type { CandidateSet } from "../domain/site";
import type { CalculationRun } from "../calculations/registry";
import type { ScoreOutput } from "../calculations/scoring/alpha-scores";
import type { TimelineEvent } from "../research/pipeline";
import type { ProviderDiagnostic } from "../providers/types";
import { loadActiveSnapshot, loadCandidateSet, listResearchedSiteIds } from "../persistence/file-store";
import { checkProviderConnections } from "../providers/registry";

/** Typed view of a persisted snapshot bundle for UI consumption. */
export interface SnapshotView {
  snapshot: ResearchSnapshot;
  evidence: Evidence[];
  findings: Finding[];
  agentRuns: AgentRun[];
  scores: {
    strategyFit?: CalculationRun<ScoreOutput>;
    developmentReadiness?: CalculationRun<ScoreOutput>;
    evidenceConfidence?: CalculationRun<ScoreOutput>;
  };
  nextAction: NextAction | null;
  timeline: TimelineEvent[];
}

export interface AppData {
  candidates: CandidateSet | null;
  snapshots: Record<string, SnapshotView>;
  providers: ProviderDiagnostic[];
}

export async function loadAppData(): Promise<AppData> {
  const [candidates, researchedIds, providers] = await Promise.all([
    loadCandidateSet(),
    listResearchedSiteIds(),
    checkProviderConnections(),
  ]);
  const snapshots: Record<string, SnapshotView> = {};
  await Promise.all(
    researchedIds.map(async (siteId) => {
      const bundle = await loadActiveSnapshot(siteId);
      if (bundle) snapshots[siteId] = bundle as unknown as SnapshotView;
    }),
  );
  return { candidates, snapshots, providers };
}
