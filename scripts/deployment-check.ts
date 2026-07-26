// Deployment verification: `npm run deployment:check -- --target=render [--static] [--smoke --base-url=<url>]`
// (render-alpha-deployment R2, R3, R5, R8, R9, R12, R13, R15, R16).
//
// static  — deterministic artifact checks, no environment or network required.
// env     — static checks plus deployment-environment validation (default).
// smoke   — bounded post-deploy checks against the liveness and readiness routes.
//
// Exit code 0 means ready for the requested mode; 1 means blocked.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  evaluateReadiness,
  parseDeploymentEnv,
  planRollback,
  scanForSecretLeaks,
  type RollbackPlan,
  type ScannedFile,
} from "../lib/config/deployment-env";

export interface CheckFinding {
  code: string;
  detail: string;
}

const SECRET_NAMES = [
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "RENDER_API_KEY",
  "RTRVR_API_KEY",
  "MINIMAX_API_KEY",
  "NEXLA_API_KEY",
  "NEXLA_TOKEN",
  "RESPAN_API_KEY",
  "CEREBRAS_API_KEY",
  "ELEVENLABS_API_KEY",
  "MEM0_API_KEY",
  "WEBHOOK_SIGNING_SECRET",
] as const;

const FORBIDDEN_HOSTING_FILES = [
  "vercel.json",
  "netlify.toml",
  "fly.toml",
  "Procfile",
  "Dockerfile",
  "app.yaml",
] as const;

interface RenderEnvVar {
  key: string;
  value?: unknown;
  sync?: boolean;
}

interface RenderService {
  type?: string;
  name?: string;
  runtime?: string;
  branch?: string;
  healthCheckPath?: string;
  preDeployCommand?: string;
  startCommand?: string;
  schedule?: string;
  envVars?: RenderEnvVar[];
}

function read(root: string, relative: string): string | null {
  const file = path.join(root, relative);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function nodeMajor(version: string): string | null {
  const match = version.trim().match(/^v?(\d+)/);
  return match ? match[1] : null;
}

export function runStaticChecks(root: string): CheckFinding[] {
  const findings: CheckFinding[] = [];

  // Runtime pin consistency (R2).
  const nodeVersionFile = read(root, ".node-version");
  const packageJsonRaw = read(root, "package.json");
  const pinnedMajor = nodeVersionFile ? nodeMajor(nodeVersionFile) : null;
  if (!nodeVersionFile || pinnedMajor !== "22") {
    findings.push({ code: "runtime_pin_missing", detail: ".node-version must pin Node major 22" });
  }
  let packageJson: { engines?: { node?: string }; scripts?: Record<string, string> } = {};
  if (!packageJsonRaw) {
    findings.push({ code: "package_json_missing", detail: "package.json not found" });
  } else {
    packageJson = JSON.parse(packageJsonRaw);
    if (nodeMajor(packageJson.engines?.node ?? "") !== "22") {
      findings.push({ code: "runtime_pin_mismatch", detail: "package.json engines.node must pin Node major 22" });
    }
    for (const script of ["db:migrate", "workflow:start", "ingest:schedule", "deployment:check", "test:contracts", "lint", "typecheck", "test", "build", "start"]) {
      if (!packageJson.scripts?.[script]) {
        findings.push({ code: "script_missing", detail: `package.json scripts.${script} is required` });
      }
    }
  }

  // Blueprint checks (R2, R4, R5, R10, R15, R16).
  const renderYamlRaw = read(root, "render.yaml");
  if (!renderYamlRaw) {
    findings.push({ code: "blueprint_missing", detail: "render.yaml not found" });
  } else {
    const blueprint = parseYaml(renderYamlRaw) as { services?: RenderService[] };
    const services = blueprint.services ?? [];
    const web = services.filter((service) => service.type === "web");
    const cron = services.filter((service) => service.type === "cron");

    if (web.length !== 1 || cron.length !== 1) {
      findings.push({ code: "service_shape", detail: "render.yaml must declare exactly one web and one ingestion cron service" });
    }
    const branches = new Set(services.map((service) => service.branch ?? ""));
    if (branches.size > 1) {
      findings.push({ code: "release_divergence", detail: "Blueprint services must deploy from the same branch (same release SHA)" });
    }
    for (const service of services) {
      if (service.runtime !== "node") {
        findings.push({ code: "runtime_mismatch", detail: `service ${service.name ?? "?"} must use the node runtime` });
      }
      const nodeVersionVar = service.envVars?.find((envVar) => envVar.key === "NODE_VERSION");
      if (!nodeVersionVar || nodeMajor(String(nodeVersionVar.value ?? "")) !== "22") {
        findings.push({ code: "runtime_pin_mismatch", detail: `service ${service.name ?? "?"} NODE_VERSION must pin Node major 22` });
      }
      for (const envVar of service.envVars ?? []) {
        if ((SECRET_NAMES as readonly string[]).includes(envVar.key)) {
          if (envVar.sync !== false || envVar.value !== undefined) {
            findings.push({ code: "secret_value_present", detail: `render.yaml must declare ${envVar.key} presence-only (sync: false, no value)` });
          }
        }
        if (envVar.key.startsWith("NEXT_PUBLIC_") && SECRET_NAMES.some((name) => envVar.key.includes(name))) {
          findings.push({ code: "public_secret_name", detail: `render.yaml must not expose ${envVar.key}` });
        }
      }
    }
    const webService = web[0];
    if (webService) {
      if (webService.healthCheckPath !== "/api/health/live") {
        findings.push({ code: "health_path_invalid", detail: "web healthCheckPath must be /api/health/live" });
      }
      if (webService.healthCheckPath === "/api/integrations") {
        findings.push({ code: "health_path_forbidden", detail: "/api/integrations is never the platform health path" });
      }
      if (!webService.preDeployCommand?.includes("db:migrate")) {
        findings.push({ code: "migration_gate_missing", detail: "web preDeployCommand must run npm run db:migrate" });
      }
    }
    const cronService = cron[0];
    if (cronService) {
      if (cronService.startCommand !== "npm run ingest:schedule") {
        findings.push({ code: "schedule_command_invalid", detail: "ingestion cron must run npm run ingest:schedule" });
      }
      if (!cronService.schedule) {
        findings.push({ code: "schedule_missing", detail: "ingestion cron must declare a schedule" });
      }
    }
  }

  for (const forbidden of FORBIDDEN_HOSTING_FILES) {
    if (existsSync(path.join(root, forbidden))) {
      findings.push({ code: "alternate_hosting_target", detail: `${forbidden} must not exist; Render is the exclusive Alpha host` });
    }
  }

  // CI ordering (R3) without touching the managed secrets workflow.
  const ciRaw = read(root, path.join(".github", "workflows", "ci.yml"));
  if (!ciRaw) {
    findings.push({ code: "ci_missing", detail: ".github/workflows/ci.yml not found" });
  } else {
    if (!ciRaw.includes("node-version-file: .node-version")) {
      findings.push({ code: "ci_runtime_pin", detail: "ci.yml must use node-version-file: .node-version" });
    }
    const order = [
      "npm ci",
      "npm run typecheck",
      "npm run lint",
      "npm test",
      "npm run test:contracts",
      "npm run build",
      "npm audit --audit-level=high",
    ];
    let cursor = -1;
    for (const command of order) {
      const index = ciRaw.indexOf(command);
      if (index === -1 || index < cursor) {
        findings.push({ code: "ci_gate_order", detail: `ci.yml must run '${command}' after the previous gate` });
        break;
      }
      cursor = index;
    }
  }
  const dispatchRaw = read(root, path.join(".github", "workflows", "pdd-secrets-dispatch.yml"));
  if (!dispatchRaw || !dispatchRaw.startsWith("# Managed by PDD GitHub App")) {
    findings.push({ code: "managed_workflow_modified", detail: "pdd-secrets-dispatch.yml must remain the managed original" });
  }

  // Secret hygiene in declarative artifacts (R9).
  const scannable: ScannedFile[] = [];
  const envExample = read(root, ".env.example");
  if (envExample) scannable.push({ path: ".env.example", content: envExample });
  if (renderYamlRaw) scannable.push({ path: "render.yaml", content: renderYamlRaw });
  for (const finding of scanForSecretLeaks(scannable, [...SECRET_NAMES])) {
    findings.push({ code: finding.code, detail: `${finding.file}: ${finding.variable}` });
  }

  return findings;
}

export interface SmokeCheckResult {
  ok: boolean;
  checks: { path: string; status: number | "unreachable" }[];
  rollback?: RollbackPlan;
}

export async function runSmokeChecks(
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs = 5_000,
): Promise<SmokeCheckResult> {
  const checks: SmokeCheckResult["checks"] = [];
  let ok = true;

  // Bounded checks; readiness covers stored-snapshot loading in demo mode (R12).
  for (const route of ["/api/health/live", "/api/health/ready"]) {
    try {
      const response = await fetchImpl(new URL(route, baseUrl), {
        signal: AbortSignal.timeout(timeoutMs),
      });
      checks.push({ path: route, status: response.status });
      if (response.status !== 200) ok = false;
    } catch {
      checks.push({ path: route, status: "unreachable" });
      ok = false;
    }
  }

  const result: SmokeCheckResult = { ok, checks };
  if (!ok) {
    result.rollback = planRollback({
      candidateReleaseId:
        process.env.RELEASE_SHA?.trim() || process.env.RENDER_GIT_COMMIT?.trim() || "unknown",
      lastKnownGoodReleaseId: process.env.LAST_KNOWN_GOOD_RELEASE_ID?.trim() || null,
      activeSnapshotId: process.env.DEMO_SNAPSHOT_ID?.trim() || null,
      failure: "smoke",
    });
  }
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const target = args.find((arg) => arg.startsWith("--target="))?.slice("--target=".length);
  const staticOnly = args.includes("--static");
  const smoke = args.includes("--smoke");
  const baseUrl = args.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length);

  if (target !== "render") {
    console.error("deployment:check: --target=render is required; Render is the exclusive Alpha host.");
    process.exitCode = 1;
    return;
  }

  const staticFindings = runStaticChecks(process.cwd());
  const report: Record<string, unknown> = {
    target: "render",
    mode: smoke ? "smoke" : staticOnly ? "static" : "env",
    staticFindings,
  };
  let blocked = staticFindings.length > 0;

  if (!staticOnly) {
    const parsed = parseDeploymentEnv(process.env);
    report.environment =
      parsed.status === "parsed"
        ? { status: "parsed", releaseId: parsed.env.releaseId, demoMode: parsed.env.demoMode, liveResearch: parsed.env.liveResearch }
        : { status: "rejected", issues: parsed.issues };
    const { probeDependencies } = await import("../lib/config/deployment-probes");
    const readiness = evaluateReadiness(parsed, await probeDependencies(parsed));
    report.readiness = readiness;
    if (readiness.state === "blocked") blocked = true;
  }

  if (smoke) {
    if (!baseUrl) {
      console.error("deployment:check: --smoke requires --base-url=<deployed origin>.");
      process.exitCode = 1;
      return;
    }
    const smokeResult = await runSmokeChecks(baseUrl, fetch);
    report.smoke = smokeResult;
    if (!smokeResult.ok) blocked = true;
  }

  report.state = blocked ? "blocked" : "ready";
  console.log(JSON.stringify(report, null, 2));
  if (blocked) process.exitCode = 1;
}

const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("scripts/deployment-check.ts");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(`deployment:check: ${error instanceof Error ? error.message : "unknown failure"}`);
    process.exitCode = 1;
  });
}
