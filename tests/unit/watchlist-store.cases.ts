import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { watchlistTesting } from "../../lib/persistence/watchlist-store";

test("file watchlists create, reject duplicate names, and add a site idempotently", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sitevelocity-watchlists-"));
  try {
    const repository = watchlistTesting.createFileRepository(join(directory, "watchlists.json"));
    const created = await repository.create({ name: "Downtown targets" });
    await repository.addSite(created.id, "site-1");
    await repository.addSite(created.id, "site-1");

    const restored = await repository.list();
    assert.equal(restored.length, 1);
    assert.deepEqual(restored[0]?.siteIds, ["site-1"]);
    await assert.rejects(() => repository.create({ name: "downtown TARGETS" }), /already exists/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
