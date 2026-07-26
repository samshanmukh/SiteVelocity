import assert from "node:assert/strict";
import test from "node:test";
import { siblingRenderTaskSlug } from "../../lib/providers/render";

test("derives sibling task slugs inside one Render workflow", () => {
  assert.equal(siblingRenderTaskSlug("sitevelocity/researchSite", "ingestCandidates"), "sitevelocity/ingestCandidates");
});

test("rejects task identifiers that are not Render workflow/task slugs", () => {
  assert.throws(() => siblingRenderTaskSlug("researchSite", "ingestCandidates"), /workflow-name\/task-name/);
  assert.throws(() => siblingRenderTaskSlug("sitevelocity/researchSite", "../ingest"), /workflow-name\/task-name/);
});
