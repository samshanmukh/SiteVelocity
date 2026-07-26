import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationConfig } from "@/lib/config/env";
import {
  FeasibilityScenarioSchema,
  calculateFeasibility,
  type CreateFeasibilityScenario,
  type FeasibilityScenario,
} from "@/lib/domain/feasibility";
import type { Database, Json } from "@/lib/persistence/database.types";
import { deterministicUuid } from "@/lib/persistence/identity";
import { createSupabaseAdminClient } from "@/lib/persistence/supabase/admin";

export interface CreateScenarioInput extends CreateFeasibilityScenario {
  externalSiteId: string;
  parcelAcres: number;
  fatalConstraintCount: number;
  materialUnknownCount: number;
  userId: string | null;
}

export interface FeasibilityRepository {
  list(): Promise<FeasibilityScenario[]>;
  listForSite(externalSiteId: string): Promise<FeasibilityScenario[]>;
  create(input: CreateScenarioInput): Promise<FeasibilityScenario>;
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeError(stage: string): Error {
  return new Error(`Feasibility persistence failed at ${stage}.`);
}

function calculate(input: CreateScenarioInput, id: string, createdAt: string): FeasibilityScenario {
  return FeasibilityScenarioSchema.parse({
    id,
    siteId: input.externalSiteId,
    name: input.name,
    assumptions: input.assumptions,
    outputs: calculateFeasibility({
      parcelAcres: input.parcelAcres,
      fatalConstraintCount: input.fatalConstraintCount,
      materialUnknownCount: input.materialUnknownCount,
    }, input.assumptions),
    calculationVersion: "1.0.0",
    createdAt,
  });
}

function createFileRepository(path = join(process.cwd(), "data", "runtime", "feasibility-scenarios.json")): FeasibilityRepository {
  async function list(): Promise<FeasibilityScenario[]> {
    try {
      return FeasibilityScenarioSchema.array().parse(JSON.parse(await readFile(path, "utf8")) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw safeError("file read");
    }
  }
  async function save(scenarios: FeasibilityScenario[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(scenarios, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }
  return {
    list,
    async listForSite(externalSiteId) {
      return (await list()).filter((scenario) => scenario.siteId === externalSiteId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async create(input) {
      const scenarios = await list();
      const inputHash = digest({ siteId: input.externalSiteId, name: input.name, assumptions: input.assumptions });
      const existing = scenarios.find((scenario) => digest({ siteId: scenario.siteId, name: scenario.name, assumptions: scenario.assumptions }) === inputHash);
      if (existing) return existing;
      const scenario = calculate(input, randomUUID(), new Date().toISOString());
      await save([...scenarios, scenario]);
      return scenario;
    },
  };
}

function scenarioFromRow(row: {
  id: string;
  name: string;
  assumptions: Json;
  outputs: Json;
  calculation_version: string;
  created_at: string;
}, externalSiteId: string): FeasibilityScenario {
  return FeasibilityScenarioSchema.parse({
    id: row.id,
    siteId: externalSiteId,
    name: row.name,
    assumptions: row.assumptions,
    outputs: row.outputs,
    calculationVersion: row.calculation_version,
    createdAt: row.created_at,
  });
}

function createSupabaseRepository(client: SupabaseClient<Database>, organizationId: string): FeasibilityRepository {
  const columns = "id,site_id,name,assumptions,outputs,calculation_version,created_at" as const;
  async function externalSiteIdFor(siteId: string): Promise<string> {
    const { data, error } = await client.from("sites").select("normalized_apn").eq("organization_id", organizationId).eq("id", siteId).single();
    if (error || !data?.normalized_apn) throw safeError("site identity");
    return `sj-${data.normalized_apn}`;
  }
  return {
    async list() {
      const { data, error } = await client.from("feasibility_scenarios").select(columns).eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (error) throw safeError("Supabase list");
      return Promise.all((data ?? []).map(async (row) => scenarioFromRow(row, await externalSiteIdFor(row.site_id))));
    },
    async listForSite(externalSiteId) {
      const siteId = deterministicUuid(organizationId, `site:${externalSiteId}`);
      const { data, error } = await client.from("feasibility_scenarios").select(columns)
        .eq("organization_id", organizationId).eq("site_id", siteId).order("created_at", { ascending: false });
      if (error) throw safeError("Supabase site list");
      return (data ?? []).map((row) => scenarioFromRow(row, externalSiteId));
    },
    async create(input) {
      const siteId = deterministicUuid(organizationId, `site:${input.externalSiteId}`);
      const inputChecksum = digest({ siteId: input.externalSiteId, name: input.name, assumptions: input.assumptions });
      const id = deterministicUuid(organizationId, `feasibility:${input.externalSiteId}:${inputChecksum}`);
      const createdAt = new Date().toISOString();
      const scenario = calculate(input, id, createdAt);
      const { error } = await client.from("feasibility_scenarios").insert({
        id,
        organization_id: organizationId,
        site_id: siteId,
        name: scenario.name,
        assumptions: asJson(scenario.assumptions),
        research_context: asJson({
          parcelAcres: input.parcelAcres,
          fatalConstraintCount: input.fatalConstraintCount,
          materialUnknownCount: input.materialUnknownCount,
        }),
        outputs: asJson(scenario.outputs),
        input_checksum: inputChecksum,
        calculation_version: scenario.calculationVersion,
        created_by: input.userId,
        created_at: createdAt,
      });
      if (!error) return scenario;
      if (error.code !== "23505") throw safeError("Supabase create");
      const { data: existing, error: existingError } = await client.from("feasibility_scenarios").select(columns)
        .eq("organization_id", organizationId).eq("site_id", siteId).eq("input_checksum", inputChecksum).single();
      if (existingError || !existing) throw safeError("Supabase replay");
      return scenarioFromRow(existing, input.externalSiteId);
    },
  };
}

const repositories = new Map<string, FeasibilityRepository>();

export function feasibilityRepositoryForOrganization(organizationId?: string): FeasibilityRepository {
  const config = getIntegrationConfig();
  const resolvedOrganizationId = organizationId ?? config.SITEVELOCITY_ORGANIZATION_ID;
  const hasSupabase = Boolean(resolvedOrganizationId && config.SUPABASE_URL && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY));
  const useSupabase = config.PERSISTENCE_BACKEND === "supabase" || (config.PERSISTENCE_BACKEND === "auto" && !config.DEMO_MODE && hasSupabase);
  if (useSupabase) {
    if (!resolvedOrganizationId || !hasSupabase) throw new Error("Supabase feasibility requires an organization ID, URL, and server-side key.");
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

export const feasibilityTesting = { createFileRepository };
