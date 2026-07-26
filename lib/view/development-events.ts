import type { CandidateSet } from "../domain/site";
import type { TimelineEvent } from "../research/pipeline";
import type { SnapshotView } from "./app-data";

export interface DevelopmentEventView extends TimelineEvent {
  id: string;
  siteId: string;
  siteName: string;
  snapshotId: string;
  observedAt: string;
}

export function developmentEventsFromAppData(data: {
  candidates: CandidateSet | null;
  snapshots: Record<string, SnapshotView>;
}): DevelopmentEventView[] {
  const sites = new Map((data.candidates?.sites ?? []).map((site) => [site.id, site]));
  return Object.entries(data.snapshots)
    .flatMap(([siteId, snapshot]) => {
      const siteName = sites.get(siteId)?.address ?? `APN ${sites.get(siteId)?.apnFormatted ?? siteId}`;
      const timelineEvents = snapshot.timeline.map((event, index) => ({
        ...event,
        id: `${snapshot.snapshot.id}:timeline:${index}`,
        siteId,
        siteName,
        snapshotId: snapshot.snapshot.id,
        observedAt: snapshot.snapshot.sourceCutoff,
      }));
      const changeEvents = snapshot.changes?.fromSnapshotId
        ? snapshot.changes.changes.filter((change) => change.material).map((change, index) => ({
          year: snapshot.snapshot.createdAt.slice(0, 4),
          title: `${change.field.replace(/_/g, " ")} ${change.kind === "not_observed" ? "not observed" : change.kind}`,
          description: change.summary,
          dotColor: change.current?.impact === "fatal_constraint" ? "#B22730" : "#D9A62E",
          evidenceId: change.current?.evidenceIds[0] ?? change.previous?.evidenceIds[0] ?? null,
          id: `${snapshot.snapshot.id}:change:${index}`,
          siteId,
          siteName,
          snapshotId: snapshot.snapshot.id,
          observedAt: snapshot.snapshot.sourceCutoff,
        }))
        : [];
      return [...timelineEvents, ...changeEvents];
    })
    .sort((left, right) => right.year.localeCompare(left.year) || right.observedAt.localeCompare(left.observedAt));
}
