import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { checkMiniMaxConnection } from "@/lib/providers/minimax";
import { checkRenderConnection } from "@/lib/providers/render";
import { isProviderReady } from "@/lib/providers/readiness";
import { checkRtrvrConfiguration } from "@/lib/providers/rtrvr";
import { checkSupabaseConnection } from "@/lib/providers/supabase";
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
  return candidates.some((file) => existsSync(file)) ? "ready" : "unready";
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

  if (env.demoMode) {
    const supabaseKey =
      source.SUPABASE_SECRET_KEY || source.SUPABASE_SERVICE_ROLE_KEY || source.SUPABASE_PUBLISHABLE_KEY;
    const supabase = await checkSupabaseConnection(source.SUPABASE_URL, supabaseKey);
    probe.persistence = isProviderReady(supabase) ? "ready" : "unready";
    probe.storedSnapshot = snapshotState(env.demoSnapshotId);
  }

  if (env.liveResearch) {
    const [render, minimax] = await Promise.all([
      checkRenderConnection(source.RENDER_API_KEY, source.RENDER_WORKFLOW_TASK_SLUG),
      checkMiniMaxConnection(source.MINIMAX_API_KEY),
    ]);
    probe.render = isProviderReady(render) ? "ready" : "unready";
    probe.rtrvr = isProviderReady(checkRtrvrConfiguration(source.RTRVR_API_KEY)) ? "ready" : "unready";
    probe.minimax = isProviderReady(minimax) ? "ready" : "unready";
  }

  return probe;
}
