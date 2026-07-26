import "server-only";
import { getIntegrationConfig } from "@/lib/config/env";
import { checkMiniMaxConnection } from "./minimax";
import { checkRenderConnection } from "./render";
import { checkRocketRideConnection } from "./rocketride";
import { checkRtrvrConfiguration } from "./rtrvr";
import { checkSupabasePersistenceConnection } from "./supabase";
import type { ProviderDiagnostic } from "./types";
import { configuredProvider } from "./configuration";

export async function checkProviderConnections(): Promise<ProviderDiagnostic[]> {
  const config = getIntegrationConfig();

  const [supabase, render, rocketride, minimax] = await Promise.all([
    checkSupabasePersistenceConnection({
      url: config.SUPABASE_URL,
      publishableKey: config.SUPABASE_PUBLISHABLE_KEY,
      secretKey: config.SUPABASE_SECRET_KEY,
      serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
    }),
    checkRenderConnection(config.RENDER_API_KEY, config.RENDER_WORKFLOW_TASK_SLUG),
    checkRocketRideConnection(
      config.ROCKETRIDE_APIKEY,
      config.ROCKETRIDE_URI,
      config.ROCKETRIDE_RESEARCH_PIPELINE,
      config.ROCKETRIDE_INGEST_PIPELINE,
    ),
    checkMiniMaxConnection(config.MINIMAX_API_KEY),
  ]);

  return [
    supabase,
    render,
    rocketride,
    checkRtrvrConfiguration(config.RTRVR_API_KEY),
    minimax,
    configuredProvider(
      "nexla",
      "Nexla",
      Boolean(config.NEXLA_API_URL && (config.NEXLA_API_KEY || config.NEXLA_TOKEN)),
      "API endpoint and credential are present for managed ingestion flows; an authenticated health probe is not run during page render.",
      "Add NEXLA_API_URL and NEXLA_API_KEY (or NEXLA_TOKEN) to enable managed ingestion.",
    ),
    configuredProvider(
      "respan",
      "Respan",
      Boolean(config.RESPAN_API_KEY),
      "Tracing credential is present; workflow instrumentation can publish traces and evaluations.",
      "Add RESPAN_API_KEY to enable provider tracing and evaluations.",
    ),
    configuredProvider(
      "mem0",
      "Mem0",
      Boolean(config.MEM0_API_KEY),
      "Memory credential is present; Scout preferences persist locally and sync to Mem0 without becoming property evidence.",
      "Add MEM0_API_KEY to enable durable Scout memory.",
    ),
    configuredProvider(
      "elevenlabs",
      "ElevenLabs",
      Boolean(config.ELEVENLABS_API_KEY),
      "Speech-to-text and text-to-speech credentials are present for Scout voice interactions.",
      "Add ELEVENLABS_API_KEY to enable Scout microphone and voice playback.",
    ),
    configuredProvider(
      "mapbox",
      "Mapbox",
      Boolean(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN),
      "Public map token is present for the live parcel-centroid opportunity map.",
      "Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the Mapbox opportunity map.",
    ),
  ];
}
