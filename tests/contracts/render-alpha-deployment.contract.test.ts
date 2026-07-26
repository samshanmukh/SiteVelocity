import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import {
  evaluateReadiness,
  filterPendingMigrations,
  parseDeploymentEnv,
  planRollback,
  readinessHttpStatus,
  scanForSecretLeaks,
  type DependencyProbe,
} from "../../lib/config/deployment-env";
import { runMigrations, type MigrationExecutor } from "../../scripts/db-migrate";
import { runSmokeChecks, runStaticChecks } from "../../scripts/deployment-check";
import { GET as livenessGet } from "../../app/api/health/live/route";

// Contract tests for prompts/modules/render-alpha-deployment_typescript.prompt.
// Test names begin with the contract rule ID they verify (R1-R16).

const ROOT = process.cwd();

function repoFile(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

const READY_PROBE: DependencyProbe = {
  persistence: "ready",
  storedSnapshot: "ready",
  render: "ready",
  rocketride: "ready",
  rtrvr: "ready",
  minimax: "ready",
};

const DEMO_ENV: Record<string, string> = {
  APP_BASE_URL: "https://alpha.sitevelocity.example",
  NODE_ENV: "production",
  DEMO_MODE: "true",
  LIVE_RESEARCH: "false",
  DEMO_SNAPSHOT_ID: "snapshot-2026-07-25",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb-secret-test-value",
  RELEASE_SHA: "abc1234",
  LAST_KNOWN_GOOD_RELEASE_ID: "lkg9876",
};

const LIVE_ENV: Record<string, string> = {
  ...DEMO_ENV,
  LIVE_RESEARCH: "true",
  RENDER_API_KEY: "rnd-test-value",
  RENDER_WORKFLOW_TASK_SLUG: "sitevelocity/researchSite",
  RTRVR_API_KEY: "rtrvr-test-value",
  MINIMAX_API_KEY: "mm-test-value",
};

function nodeMajor(version: string): string {
  const match = version.trim().match(/^v?(\d+)/);
  assert.ok(match, `unparsable node version: ${version}`);
  return match[1];
}

test("R1: parse, readiness, rollback, migration selection, and scan are deterministic", () => {
  const parsedA = parseDeploymentEnv({ ...DEMO_ENV });
  const parsedB = parseDeploymentEnv({ ...DEMO_ENV });
  assert.deepEqual(parsedA, parsedB);

  assert.deepEqual(
    evaluateReadiness(parsedA, { ...READY_PROBE }),
    evaluateReadiness(parsedB, { ...READY_PROBE }),
  );

  const state = {
    candidateReleaseId: "abc",
    lastKnownGoodReleaseId: "def",
    activeSnapshotId: "snap",
    failure: "smoke" as const,
  };
  assert.deepEqual(planRollback({ ...state }), planRollback({ ...state }));

  const files = ["0002_b.sql", "0001_a.sql", "0001_a.sql"];
  assert.deepEqual(
    filterPendingMigrations([...files], ["0001_a.sql"]),
    filterPendingMigrations([...files], ["0001_a.sql"]),
  );
});

test("R2 (static): Node major 22 is pinned consistently and installs use npm ci", () => {
  const nodeVersionFile = repoFile(".node-version");
  assert.equal(nodeMajor(nodeVersionFile), "22", ".node-version must pin Node 22");

  const packageJson = JSON.parse(repoFile("package.json"));
  assert.equal(nodeMajor(packageJson.engines.node), "22", "engines.node must pin Node 22");

  const blueprint = parseYaml(repoFile("render.yaml"));
  for (const service of blueprint.services) {
    const nodeVersion = service.envVars.find((envVar: { key: string }) => envVar.key === "NODE_VERSION");
    assert.ok(nodeVersion, `${service.name} must pin NODE_VERSION`);
    assert.equal(nodeMajor(String(nodeVersion.value)), "22");
    assert.match(service.buildCommand, /npm ci/, `${service.name} must install with npm ci`);
  }

  const ci = repoFile(".github/workflows/ci.yml");
  assert.match(ci, /node-version-file: \.node-version/, "CI must resolve Node from .node-version");
  assert.match(ci, /npm ci/, "CI must install with npm ci");
});

test("R3 (static): CI gates promotion in order without touching the managed secrets workflow", () => {
  const ci = repoFile(".github/workflows/ci.yml");
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
    const index = ci.indexOf(command);
    assert.ok(index > cursor, `CI must run '${command}' after the previous gate`);
    cursor = index;
  }

  const dispatch = repoFile(".github/workflows/pdd-secrets-dispatch.yml");
  assert.ok(
    dispatch.startsWith("# Managed by PDD GitHub App"),
    "pdd-secrets-dispatch.yml must remain the managed original",
  );
});

test("R4 (static): Blueprint deploys web and scheduler while the Workflow limitation is explicit", () => {
  const blueprint = parseYaml(repoFile("render.yaml"));
  const types = blueprint.services.map((service: { type: string }) => service.type).sort();
  assert.deepEqual(types, ["cron", "web"], "exactly one web and one ingestion cron service");

  const branches = new Set(blueprint.services.map((service: { branch: string }) => service.branch));
  assert.equal(branches.size, 1, "Blueprint services must deploy the same branch (same release SHA)");
  assert.match(repoFile("docs/runbooks/render-deployment.md"), /Blueprints do not (?:create|manage)\s+Render\s+Workflow/i);
  assert.match(repoFile("scripts/workflow-entrypoint.ts"), /\["ingest-candidates\.ts", "research-site\.ts"\]/);

  const result = evaluateReadiness(parseDeploymentEnv({ ...DEMO_ENV }), { ...READY_PROBE });
  assert.equal(result.releaseId, "abc1234", "readiness result must record the release identifier");
});

test("R5: liveness route performs no network, database, or provider access and is uncached", async () => {
  const originalFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = (async () => {
    outboundCalls += 1;
    throw new Error("liveness must not perform network access");
  }) as typeof fetch;

  try {
    const startedAt = performance.now();
    const response = livenessGet();
    const elapsedMs = performance.now() - startedAt;
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.status, "live");
    assert.equal(outboundCalls, 0);
    assert.ok(elapsedMs < 1_000, "liveness must be bounded");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const blueprint = parseYaml(repoFile("render.yaml"));
  const web = blueprint.services.find((service: { type: string }) => service.type === "web");
  assert.equal(web.healthCheckPath, "/api/health/live", "Render health checks use the liveness route");
});

test("R6: readiness is 200 only when config and mode-required dependencies are ready, else 503 with stable codes", () => {
  const ready = evaluateReadiness(parseDeploymentEnv({ ...DEMO_ENV }), { ...READY_PROBE });
  assert.equal(ready.state, "ready");
  assert.equal(readinessHttpStatus(ready), 200);
  assert.deepEqual(ready.reasonCodes, []);

  const blocked = evaluateReadiness(parseDeploymentEnv({ ...DEMO_ENV }), {
    ...READY_PROBE,
    persistence: "unready",
  });
  assert.equal(blocked.state, "blocked");
  assert.equal(readinessHttpStatus(blocked), 503);
  assert.deepEqual(blocked.reasonCodes, ["persistence_unready"]);

  const rejected = evaluateReadiness(parseDeploymentEnv({}), { ...READY_PROBE });
  assert.equal(rejected.state, "blocked");
  assert.equal(readinessHttpStatus(rejected), 503);
  assert.ok(rejected.missingVariables.includes("APP_BASE_URL"));
});

test("R7: dependency matrix — demo requires persistence+snapshot; live requires Render/Rtrvr/MiniMax; optional providers never gate", () => {
  // Demo-only: provider outages are irrelevant.
  const demoOnly = evaluateReadiness(parseDeploymentEnv({ ...DEMO_ENV }), {
    persistence: "ready",
    storedSnapshot: "ready",
    render: "unready",
    rocketride: "unready",
    rtrvr: "unready",
    minimax: "unready",
  });
  assert.equal(demoOnly.state, "ready");
  assert.deepEqual(demoOnly.diagnostics.checkedDependencies, ["persistence", "storedSnapshot"]);

  // Demo without a stored snapshot is blocked.
  const noSnapshot = evaluateReadiness(parseDeploymentEnv({ ...DEMO_ENV }), {
    ...READY_PROBE,
    storedSnapshot: "unready",
  });
  assert.equal(noSnapshot.state, "blocked");
  assert.deepEqual(noSnapshot.reasonCodes, ["snapshot_unready"]);

  // Live research requires each core provider.
  for (const dependency of ["render", "rtrvr", "minimax"] as const) {
    const result = evaluateReadiness(parseDeploymentEnv({ ...LIVE_ENV }), {
      ...READY_PROBE,
      [dependency]: "unready",
    });
    assert.equal(result.state, "blocked", `${dependency} must gate live research`);
    assert.deepEqual(result.reasonCodes, [`${dependency}_unready`]);
  }

  const rocketRideLive = {
    ...LIVE_ENV,
    WORKFLOW_PROVIDER: "rocketride",
    RENDER_API_KEY: "",
    RENDER_WORKFLOW_TASK_SLUG: "",
    ROCKETRIDE_APIKEY: "rr-test-value",
    ROCKETRIDE_URI: "https://api.rocketride.ai",
    ROCKETRIDE_RESEARCH_PIPELINE: "pipelines/rocketride/research-site.pipe",
    ROCKETRIDE_INGEST_PIPELINE: "pipelines/rocketride/ingest-candidates.pipe",
  };
  const rocketRideBlocked = evaluateReadiness(parseDeploymentEnv(rocketRideLive), {
    ...READY_PROBE,
    render: "unready",
    rocketride: "unready",
  });
  assert.equal(rocketRideBlocked.state, "blocked");
  assert.deepEqual(rocketRideBlocked.reasonCodes, ["rocketride_unready"]);
  assert.deepEqual(rocketRideBlocked.diagnostics.checkedDependencies, ["persistence", "storedSnapshot", "rocketride", "rtrvr", "minimax"]);

  // Optional providers never gate readiness.
  const optionalDown = evaluateReadiness(parseDeploymentEnv({ ...LIVE_ENV }), {
    ...READY_PROBE,
    optional: { elevenlabs: "unready", nexla: "unready" },
  });
  assert.equal(optionalDown.state, "ready");
});

test("R8: validation table — invalid URLs and booleans, missing names, production HTTPS, and mode conflict are each rejected", () => {
  const cases: { env: Record<string, string>; code: string; variable?: string }[] = [
    { env: { ...DEMO_ENV, APP_BASE_URL: "not a url" }, code: "invalid_url", variable: "APP_BASE_URL" },
    { env: { ...DEMO_ENV, APP_BASE_URL: "ftp://example.com" }, code: "invalid_url", variable: "APP_BASE_URL" },
    { env: { ...DEMO_ENV, DEMO_MODE: "yes" }, code: "invalid_boolean", variable: "DEMO_MODE" },
    { env: { ...DEMO_ENV, LIVE_RESEARCH: "1" }, code: "invalid_boolean", variable: "LIVE_RESEARCH" },
    { env: { ...DEMO_ENV, APP_BASE_URL: "http://alpha.example" }, code: "insecure_production_url", variable: "APP_BASE_URL" },
    { env: { ...DEMO_ENV, DEMO_MODE: "false" }, code: "mode_conflict" },
    { env: { ...DEMO_ENV, DEMO_SNAPSHOT_ID: "" }, code: "missing_required_variable", variable: "DEMO_SNAPSHOT_ID" },
    { env: { ...DEMO_ENV, SUPABASE_URL: "" }, code: "missing_required_variable", variable: "SUPABASE_URL" },
    { env: { ...LIVE_ENV, RTRVR_API_KEY: "" }, code: "missing_required_variable", variable: "RTRVR_API_KEY" },
    { env: { ...LIVE_ENV, RENDER_WORKFLOW_TASK_SLUG: "researchSite" }, code: "invalid_task_slug", variable: "RENDER_WORKFLOW_TASK_SLUG" },
  ];

  for (const { env, code, variable } of cases) {
    const result = parseDeploymentEnv(env);
    assert.equal(result.status, "rejected", `${code}/${variable ?? ""} must reject`);
    assert.ok(
      result.status === "rejected" &&
        result.issues.some((issue) => issue.code === code && (variable === undefined || issue.variable === variable)),
      `expected issue ${code} for ${variable ?? "(no variable)"}`,
    );
  }

  // Local development keeps http allowed.
  const local = parseDeploymentEnv({ ...DEMO_ENV, NODE_ENV: "development", APP_BASE_URL: "http://localhost:3000" });
  assert.equal(local.status, "parsed");
});

test("R9 (negative): no secret value appears in any result, and declarative artifacts stay presence-only", () => {
  const secretValues = ["sb-secret-test-value", "rnd-test-value", "rtrvr-test-value", "mm-test-value"];

  const parsed = parseDeploymentEnv({ ...LIVE_ENV });
  const readiness = evaluateReadiness(parsed, { ...READY_PROBE, render: "unready" });
  const serialized = JSON.stringify([parsed, readiness]);
  for (const value of secretValues) {
    assert.ok(!serialized.includes(value), `secret value must never appear in results (${value})`);
  }

  // The scanner flags values and NEXT_PUBLIC_ leaks...
  const findings = scanForSecretLeaks(
    [
      { path: "bad.env", content: "RENDER_API_KEY=rnd-live-abc123" },
      { path: "bad.yaml", content: "  - key: NEXT_PUBLIC_RTRVR_API_KEY" },
    ],
    ["RENDER_API_KEY", "RTRVR_API_KEY"],
  );
  assert.deepEqual(findings.map((finding) => finding.code).sort(), [
    "public_secret_name",
    "secret_value_present",
  ]);

  // ...and the real artifacts are clean.
  const clean = scanForSecretLeaks(
    [
      { path: ".env.example", content: repoFile(".env.example") },
      { path: "render.yaml", content: repoFile("render.yaml") },
    ],
    ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "RENDER_API_KEY", "ROCKETRIDE_APIKEY", "RTRVR_API_KEY", "MINIMAX_API_KEY", "WEBHOOK_SIGNING_SECRET"],
  );
  assert.deepEqual(clean, []);
});

function memoryExecutor(failOn?: string): { executor: MigrationExecutor; applied: string[]; journal: string[] } {
  const journal: string[] = [];
  const applied: string[] = [];
  const executor: MigrationExecutor = {
    async journal() {
      return [...journal];
    },
    async apply(file) {
      if (file === failOn) throw new Error("fixture failure");
      applied.push(file);
    },
    async record(file) {
      journal.push(file);
    },
  };
  return { executor, applied, journal };
}

test("R10: pending migrations run exactly once in lexical order; a failure blocks promotion; reruns are idempotent", async () => {
  const files = new Map([
    ["0002_second.sql", "-- 2"],
    ["0001_first.sql", "-- 1"],
  ]);

  const { executor, applied, journal } = memoryExecutor();
  const first = await runMigrations(files, executor);
  assert.equal(first.status, "applied");
  assert.deepEqual(applied, ["0001_first.sql", "0002_second.sql"]);

  const second = await runMigrations(files, executor);
  assert.equal(second.status, "noop", "second run must be an idempotent no-op");
  assert.deepEqual(journal, ["0001_first.sql", "0002_second.sql"]);

  const failing = memoryExecutor("0002_second.sql");
  const failed = await runMigrations(files, failing.executor);
  assert.equal(failed.status, "failed", "a migration failure must block promotion");
  assert.equal(failed.failedFile, "0002_second.sql");

  const blueprint = parseYaml(repoFile("render.yaml"));
  const web = blueprint.services.find((service: { type: string }) => service.type === "web");
  assert.match(web.preDeployCommand, /db:migrate/, "migration runs once before promotion via preDeployCommand");
});

test("R11 (negative): down migrations are never selected and rollback never schedules a migration", async () => {
  const selection = filterPendingMigrations(
    ["0001_first.sql", "0001_first.down.sql", "0002_second.down.sql"],
    [],
  );
  assert.deepEqual(selection.pending, ["0001_first.sql"]);
  assert.deepEqual(selection.refusedDownMigrations, ["0001_first.down.sql", "0002_second.down.sql"]);

  const { executor, applied } = memoryExecutor();
  await runMigrations(new Map([["0001_first.down.sql", "-- down"]]), executor);
  assert.deepEqual(applied, [], "a down migration must never execute automatically");

  const plan = planRollback({
    candidateReleaseId: "bad",
    lastKnownGoodReleaseId: "good",
    activeSnapshotId: "snap",
    failure: "migration",
  });
  assert.equal(plan.runsDatabaseMigration, false);
});

test("R12: smoke checks are bounded to liveness and readiness and a failure blocks acceptance", async () => {
  const requested: string[] = [];
  const okFetch = (async (input: URL | RequestInfo) => {
    requested.push(new URL(String(input)).pathname);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const pass = await runSmokeChecks("https://alpha.example", okFetch, 100);
  assert.equal(pass.ok, true);
  assert.deepEqual(requested, ["/api/health/live", "/api/health/ready"]);
  assert.equal(pass.rollback, undefined);

  const failFetch = (async (input: URL | RequestInfo) => {
    const pathname = new URL(String(input)).pathname;
    return new Response("{}", { status: pathname === "/api/health/ready" ? 503 : 200 });
  }) as typeof fetch;

  const fail = await runSmokeChecks("https://alpha.example", failFetch, 100);
  assert.equal(fail.ok, false, "a smoke failure must block acceptance");
  assert.ok(fail.rollback, "a smoke failure must produce a rollback plan");
});

test("R13: rollback targets the recorded last known good release, else holds, always preserving the active snapshot", () => {
  for (const failure of ["build", "migration", "readiness", "smoke"] as const) {
    const plan = planRollback({
      candidateReleaseId: "cand",
      lastKnownGoodReleaseId: "lkg",
      activeSnapshotId: "snap-1",
      failure,
    });
    assert.equal(plan.action, "rollback", `${failure} failure must roll back`);
    assert.equal(plan.targetReleaseId, "lkg");
    assert.equal(plan.preservesActiveSnapshot, true);
    assert.equal(plan.preservedActiveSnapshotId, "snap-1");
  }

  const hold = planRollback({
    candidateReleaseId: "cand",
    lastKnownGoodReleaseId: null,
    activeSnapshotId: "snap-1",
    failure: "smoke",
  });
  assert.equal(hold.action, "hold", "no recorded release means hold, never guess");
  assert.equal(hold.targetReleaseId, null);
  assert.equal(hold.preservedActiveSnapshotId, "snap-1");

  const promote = planRollback({
    candidateReleaseId: "cand",
    lastKnownGoodReleaseId: "lkg",
    activeSnapshotId: "snap-1",
    failure: null,
  });
  assert.equal(promote.action, "promote");
  assert.equal(promote.targetReleaseId, "cand");
});

test("R14: every rollback plan preserves existing workflow runs", () => {
  for (const failure of ["build", "migration", "readiness", "smoke", null] as const) {
    const plan = planRollback({
      candidateReleaseId: "cand",
      lastKnownGoodReleaseId: "lkg",
      activeSnapshotId: null,
      failure,
    });
    assert.equal(plan.preservesWorkflowRuns, true);
  }
});

test("R15 (negative): /api/integrations is never the health path and readiness carries no provider diagnostics", () => {
  const blueprintRaw = repoFile("render.yaml");
  assert.ok(!blueprintRaw.includes("/api/integrations"), "render.yaml must not reference /api/integrations");

  const result = evaluateReadiness(parseDeploymentEnv({ ...LIVE_ENV }), {
    ...READY_PROBE,
    minimax: "unready",
  });
  const keys = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["latency", "message", "http", "supabase.co"]) {
    assert.ok(!keys.includes(forbidden), `readiness must not embed provider diagnostics (${forbidden})`);
  }
  assert.deepEqual(result.reasonCodes, ["minimax_unready"]);
});

test("R16 (negative, static): no alternate hosting target and no provisioning instructions in artifacts", () => {
  for (const forbidden of ["vercel.json", "netlify.toml", "fly.toml", "Procfile", "Dockerfile", "app.yaml"]) {
    assert.ok(!existsSync(path.join(ROOT, forbidden)), `${forbidden} must not exist`);
  }

  // The full static gate over the real artifacts passes clean.
  assert.deepEqual(runStaticChecks(ROOT), []);
});
