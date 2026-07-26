import "server-only";
import type { AgentRun, Evidence, Finding, NextAction, ResearchSnapshot } from "../domain/schemas/core";
import type { CandidateSet } from "../domain/site";
import type { CalculationRun } from "../calculations/registry";
import type { ScoreOutput } from "../calculations/scoring/alpha-scores";
import type { TimelineEvent } from "../research/pipeline";
import type { SnapshotDiff } from "../research/snapshot-diff";
import type { ProviderDiagnostic } from "../providers/types";
import { runtimeStoreForOrganization } from "../persistence/runtime-store";
import { checkProviderConnections } from "../providers/registry";
import { getIntegrationConfig } from "../config/env";
import type { Watchlist } from "../domain/watchlist";
import { watchlistRepositoryForOrganization } from "../persistence/watchlist-store";
import type { FeasibilityScenario } from "../domain/feasibility";
import { feasibilityRepositoryForOrganization } from "../persistence/feasibility-store";
import { workspaceSettingsRepositoryForOrganization } from "../persistence/workspace-settings-store";
import type { WorkspaceAgentSettings } from "../domain/workspace-settings";
import type { OrganizationRole } from "../security/request-context-core";
import { thesisRepositoryForOrganization } from "../persistence/thesis-store";
import type { DevelopmentThesis } from "../domain/buy-box";

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
  changes?: SnapshotDiff;
}

export interface AppData {
  candidates: CandidateSet | null;
  snapshots: Record<string, SnapshotView>;
  providers: ProviderDiagnostic[];
  watchlists: Watchlist[];
  feasibilityScenarios: Record<string, FeasibilityScenario[]>;
  agentSettings: WorkspaceAgentSettings;
  session: { userId: string; role: OrganizationRole } | null;
  thesis: DevelopmentThesis;
  runtime: {
    demoMode: boolean;
    liveResearch: boolean;
    persistence: "file" | "supabase";
  };
}

export async function loadAppData(organizationId?: string, session: AppData["session"] = null): Promise<AppData> {
  const config = getIntegrationConfig();
  const store = runtimeStoreForOrganization(organizationId);
  const watchlistsStore = watchlistRepositoryForOrganization(organizationId);
  const feasibilityStore = feasibilityRepositoryForOrganization(organizationId);
  const settingsStore = workspaceSettingsRepositoryForOrganization(organizationId);
  const thesisStore = thesisRepositoryForOrganization(organizationId);
  const [candidates, researchedIds, providers, watchlists, allScenarios, agentSettings, thesis] = await Promise.all([
    store.loadCandidateSet(),
    store.listResearchedSiteIds(),
    checkProviderConnections(),
    watchlistsStore.list(),
    feasibilityStore.list(),
    settingsStore.get(),
    thesisStore.getActive(),
  ]);
  const snapshots: Record<string, SnapshotView> = {};
  await Promise.all(
    researchedIds.map(async (siteId) => {
      const bundle = await store.loadActiveSnapshot(siteId);
      if (bundle) snapshots[siteId] = bundle as unknown as SnapshotView;
    }),
  );
  const feasibilityScenarios = allScenarios.reduce<Record<string, FeasibilityScenario[]>>((grouped, scenario) => {
    (grouped[scenario.siteId] ??= []).push(scenario);
    return grouped;
  }, {});
  const supabaseReady = Boolean(
    (organizationId ?? config.SITEVELOCITY_ORGANIZATION_ID)
    && config.SUPABASE_URL
    && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY),
  );
  return {
    candidates,
    snapshots,
    providers,
    watchlists,
    feasibilityScenarios,
    agentSettings,
    session,
    thesis,
    runtime: {
      demoMode: config.DEMO_MODE,
      liveResearch: config.LIVE_RESEARCH,
      persistence: config.PERSISTENCE_BACKEND === "supabase"
        || (config.PERSISTENCE_BACKEND === "auto" && !config.DEMO_MODE && supabaseReady)
        ? "supabase"
        : "file",
    },
  };
}
