import { z } from "zod";

function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalSecret = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().trim().url().optional());

const IntegrationEnvironmentSchema = z.object({
  SUPABASE_URL: optionalUrl,
  SUPABASE_PUBLISHABLE_KEY: optionalSecret,
  SUPABASE_SECRET_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  RENDER_API_KEY: optionalSecret,
  RENDER_WORKFLOW_TASK_SLUG: optionalSecret,
  RTRVR_API_KEY: optionalSecret,
  MINIMAX_API_KEY: optionalSecret,
  MINIMAX_MODEL: optionalSecret.default("MiniMax-M2.7"),
});

export type IntegrationConfig = z.infer<typeof IntegrationEnvironmentSchema>;

export function readIntegrationConfig(source: Record<string, string | undefined>): IntegrationConfig {
  return IntegrationEnvironmentSchema.parse(source);
}

export function getIntegrationConfig(): IntegrationConfig {
  return readIntegrationConfig(process.env);
}
