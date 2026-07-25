import "server-only";
import { getIntegrationConfig } from "@/lib/config/env";
import { checkMiniMaxConnection } from "./minimax";
import { checkRenderConnection } from "./render";
import { checkRtrvrConfiguration } from "./rtrvr";
import { checkSupabaseConnection } from "./supabase";
import type { ProviderDiagnostic } from "./types";

export async function checkProviderConnections(): Promise<ProviderDiagnostic[]> {
  const config = getIntegrationConfig();
  const supabaseKey = config.SUPABASE_SECRET_KEY
    ?? config.SUPABASE_SERVICE_ROLE_KEY
    ?? config.SUPABASE_PUBLISHABLE_KEY;

  const [supabase, render, minimax] = await Promise.all([
    checkSupabaseConnection(config.SUPABASE_URL, supabaseKey),
    checkRenderConnection(config.RENDER_API_KEY, config.RENDER_WORKFLOW_TASK_SLUG),
    checkMiniMaxConnection(config.MINIMAX_API_KEY),
  ]);

  return [supabase, render, checkRtrvrConfiguration(config.RTRVR_API_KEY), minimax];
}
