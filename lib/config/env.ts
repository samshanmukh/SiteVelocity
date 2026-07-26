import { z } from "zod";
import { normalizeSupabaseProjectUrl } from "./supabase-url";

function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalSecret = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().trim().url().optional());
const optionalSupabaseUrl = z.preprocess(
  blankToUndefined,
  z.string().trim().url().transform(normalizeSupabaseProjectUrl).optional(),
);
const optionalSupabasePublishableKey = z.preprocess(
  blankToUndefined,
  z.string().trim().regex(/^sb_publishable_[A-Za-z0-9_-]+$/).optional(),
);
const optionalSupabaseSecretKey = z.preprocess(
  blankToUndefined,
  z.string().trim().regex(/^sb_secret_[A-Za-z0-9_-]+$/).optional(),
);
const optionalSupabaseServiceRoleKey = z.preprocess(
  blankToUndefined,
  z.string().trim().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).optional(),
);
const optionalUuid = z.preprocess(blankToUndefined, z.string().trim().uuid().optional());
const optionalPipelinePath = z.preprocess(
  blankToUndefined,
  z.string().trim().regex(/^pipelines\/rocketride\/[A-Za-z0-9][A-Za-z0-9._/-]*\.pipe$/).optional(),
);
const booleanFlag = (defaultValue: boolean) => z.preprocess(
  (value) => value === undefined || value === "" ? defaultValue : value,
  z.union([z.boolean(), z.enum(["true", "false"])]).transform((value) => value === true || value === "true"),
);

const IntegrationEnvironmentSchema = z.object({
  SUPABASE_URL: optionalSupabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: optionalSupabasePublishableKey,
  SUPABASE_SECRET_KEY: optionalSupabaseSecretKey,
  SUPABASE_SERVICE_ROLE_KEY: optionalSupabaseServiceRoleKey,
  DATABASE_URL: optionalUrl,
  DEMO_MODE: booleanFlag(true),
  LIVE_RESEARCH: booleanFlag(false),
  PERSISTENCE_BACKEND: z.enum(["auto", "file", "supabase"]).default("auto"),
  SITEVELOCITY_ORGANIZATION_ID: optionalUuid,
  WORKFLOW_PROVIDER: z.preprocess(blankToUndefined, z.enum(["render", "rocketride"]).default("render")),
  RENDER_API_KEY: optionalSecret,
  RENDER_WORKFLOW_TASK_SLUG: optionalSecret,
  ROCKETRIDE_APIKEY: optionalSecret,
  ROCKETRIDE_URI: optionalUrl,
  ROCKETRIDE_RESEARCH_PIPELINE: optionalPipelinePath,
  ROCKETRIDE_INGEST_PIPELINE: optionalPipelinePath,
  RTRVR_API_KEY: optionalSecret,
  MINIMAX_API_KEY: optionalSecret,
  MINIMAX_MODEL: optionalSecret.default("MiniMax-M2.7"),
  ELEVENLABS_API_KEY: optionalSecret,
  ELEVENLABS_VOICE_ID: optionalSecret.default("JBFqnCBsd6RMkjVDRZzb"),
  ELEVENLABS_MODEL_ID: optionalSecret.default("eleven_flash_v2_5"),
  ELEVENLABS_STT_MODEL_ID: optionalSecret.default("scribe_v2"),
  NEXLA_API_URL: optionalUrl,
  NEXLA_API_KEY: optionalSecret,
  NEXLA_TOKEN: optionalSecret,
  RESPAN_API_KEY: optionalSecret,
  MEM0_API_KEY: optionalSecret,
  WEBHOOK_SIGNING_SECRET: optionalSecret,
});

export type IntegrationConfig = z.infer<typeof IntegrationEnvironmentSchema>;

export function readIntegrationConfig(source: Record<string, string | undefined>): IntegrationConfig {
  return IntegrationEnvironmentSchema.parse(source);
}

export function getIntegrationConfig(): IntegrationConfig {
  return readIntegrationConfig(process.env);
}
