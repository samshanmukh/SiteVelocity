import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CandidateSetSchema } from "../../lib/domain/site";
import type { Database } from "../../lib/persistence/database.types";
import type { SnapshotBundle } from "../../lib/persistence/file-store";
import { createSupabaseProjectionStore } from "../../lib/persistence/supabase/projection-store";

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private readonly filters = new Map<string, unknown>();

  constructor(private readonly rows: Row[]) {}

  select(): this { return this; }
  eq(field: string, value: unknown): this { this.filters.set(field, value); return this; }
  order(): this { return this; }
  limit(): this { return this; }

  async insert(row: Row): Promise<{ error: { code: string } | null }> {
    const conflict = this.rows.some((existing) =>
      existing.organization_id === row.organization_id
      && existing.projection_kind === row.projection_kind
      && existing.scope_key === row.scope_key
      && (
        existing.version_key === row.version_key
        || existing.content_checksum === row.content_checksum
      ),
    );
    if (conflict) return { error: { code: "23505" } };
    this.rows.push({ ...row, created_at: "2026-07-25T00:00:00.000Z" });
    return { error: null };
  }

  private filtered(): Row[] {
    return this.rows
      .filter((row) => [...this.filters].every(([field, value]) => row[field] === value))
      .sort((a, b) => String(b.source_cutoff_at).localeCompare(String(a.source_cutoff_at)));
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.filtered()[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.filtered(), error: null }).then(onfulfilled, onrejected);
  }
}

function fakeClient(rows: Row[]): SupabaseClient<Database> {
  return {
    from() {
      return new FakeQuery(rows);
    },
  } as unknown as SupabaseClient<Database>;
}

async function candidateFixture() {
  const raw = JSON.parse(await readFile("data/candidates.json", "utf8")) as unknown;
  return CandidateSetSchema.parse(raw);
}

async function snapshotFixture(): Promise<SnapshotBundle> {
  return JSON.parse(
    await readFile("data/sites/sj-23018033/snapshots/snap-2026-07-25T21-34-52-873Z.json", "utf8"),
  ) as SnapshotBundle;
}

test("persists and restores a validated candidate-set projection idempotently", async () => {
  const rows: Row[] = [];
  const store = createSupabaseProjectionStore({
    organizationId: "00000000-0000-4000-8000-000000000001",
    client: fakeClient(rows),
  });
  const candidates = await candidateFixture();

  await store.saveCandidateSet(candidates);
  await store.saveCandidateSet(candidates);

  assert.equal(rows.length, 1);
  assert.deepEqual(await store.loadCandidateSet(), candidates);
});

test("rejects a reused projection version when its content changed", async () => {
  const rows: Row[] = [];
  const store = createSupabaseProjectionStore({
    organizationId: "00000000-0000-4000-8000-000000000001",
    client: fakeClient(rows),
  });
  const candidates = await candidateFixture();
  const changed = structuredClone(candidates);
  changed.sites[0].address = "Changed after version publication";

  await store.saveCandidateSet(candidates);

  await assert.rejects(
    () => store.saveCandidateSet(changed),
    /version conflicts with different content/,
  );
  assert.equal(rows.length, 1);
});

test("a complete snapshot remains active when a newer partial snapshot arrives", async () => {
  const rows: Row[] = [];
  const store = createSupabaseProjectionStore({
    organizationId: "00000000-0000-4000-8000-000000000001",
    client: fakeClient(rows),
  });
  const complete = await snapshotFixture();
  complete.snapshot.status = "complete";
  const partial = structuredClone(complete);
  partial.snapshot.id = "snap-newer-partial";
  partial.snapshot.status = "partial";
  partial.snapshot.createdAt = "2026-07-26T00:00:00.000Z";
  partial.snapshot.sourceCutoff = "2026-07-26T00:00:00.000Z";

  await store.saveSnapshotBundle(complete);
  await store.saveSnapshotBundle(partial);

  assert.equal((await store.loadActiveSnapshot(complete.snapshot.siteId))?.snapshot.id, complete.snapshot.id);
  assert.deepEqual(await store.listResearchedSiteIds(), [complete.snapshot.siteId]);
});

test("refuses failed snapshots instead of projecting them as current data", async () => {
  const store = createSupabaseProjectionStore({
    organizationId: "00000000-0000-4000-8000-000000000001",
    client: fakeClient([]),
  });
  const failed = await snapshotFixture();
  failed.snapshot.status = "failed";

  await assert.rejects(() => store.saveSnapshotBundle(failed), /cannot become active/);
});
