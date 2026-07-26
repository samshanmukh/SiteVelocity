import assert from "node:assert/strict";
import test from "node:test";
import { developmentEventsFromAppData } from "../../lib/view/development-events";
import type { CandidateSet } from "../../lib/domain/site";
import type { SnapshotView } from "../../lib/view/app-data";

test("projects evidence-backed timeline entries into newest-first development events", () => {
  const event = developmentEventsFromAppData({
    candidates: {
      sites: [{ id: "site-1", address: "100 Main St", apnFormatted: "123-45-678" }],
    } as CandidateSet,
    snapshots: {
      "site-1": {
        snapshot: { id: "snapshot-1", sourceCutoff: "2026-07-25T12:00:00.000Z" },
        timeline: [{ year: "2024", title: "Permit issued", description: "Official permit event.", dotColor: "#123", evidenceId: "evidence-1" }],
      } as SnapshotView,
    },
  })[0];

  assert.deepEqual(event, {
    year: "2024",
    title: "Permit issued",
    description: "Official permit event.",
    dotColor: "#123",
    evidenceId: "evidence-1",
    id: "snapshot-1:timeline:0",
    siteId: "site-1",
    siteName: "100 Main St",
    snapshotId: "snapshot-1",
    observedAt: "2026-07-25T12:00:00.000Z",
  });
});
