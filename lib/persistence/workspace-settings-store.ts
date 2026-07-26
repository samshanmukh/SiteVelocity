import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationConfig } from "@/lib/config/env";
import {
  DEFAULT_WORKSPACE_AGENT_SETTINGS,
  WorkspaceAgentSettingsSchema,
  type UpdateWorkspaceAgentSettings,
  type WorkspaceAgentSettings,
} from "@/lib/domain/workspace-settings";
import type { Database, Json } from "./database.types";
import { createSupabaseAdminClient } from "./supabase/admin";

export interface WorkspaceSettingsRepository {
  get(): Promise<WorkspaceAgentSettings>;
  update(input: UpdateWorkspaceAgentSettings, userId: string | null): Promise<WorkspaceAgentSettings>;
}

function safeError(stage: string): Error {
  return new Error(`Workspace settings persistence failed at ${stage}.`);
}

function createFileRepository(path = join(process.cwd(), "data", "runtime", "workspace-agent-settings.json")): WorkspaceSettingsRepository {
  async function get(): Promise<WorkspaceAgentSettings> {
    try {
      return WorkspaceAgentSettingsSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(DEFAULT_WORKSPACE_AGENT_SETTINGS);
      throw safeError("file read");
    }
  }
  return {
    get,
    async update(input) {
      const settings = WorkspaceAgentSettingsSchema.parse({ ...input, updatedAt: new Date().toISOString() });
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
      await rename(temporary, path);
      return settings;
    },
  };
}

function rowToSettings(row: {
  enabled_agents: Json;
  verification_depth: string;
  max_external_research_tasks_per_site: number;
  updated_at: string;
}): WorkspaceAgentSettings {
  return WorkspaceAgentSettingsSchema.parse({
    enabledAgents: row.enabled_agents,
    verificationDepth: row.verification_depth,
    maxExternalResearchTasksPerSite: row.max_external_research_tasks_per_site,
    updatedAt: row.updated_at,
  });
}

function createSupabaseRepository(client: SupabaseClient<Database>, organizationId: string): WorkspaceSettingsRepository {
  const columns = "enabled_agents,verification_depth,max_external_research_tasks_per_site,updated_at" as const;
  return {
    async get() {
      const { data, error } = await client.from("workspace_agent_settings").select(columns)
        .eq("organization_id", organizationId).maybeSingle();
      if (error) throw safeError("Supabase get");
      return data ? rowToSettings(data) : structuredClone(DEFAULT_WORKSPACE_AGENT_SETTINGS);
    },
    async update(input, userId) {
      const { data, error } = await client.from("workspace_agent_settings").upsert({
        organization_id: organizationId,
        enabled_agents: input.enabledAgents as unknown as Json,
        verification_depth: input.verificationDepth,
        max_external_research_tasks_per_site: input.maxExternalResearchTasksPerSite,
        updated_by: userId,
      }, { onConflict: "organization_id" }).select(columns).single();
      if (error || !data) throw safeError("Supabase update");
      return rowToSettings(data);
    },
  };
}

const repositories = new Map<string, WorkspaceSettingsRepository>();

export function workspaceSettingsRepositoryForOrganization(organizationId?: string): WorkspaceSettingsRepository {
  const config = getIntegrationConfig();
  const resolvedOrganizationId = organizationId ?? config.SITEVELOCITY_ORGANIZATION_ID;
  const hasSupabase = Boolean(resolvedOrganizationId && config.SUPABASE_URL && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY));
  const useSupabase = config.PERSISTENCE_BACKEND === "supabase" || (config.PERSISTENCE_BACKEND === "auto" && !config.DEMO_MODE && hasSupabase);
  if (useSupabase) {
    if (!resolvedOrganizationId || !hasSupabase) throw new Error("Supabase workspace settings require an organization ID, URL, and server key.");
    const key = `supabase:${resolvedOrganizationId}`;
    const existing = repositories.get(key);
    if (existing) return existing;
    const repository = createSupabaseRepository(createSupabaseAdminClient(), resolvedOrganizationId);
    repositories.set(key, repository);
    return repository;
  }
  const existing = repositories.get("file");
  if (existing) return existing;
  const repository = createFileRepository();
  repositories.set("file", repository);
  return repository;
}

export const workspaceSettingsTesting = { createFileRepository };
