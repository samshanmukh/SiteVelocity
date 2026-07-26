import { z } from "zod";

export const ScoutPreferenceCategorySchema = z.enum([
  "investment_criteria",
  "risk_tolerance",
  "communication",
  "workflow",
]);
export type ScoutPreferenceCategory = z.infer<typeof ScoutPreferenceCategorySchema>;

export const CreateScoutPreferenceSchema = z.object({
  category: ScoutPreferenceCategorySchema,
  content: z.string().trim().min(3).max(500),
}).strict();
export type CreateScoutPreference = z.infer<typeof CreateScoutPreferenceSchema>;

export const ScoutPreferenceSchema = CreateScoutPreferenceSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
}).strict();
export type ScoutPreference = z.infer<typeof ScoutPreferenceSchema>;

export const ScoutPreferenceListSchema = z.object({
  preferences: z.array(ScoutPreferenceSchema).max(50),
}).strict();
