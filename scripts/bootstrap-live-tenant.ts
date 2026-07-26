import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ALPHA_THESIS } from "../lib/domain/buy-box";
import { DEFAULT_WORKSPACE_AGENT_SETTINGS } from "../lib/domain/workspace-settings";
import { deterministicUuid } from "../lib/persistence/identity";
import { createSupabaseAdminClient } from "../lib/persistence/supabase/admin";
import type { Json } from "../lib/persistence/database.types";

const ArgumentsSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160).default("SiteVelocity Team"),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).default("sitevelocity-team"),
}).refine((value) => Boolean(value.email || value.userId), { message: "Pass --email=<auth email> or --user-id=<auth user UUID>." });

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  for (const argument of argv) {
    const match = /^--(email|user-id|name|slug)=(.+)$/.exec(argument);
    if (match?.[1] && match[2]) values[match[1]] = match[2];
  }
  return ArgumentsSchema.parse({
    email: values.email,
    userId: values["user-id"],
    name: values.name,
    slug: values.slug,
  });
}

async function userIdFor(email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  for (let page = 1; page <= 20; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw new Error("Supabase Auth user lookup failed.");
    const match = result.data.users.find((user) => user.email?.toLocaleLowerCase() === email.toLocaleLowerCase());
    if (match) return match.id;
    if (result.data.users.length < 100) return null;
  }
  return null;
}

export async function bootstrapLiveTenant(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const admin = createSupabaseAdminClient();
  const userId = args.userId ?? await userIdFor(args.email as string);
  if (!userId) throw new Error("No Supabase Auth user has that email. Sign in once or create the user before bootstrapping the tenant.");

  const existing = await admin.from("organizations").select("id,name,slug").eq("slug", args.slug).maybeSingle();
  if (existing.error) throw new Error("Organization lookup failed. Confirm all migrations are applied.");
  const organizationId = existing.data?.id ?? randomUUID();
  if (!existing.data) {
    const created = await admin.from("organizations").insert({ id: organizationId, name: args.name, slug: args.slug });
    if (created.error) throw new Error("Organization creation failed.");
  }

  const membership = await admin.from("organization_memberships").upsert({
    organization_id: organizationId,
    user_id: userId,
    role: "owner",
  }, { onConflict: "organization_id,user_id" });
  if (membership.error) throw new Error("Owner membership creation failed.");

  const thesisId = deterministicUuid(organizationId, `thesis:${ALPHA_THESIS.id}`);
  const thesis = await admin.from("development_theses").upsert({
    id: thesisId,
    organization_id: organizationId,
    name: ALPHA_THESIS.name,
    status: "active",
    market: ALPHA_THESIS.market,
    strategy: ALPHA_THESIS.strategy,
    criteria: {
      externalThesisId: ALPHA_THESIS.id,
      county: ALPHA_THESIS.county,
      minAcres: ALPHA_THESIS.minAcres,
      maxAcres: ALPHA_THESIS.maxAcres,
      preferredMinCapacity: ALPHA_THESIS.preferredMinCapacity,
    },
    version: 1,
    created_by: userId,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (thesis.error) throw new Error("Default thesis creation failed.");

  const settings = await admin.from("workspace_agent_settings").upsert({
    organization_id: organizationId,
    enabled_agents: DEFAULT_WORKSPACE_AGENT_SETTINGS.enabledAgents as unknown as Json,
    verification_depth: DEFAULT_WORKSPACE_AGENT_SETTINGS.verificationDepth,
    max_external_research_tasks_per_site: DEFAULT_WORKSPACE_AGENT_SETTINGS.maxExternalResearchTasksPerSite,
    updated_by: userId,
  }, { onConflict: "organization_id", ignoreDuplicates: true });
  if (settings.error) throw new Error("Default agent settings creation failed.");

  const result = { organizationId, organizationSlug: args.slug, ownerUserId: userId };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if ((process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/bootstrap-live-tenant.ts")) {
  bootstrapLiveTenant().catch((error) => {
    console.error(`tenant:bootstrap: ${error instanceof Error ? error.message : "unknown failure"}`);
    process.exitCode = 1;
  });
}
