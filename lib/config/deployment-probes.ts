import "server-only";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { checkMiniMaxConnection } from "@/lib/providers/minimax";
import { checkRenderConnection } from "@/lib/providers/render";
import { isProviderReady } from "@/lib/providers/readiness";
import { checkRtrvrConfiguration } from "@/lib/providers/rtrvr";
import { checkSupabasePersistenceConnection } from "@/lib/providers/supabase";
import type {
  DependencyProbe,
  DependencyState,
  DeploymentEnvParseResult,
} from "./deployment-env";

function snapshotState(demoSnapshotId: string | null): DependencyState {
  if (demoSnapshotId === null) return "unready";
  const root = process.cwd();
  const candidates = [
    path.join(root, "data", "sites", `${demoSnapshotId}.json`),
    path.join(root, "data", "snapshots", `${demoSnapshotId}.json`),
  ];
  if (candidates.some((file) => existsSync(file))) return "ready";
  const sitesRoot = path.join(root, "data", "sites");
  if (!existsSync(sitesRoot)) return "unready";
  const nestedSnapshotExists = readdirSync(sitesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .some((entry) => existsSync(path.join(sitesRoot, entry.name, "snapshots", `${demoSnapshotId}.json`)));
  return nestedSnapshotExists ? "ready" : "unready";
}

/**
 * Probes the mode-required dependencies with the bounded provider checks.
 * Dependencies outside the active mode are skipped, never contacted.
 * Results carry states only; provider diagnostics stay server-side (R15).
 */
export async function probeDependencies(
  parsed: DeploymentEnvParseResult,
): Promise<DependencyProbe> {
  const skipped: DependencyProbe = {
    persistence: "skipped",
    storedSnapshot: "skipped",
    render: "skipped",
    rtrvr: "skipped",
    minimax: "skipped",
  };
  if (parsed.status === "rejected") return skipped;

  const { env } = parsed;
  const source = process.env;
  const probe: DependencyProbe = { ...skipped };

  const supabasePromise = checkSupabasePersistenceConnection({
    url: source.SUPABASE_URL,
    publishableKey: source.SUPABASE_PUBLISHABLE_KEY,
    secretKey: source.SUPABASE_SECRET_KEY,
    serviceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (env.demoMode) {
    probe.storedSnapshot = snapshotState(env.demoSnapshotId);
  }

  if (env.liveResearch) {
    const [supabase, render, minimax] = await Promise.all([
      supabasePromise,
      checkRenderConnection(source.RENDER_API_KEY, source.RENDER_WORKFLOW_TASK_SLUG),
      checkMiniMaxConnection(source.MINIMAX_API_KEY),
    ]);
    probe.persistence = supabase.status === "connected" ? "ready" : "unready";
    probe.render = isProviderReady(render) ? "ready" : "unready";
    probe.rtrvr = isProviderReady(checkRtrvrConfiguration(source.RTRVR_API_KEY)) ? "ready" : "unready";
    probe.minimax = isProviderReady(minimax) ? "ready" : "unready";
  } else {
    const supabase = await supabasePromise;
    probe.persistence = supabase.status === "connected" ? "ready" : "unready";
  }

  return probe;
}
