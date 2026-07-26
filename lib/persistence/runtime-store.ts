import "server-only";

import { getIntegrationConfig } from "@/lib/config/env";
import {
  loadActiveSnapshot as loadActiveSnapshotFromFile,
  loadCandidateSet as loadCandidateSetFromFile,
  listResearchedSiteIds as listResearchedSiteIdsFromFile,
  saveCandidateSet as saveCandidateSetToFile,
  saveRawSourcePage as saveRawSourcePageToFile,
  saveSnapshotBundle as saveSnapshotBundleToFile,
  type SnapshotBundle,
  type SnapshotWriteContext,
} from "./file-store";
import { createSupabaseProjectionStore } from "./supabase/projection-store";

export type { SnapshotBundle, SnapshotWriteContext } from "./file-store";

export interface RuntimeStore {
  saveCandidateSet: typeof saveCandidateSetToFile;
  loadCandidateSet: typeof loadCandidateSetFromFile;
  saveRawSourcePage: typeof saveRawSourcePageToFile;
  saveSnapshotBundle: (bundle: SnapshotBundle, context?: SnapshotWriteContext) => Promise<void>;
  loadActiveSnapshot: typeof loadActiveSnapshotFromFile;
  listResearchedSiteIds: typeof listResearchedSiteIdsFromFile;
}

const cachedStores = new Map<string, RuntimeStore>();

export function runtimeStoreForOrganization(organizationId?: string): RuntimeStore {
  const config = getIntegrationConfig();
  const resolvedOrganizationId = organizationId ?? config.SITEVELOCITY_ORGANIZATION_ID;
  const canUseSupabase = Boolean(
    resolvedOrganizationId
    && config.SUPABASE_URL
    && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY),
  );
  const useSupabase = config.PERSISTENCE_BACKEND === "supabase"
    || (config.PERSISTENCE_BACKEND === "auto" && !config.DEMO_MODE && canUseSupabase);

  if (useSupabase) {
    if (!resolvedOrganizationId || !canUseSupabase) {
      throw new Error("Supabase persistence requires an organization ID, URL, and server-side key.");
    }
    const key = `supabase:${resolvedOrganizationId}`;
    const existing = cachedStores.get(key);
    if (existing) return existing;
    const store = createSupabaseProjectionStore({ organizationId: resolvedOrganizationId });
    cachedStores.set(key, store);
    return store;
  }

  const existing = cachedStores.get("file");
  if (existing) return existing;
  const store = {
    saveCandidateSet: saveCandidateSetToFile,
    loadCandidateSet: loadCandidateSetFromFile,
    saveRawSourcePage: saveRawSourcePageToFile,
    saveSnapshotBundle: saveSnapshotBundleToFile,
    loadActiveSnapshot: loadActiveSnapshotFromFile,
    listResearchedSiteIds: listResearchedSiteIdsFromFile,
  };
  cachedStores.set("file", store);
  return store;
}

export async function saveCandidateSet(...args: Parameters<RuntimeStore["saveCandidateSet"]>) {
  return runtimeStoreForOrganization().saveCandidateSet(...args);
}

export async function loadCandidateSet(...args: Parameters<RuntimeStore["loadCandidateSet"]>) {
  return runtimeStoreForOrganization().loadCandidateSet(...args);
}

export async function saveRawSourcePage(...args: Parameters<RuntimeStore["saveRawSourcePage"]>) {
  return runtimeStoreForOrganization().saveRawSourcePage(...args);
}

export async function saveSnapshotBundle(...args: Parameters<RuntimeStore["saveSnapshotBundle"]>) {
  return runtimeStoreForOrganization().saveSnapshotBundle(...args);
}

export async function loadActiveSnapshot(...args: Parameters<RuntimeStore["loadActiveSnapshot"]>) {
  return runtimeStoreForOrganization().loadActiveSnapshot(...args);
}

export async function listResearchedSiteIds(...args: Parameters<RuntimeStore["listResearchedSiteIds"]>) {
  return runtimeStoreForOrganization().listResearchedSiteIds(...args);
}
