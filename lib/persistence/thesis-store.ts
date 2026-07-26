import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationConfig } from "@/lib/config/env";
import {
  ALPHA_THESIS,
  DevelopmentThesisSchema,
  type DevelopmentThesis,
  type UpdateDevelopmentThesis,
} from "@/lib/domain/buy-box";
import type { Database, Json } from "./database.types";
import { deterministicUuid } from "./identity";
import { createSupabaseAdminClient } from "./supabase/admin";

export interface ThesisRepository {
  getActive(): Promise<DevelopmentThesis>;
  update(input: UpdateDevelopmentThesis, userId: string | null): Promise<DevelopmentThesis>;
}

function safeError(stage: string): Error {
  return new Error(`Development thesis persistence failed at ${stage}.`);
}

function createFileRepository(path = join(process.cwd(), "data", "runtime", "development-thesis.json")): ThesisRepository {
  async function getActive() {
    try {
      return DevelopmentThesisSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(ALPHA_THESIS);
      throw safeError("file read");
    }
  }
  return {
    getActive,
    async update(input) {
      const thesis = DevelopmentThesisSchema.parse({ id: ALPHA_THESIS.id, ...input });
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(thesis, null, 2)}\n`, "utf8");
      await rename(temporary, path);
      return thesis;
    },
  };
}

function criteriaFor(thesis: DevelopmentThesis): Json {
  return {
    externalThesisId: thesis.id,
    county: thesis.county,
    minAcres: thesis.minAcres,
    maxAcres: thesis.maxAcres,
    preferredMinCapacity: thesis.preferredMinCapacity,
  };
}

function rowToThesis(row: { name: string; market: string; strategy: string; criteria: Json }): DevelopmentThesis {
  const criteria = typeof row.criteria === "object" && row.criteria !== null && !Array.isArray(row.criteria)
    ? row.criteria
    : {};
  return DevelopmentThesisSchema.parse({
    id: typeof criteria.externalThesisId === "string" ? criteria.externalThesisId : ALPHA_THESIS.id,
    name: row.name,
    market: row.market,
    county: typeof criteria.county === "string" ? criteria.county : ALPHA_THESIS.county,
    strategy: row.strategy,
    minAcres: typeof criteria.minAcres === "number" ? criteria.minAcres : ALPHA_THESIS.minAcres,
    maxAcres: typeof criteria.maxAcres === "number" ? criteria.maxAcres : ALPHA_THESIS.maxAcres,
    preferredMinCapacity: typeof criteria.preferredMinCapacity === "number" ? criteria.preferredMinCapacity : ALPHA_THESIS.preferredMinCapacity,
  });
}

function createSupabaseRepository(client: SupabaseClient<Database>, organizationId: string): ThesisRepository {
  const id = deterministicUuid(organizationId, `thesis:${ALPHA_THESIS.id}`);
  const columns = "name,market,strategy,criteria,version" as const;
  return {
    async getActive() {
      const { data, error } = await client.from("development_theses").select(columns)
        .eq("organization_id", organizationId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw safeError("Supabase get");
      return data ? rowToThesis(data) : structuredClone(ALPHA_THESIS);
    },
    async update(input, userId) {
      const thesis = DevelopmentThesisSchema.parse({ id: ALPHA_THESIS.id, ...input });
      const existing = await client.from("development_theses").select("version").eq("organization_id", organizationId).eq("id", id).maybeSingle();
      if (existing.error) throw safeError("Supabase version read");
      const { data, error } = await client.from("development_theses").upsert({
        id,
        organization_id: organizationId,
        name: thesis.name,
        status: "active",
        market: thesis.market,
        strategy: thesis.strategy,
        criteria: criteriaFor(thesis),
        version: (existing.data?.version ?? 0) + 1,
        created_by: userId,
      }, { onConflict: "id" }).select(columns).single();
      if (error || !data) throw safeError("Supabase update");
      return rowToThesis(data);
    },
  };
}

const repositories = new Map<string, ThesisRepository>();

export function thesisRepositoryForOrganization(organizationId?: string): ThesisRepository {
  const config = getIntegrationConfig();
  const resolvedOrganizationId = organizationId ?? config.SITEVELOCITY_ORGANIZATION_ID;
  const hasSupabase = Boolean(resolvedOrganizationId && config.SUPABASE_URL && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY));
  const useSupabase = config.PERSISTENCE_BACKEND === "supabase" || (config.PERSISTENCE_BACKEND === "auto" && !config.DEMO_MODE && hasSupabase);
  if (useSupabase) {
    if (!resolvedOrganizationId || !hasSupabase) throw new Error("Supabase thesis persistence requires an organization ID, URL, and server key.");
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

export const thesisTesting = { createFileRepository };
