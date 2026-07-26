import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationConfig } from "@/lib/config/env";
import {
  ScoutPreferenceListSchema,
  ScoutPreferenceSchema,
  type CreateScoutPreference,
  type ScoutPreference,
} from "@/lib/domain/scout-preference";
import type { Database, Json } from "./database.types";
import { createSupabaseAdminClient } from "./supabase/admin";

export interface ScoutPreferenceRepository {
  list(): Promise<ScoutPreference[]>;
  add(input: CreateScoutPreference): Promise<ScoutPreference>;
}

function safeError(stage: string): Error {
  return new Error(`Scout preference persistence failed at ${stage}.`);
}

function createFileRepository(path: string): ScoutPreferenceRepository {
  async function list(): Promise<ScoutPreference[]> {
    try {
      return ScoutPreferenceListSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown).preferences;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw safeError("file read");
    }
  }
  return {
    list,
    async add(input) {
      const preference = ScoutPreferenceSchema.parse({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
      const preferences = [preference, ...(await list())].slice(0, 50);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ preferences }, null, 2)}\n`, "utf8");
      await rename(temporary, path);
      return preference;
    },
  };
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function createSupabaseRepository(client: SupabaseClient<Database>, organizationId: string): ScoutPreferenceRepository {
  async function list(): Promise<ScoutPreference[]> {
    const { data, error } = await client.from("domain_projections")
      .select("payload")
      .eq("organization_id", organizationId)
      .eq("projection_kind", "scout_preferences")
      .eq("scope_key", "tenant")
      .order("source_cutoff_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw safeError("Supabase read");
    if (!data) return [];
    return ScoutPreferenceListSchema.parse(data.payload).preferences;
  }
  return {
    list,
    async add(input) {
      const preference = ScoutPreferenceSchema.parse({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
      const payload = asJson({ preferences: [preference, ...(await list())].slice(0, 50) });
      const versionKey = preference.createdAt;
      const { error } = await client.from("domain_projections").insert({
        organization_id: organizationId,
        projection_kind: "scout_preferences",
        scope_key: "tenant",
        version_key: versionKey,
        status: "complete",
        source_cutoff_at: versionKey,
        payload,
        content_checksum: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      });
      if (error) throw safeError("Supabase write");
      return preference;
    },
  };
}

const repositories = new Map<string, ScoutPreferenceRepository>();

export function scoutPreferenceRepositoryForOrganization(organizationId: string): ScoutPreferenceRepository {
  const config = getIntegrationConfig();
  const hasSupabase = Boolean(config.SUPABASE_URL && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY));
  const useSupabase = config.PERSISTENCE_BACKEND === "supabase" || (config.PERSISTENCE_BACKEND === "auto" && !config.DEMO_MODE && hasSupabase);
  const key = useSupabase ? `supabase:${organizationId}` : `file:${organizationId}`;
  const existing = repositories.get(key);
  if (existing) return existing;
  const repository = useSupabase
    ? createSupabaseRepository(createSupabaseAdminClient(), organizationId)
    : createFileRepository(join(process.cwd(), "data", "runtime", `scout-preferences-${organizationId}.json`));
  repositories.set(key, repository);
  return repository;
}
