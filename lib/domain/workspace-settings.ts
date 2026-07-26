import { z } from "zod";

export const ResearchAgentKeySchema = z.enum([
  "land_use",
  "site_risk",
  "development_history",
  "verifier",
  "next_best_action",
]);
export type ResearchAgentKey = z.infer<typeof ResearchAgentKeySchema>;

export const VerificationDepthSchema = z.enum(["screening", "standard", "enhanced"]);
export type VerificationDepth = z.infer<typeof VerificationDepthSchema>;

export const EnabledAgentsSchema = z.object({
  land_use: z.boolean(),
  site_risk: z.boolean(),
  development_history: z.boolean(),
  verifier: z.boolean(),
  next_best_action: z.boolean(),
}).strict();

export const WorkspaceAgentSettingsSchema = z.object({
  enabledAgents: EnabledAgentsSchema,
  verificationDepth: VerificationDepthSchema,
  maxExternalResearchTasksPerSite: z.number().int().min(0).max(2),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type WorkspaceAgentSettings = z.infer<typeof WorkspaceAgentSettingsSchema>;

export const UpdateWorkspaceAgentSettingsSchema = WorkspaceAgentSettingsSchema.omit({ updatedAt: true }).strict();
export type UpdateWorkspaceAgentSettings = z.infer<typeof UpdateWorkspaceAgentSettingsSchema>;

export const DEFAULT_WORKSPACE_AGENT_SETTINGS: WorkspaceAgentSettings = {
  enabledAgents: {
    land_use: true,
    site_risk: true,
    development_history: true,
    verifier: true,
    next_best_action: true,
  },
  verificationDepth: "standard",
  maxExternalResearchTasksPerSite: 2,
  updatedAt: null,
};
