import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationConfig } from "@/lib/config/env";
import { WatchlistSchema, type Watchlist } from "@/lib/domain/watchlist";
import type { Database } from "./database.types";
import { deterministicUuid } from "./identity";
import { createSupabaseAdminClient } from "./supabase/admin";

export interface WatchlistRepository {
  list(): Promise<Watchlist[]>;
  create(input: { name: string; description?: string }): Promise<Watchlist>;
  addSite(watchlistId: string, externalSiteId: string): Promise<void>;
}

function safeError(stage: string): Error {
  return new Error(`Watchlist persistence failed at ${stage}.`);
}

function createFileRepository(path = join(process.cwd(), "data", "runtime", "watchlists.json")): WatchlistRepository {
  async function list(): Promise<Watchlist[]> {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      return WatchlistSchema.array().parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw safeError("file read");
    }
  }

  async function save(watchlists: Watchlist[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(watchlists, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }

  return {
    list,
    async create(input) {
      const watchlists = await list();
      if (watchlists.some((item) => item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase())) {
        throw new Error("A watchlist with that name already exists.");
      }
      const now = new Date().toISOString();
      const watchlist = WatchlistSchema.parse({ id: randomUUID(), name: input.name, description: input.description ?? null, siteIds: [], createdAt: now, updatedAt: now });
      await save([...watchlists, watchlist]);
      return watchlist;
    },
    async addSite(watchlistId, externalSiteId) {
      const watchlists = await list();
      const index = watchlists.findIndex((item) => item.id === watchlistId);
      if (index < 0) throw new Error("Watchlist not found.");
      const existing = watchlists[index]!;
      if (!existing.siteIds.includes(externalSiteId)) {
        watchlists[index] = { ...existing, siteIds: [...existing.siteIds, externalSiteId], updatedAt: new Date().toISOString() };
        await save(watchlists);
      }
    },
  };
}

function createSupabaseRepository(client: SupabaseClient<Database>, organizationId: string): WatchlistRepository {
  return {
    async list() {
      const { data, error } = await client
        .from("watchlists")
        .select("id,name,description,created_at,updated_at,watchlist_sites(external_site_id)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });
      if (error) throw safeError("Supabase list");
      return (data ?? []).map((row) => WatchlistSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        siteIds: row.watchlist_sites.map((site) => site.external_site_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    async create(input) {
      const id = randomUUID();
      const { data, error } = await client.from("watchlists").insert({ id, organization_id: organizationId, name: input.name, description: input.description ?? null }).select("id,name,description,created_at,updated_at").single();
      if (error || !data) throw safeError("Supabase create");
      return WatchlistSchema.parse({ id: data.id, name: data.name, description: data.description, siteIds: [], createdAt: data.created_at, updatedAt: data.updated_at });
    },
    async addSite(watchlistId, externalSiteId) {
      const siteId = deterministicUuid(organizationId, `site:${externalSiteId}`);
      const { error } = await client.from("watchlist_sites").upsert({ organization_id: organizationId, watchlist_id: watchlistId, site_id: siteId, external_site_id: externalSiteId }, { onConflict: "watchlist_id,site_id", ignoreDuplicates: true });
      if (error) throw safeError("Supabase add site");
    },
  };
}

const repositories = new Map<string, WatchlistRepository>();

export function watchlistRepositoryForOrganization(organizationId?: string): WatchlistRepository {
  const config = getIntegrationConfig();
  const resolvedOrganizationId = organizationId ?? config.SITEVELOCITY_ORGANIZATION_ID;
  const hasSupabase = Boolean(resolvedOrganizationId && config.SUPABASE_URL && (config.SUPABASE_SECRET_KEY || config.SUPABASE_SERVICE_ROLE_KEY));
  const useSupabase = config.PERSISTENCE_BACKEND === "supabase" || (config.PERSISTENCE_BACKEND === "auto" && !config.DEMO_MODE && hasSupabase);
  if (useSupabase) {
    if (!resolvedOrganizationId || !hasSupabase) throw new Error("Supabase watchlists require an organization ID, URL, and server-side key.");
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

export async function listWatchlists(): Promise<Watchlist[]> {
  return watchlistRepositoryForOrganization().list();
}

export async function createWatchlist(input: { name: string; description?: string }): Promise<Watchlist> {
  return watchlistRepositoryForOrganization().create(input);
}

export async function addSiteToWatchlist(watchlistId: string, siteId: string): Promise<void> {
  return watchlistRepositoryForOrganization().addSite(watchlistId, siteId);
}

export const watchlistTesting = { createFileRepository };
