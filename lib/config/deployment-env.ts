import { normalizeSupabaseProjectUrl } from "./supabase-url";

// Deployment-readiness contract for the Render Alpha release.
// Source of truth: prompts/modules/render-alpha-deployment_typescript.prompt (R1-R16).
// Pure and deterministic: no clock, randomness, network, or filesystem access (R1).

export type ReasonCode =
  | "missing_required_variable"
  | "invalid_url"
  | "invalid_boolean"
  | "invalid_task_slug"
  | "invalid_uuid"
  | "invalid_persistence_backend"
  | "insecure_production_url"
  | "mode_conflict"
  | "persistence_unready"
  | "snapshot_unready"
  | "render_unready"
  | "rtrvr_unready"
  | "minimax_unready";

export interface DeploymentEnvIssue {
  code: ReasonCode;
  variable?: string; // name only, never a value (R9)
}

export interface DeploymentEnv {
  appBaseUrl: string;
  demoMode: boolean;
  liveResearch: boolean;
  nodeEnv: "production" | "development" | "test";
  releaseId: string | null;
  demoSnapshotId: string | null;
  lastKnownGoodReleaseId: string | null;
  presentSecretNames: string[];
}

export type DeploymentEnvParseResult =
  | { status: "parsed"; env: DeploymentEnv }
  | { status: "rejected"; issues: DeploymentEnvIssue[] };

export type DependencyState = "ready" | "unready" | "skipped";

export interface DependencyProbe {
  persistence: DependencyState;
  storedSnapshot: DependencyState;
  render: DependencyState;
  rtrvr: DependencyState;
  minimax: DependencyState;
  optional?: Record<string, DependencyState>; // never gates readiness (R7)
}

export interface DeploymentReadinessResult {
  state: "ready" | "blocked";
  reasonCodes: ReasonCode[];
  missingVariables: string[];
  releaseId: string | null;
  diagnostics: {
    demoMode: boolean | null;
    liveResearch: boolean | null;
    checkedDependencies: string[];
  };
}

export interface ReleaseState {
  candidateReleaseId: string;
  lastKnownGoodReleaseId: string | null;
  activeSnapshotId: string | null;
  failure: "build" | "migration" | "readiness" | "smoke" | null;
}

export interface RollbackPlan {
  action: "promote" | "rollback" | "hold";
  targetReleaseId: string | null;
  runsDatabaseMigration: false;
  preservesActiveSnapshot: true;
  preservedActiveSnapshotId: string | null;
  preservesWorkflowRuns: true;
}

export interface MigrationSelection {
  pending: string[];
  refusedDownMigrations: string[];
}

export interface ScannedFile {
  path: string;
  content: string;
}

export interface SecretScanFinding {
  file: string;
  code: "secret_value_present" | "public_secret_name";
  variable: string; // name only
}

const SUPABASE_SERVER_KEY_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const LIVE_RESEARCH_SECRET_NAMES = [
  "RENDER_API_KEY",
  "RENDER_WORKFLOW_TASK_SLUG",
  "RTRVR_API_KEY",
  "MINIMAX_API_KEY",
] as const;

const PRESENCE_ONLY_NAMES: readonly string[] = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  ...SUPABASE_SERVER_KEY_NAMES,
  ...LIVE_RESEARCH_SECRET_NAMES,
];

function present(source: Record<string, string | undefined>, name: string): boolean {
  const value = source[name];
  return typeof value === "string" && value.trim() !== "";
}

function parseBoolean(value: string | undefined): boolean | "invalid" | "missing" {
  if (value === undefined || value.trim() === "") return "missing";
  if (value === "true") return true;
  if (value === "false") return false;
  return "invalid";
}

function parseAbsoluteHttpUrl(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
}

function nonBlankOrNull(value: string | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function parseDeploymentEnv(
  source: Record<string, string | undefined>,
): DeploymentEnvParseResult {
  const issues: DeploymentEnvIssue[] = [];

  const nodeEnvRaw = source.NODE_ENV;
  const nodeEnv: DeploymentEnv["nodeEnv"] =
    nodeEnvRaw === "production" || nodeEnvRaw === "test" ? nodeEnvRaw : "development";

  const appBaseUrlRaw = source.APP_BASE_URL;
  let appBaseUrl: string | null = null;
  if (appBaseUrlRaw === undefined || appBaseUrlRaw.trim() === "") {
    issues.push({ code: "missing_required_variable", variable: "APP_BASE_URL" });
  } else {
    const parsed = parseAbsoluteHttpUrl(appBaseUrlRaw.trim());
    if (parsed === null) {
      issues.push({ code: "invalid_url", variable: "APP_BASE_URL" });
    } else if (nodeEnv === "production" && parsed.protocol !== "https:") {
      issues.push({ code: "insecure_production_url", variable: "APP_BASE_URL" });
    } else {
      appBaseUrl = parsed.toString();
    }
  }

  const demoMode = parseBoolean(source.DEMO_MODE);
  if (demoMode === "missing") {
    issues.push({ code: "missing_required_variable", variable: "DEMO_MODE" });
  } else if (demoMode === "invalid") {
    issues.push({ code: "invalid_boolean", variable: "DEMO_MODE" });
  }

  const liveResearch = parseBoolean(source.LIVE_RESEARCH);
  if (liveResearch === "missing") {
    issues.push({ code: "missing_required_variable", variable: "LIVE_RESEARCH" });
  } else if (liveResearch === "invalid") {
    issues.push({ code: "invalid_boolean", variable: "LIVE_RESEARCH" });
  }

  if (demoMode === false && liveResearch === false) {
    issues.push({ code: "mode_conflict" });
  }

  if (demoMode === true) {
    if (!present(source, "DEMO_SNAPSHOT_ID")) {
      issues.push({ code: "missing_required_variable", variable: "DEMO_SNAPSHOT_ID" });
    }
    if (!present(source, "SUPABASE_URL")) {
      issues.push({ code: "missing_required_variable", variable: "SUPABASE_URL" });
    } else {
      try { normalizeSupabaseProjectUrl(source.SUPABASE_URL as string); } catch { issues.push({ code: "invalid_url", variable: "SUPABASE_URL" }); }
    }
    if (!SUPABASE_SERVER_KEY_NAMES.some((name) => present(source, name))) {
      issues.push({ code: "missing_required_variable", variable: "SUPABASE_SECRET_KEY" });
    }
  }

  if (demoMode === false) {
    if (!present(source, "SUPABASE_URL")) {
      issues.push({ code: "missing_required_variable", variable: "SUPABASE_URL" });
    } else {
      try { normalizeSupabaseProjectUrl(source.SUPABASE_URL as string); } catch { issues.push({ code: "invalid_url", variable: "SUPABASE_URL" }); }
    }
    if (!SUPABASE_SERVER_KEY_NAMES.some((name) => present(source, name))) {
      issues.push({ code: "missing_required_variable", variable: "SUPABASE_SECRET_KEY" });
    }
    if (!present(source, "SUPABASE_PUBLISHABLE_KEY")) {
      issues.push({ code: "missing_required_variable", variable: "SUPABASE_PUBLISHABLE_KEY" });
    }
    if (!present(source, "SITEVELOCITY_ORGANIZATION_ID")) {
      issues.push({ code: "missing_required_variable", variable: "SITEVELOCITY_ORGANIZATION_ID" });
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source.SITEVELOCITY_ORGANIZATION_ID as string)) {
      issues.push({ code: "invalid_uuid", variable: "SITEVELOCITY_ORGANIZATION_ID" });
    }
    if (source.PERSISTENCE_BACKEND !== "supabase") {
      issues.push({ code: "invalid_persistence_backend", variable: "PERSISTENCE_BACKEND" });
    }
  }

  if (liveResearch === true) {
    for (const name of LIVE_RESEARCH_SECRET_NAMES) {
      if (!present(source, name)) {
        issues.push({ code: "missing_required_variable", variable: name });
      }
    }
    if (
      present(source, "RENDER_WORKFLOW_TASK_SLUG")
      && !/^[^/\s]+\/[^/\s]+$/.test(source.RENDER_WORKFLOW_TASK_SLUG as string)
    ) {
      issues.push({ code: "invalid_task_slug", variable: "RENDER_WORKFLOW_TASK_SLUG" });
    }
  }

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }

  return {
    status: "parsed",
    env: {
      appBaseUrl: appBaseUrl as string,
      demoMode: demoMode as boolean,
      liveResearch: liveResearch as boolean,
      nodeEnv,
      releaseId: nonBlankOrNull(source.RELEASE_SHA) ?? nonBlankOrNull(source.RENDER_GIT_COMMIT),
      demoSnapshotId: nonBlankOrNull(source.DEMO_SNAPSHOT_ID),
      lastKnownGoodReleaseId: nonBlankOrNull(source.LAST_KNOWN_GOOD_RELEASE_ID),
      presentSecretNames: PRESENCE_ONLY_NAMES.filter((name) => present(source, name)),
    },
  };
}

export function evaluateReadiness(
  parsed: DeploymentEnvParseResult,
  probe: DependencyProbe,
): DeploymentReadinessResult {
  if (parsed.status === "rejected") {
    const reasonCodes = [...new Set(parsed.issues.map((issue) => issue.code))].sort();
    const missingVariables = [
      ...new Set(
        parsed.issues
          .filter((issue) => issue.code === "missing_required_variable" && issue.variable)
          .map((issue) => issue.variable as string),
      ),
    ].sort();
    return {
      state: "blocked",
      reasonCodes,
      missingVariables,
      releaseId: null,
      diagnostics: { demoMode: null, liveResearch: null, checkedDependencies: [] },
    };
  }

  const { env } = parsed;
  const reasonCodes = new Set<ReasonCode>();
  const checkedDependencies: string[] = [];

  checkedDependencies.push("persistence");
  if (probe.persistence !== "ready") reasonCodes.add("persistence_unready");

  if (env.demoMode) {
    checkedDependencies.push("storedSnapshot");
    if (probe.storedSnapshot !== "ready") reasonCodes.add("snapshot_unready");
  }

  if (env.liveResearch) {
    checkedDependencies.push("render", "rtrvr", "minimax");
    if (probe.render !== "ready") reasonCodes.add("render_unready");
    if (probe.rtrvr !== "ready") reasonCodes.add("rtrvr_unready");
    if (probe.minimax !== "ready") reasonCodes.add("minimax_unready");
  }

  // Optional providers are recorded nowhere and never gate readiness (R7).

  return {
    state: reasonCodes.size === 0 ? "ready" : "blocked",
    reasonCodes: [...reasonCodes].sort(),
    missingVariables: [],
    releaseId: env.releaseId,
    diagnostics: {
      demoMode: env.demoMode,
      liveResearch: env.liveResearch,
      checkedDependencies,
    },
  };
}

export function readinessHttpStatus(result: DeploymentReadinessResult): 200 | 503 {
  return result.state === "ready" ? 200 : 503;
}

export function planRollback(state: ReleaseState): RollbackPlan {
  const base = {
    runsDatabaseMigration: false as const, // never down-migrate (R11)
    preservesActiveSnapshot: true as const, // (R13)
    preservedActiveSnapshotId: state.activeSnapshotId,
    preservesWorkflowRuns: true as const, // (R14)
  };

  if (state.failure === null) {
    return { action: "promote", targetReleaseId: state.candidateReleaseId, ...base };
  }
  if (state.lastKnownGoodReleaseId !== null) {
    return { action: "rollback", targetReleaseId: state.lastKnownGoodReleaseId, ...base };
  }
  return { action: "hold", targetReleaseId: null, ...base };
}

const DOWN_MIGRATION_MARKER = /\.down\.[^.]+$/;

export function filterPendingMigrations(files: string[], journal: string[]): MigrationSelection {
  const applied = new Set(journal);
  const unique = [...new Set(files)].sort();
  const refusedDownMigrations = unique.filter((file) => DOWN_MIGRATION_MARKER.test(file));
  const pending = unique.filter(
    (file) => !DOWN_MIGRATION_MARKER.test(file) && !applied.has(file),
  );
  return { pending, refusedDownMigrations };
}

export function scanForSecretLeaks(
  files: ScannedFile[],
  secretNames: string[],
): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];
  for (const file of files) {
    for (const line of file.content.split(/\r?\n/)) {
      for (const name of secretNames) {
        // A secret name assigned a non-blank value in a declarative artifact (R9).
        const assignment = line.match(
          new RegExp(`(?:^|\\s)${name}\\s*[=:]\\s*(\\S.*)$`),
        );
        if (assignment && assignment[1].trim() !== "" && assignment[1].trim() !== '""') {
          findings.push({ file: file.path, code: "secret_value_present", variable: name });
        }
      }
      const publicVar = line.match(/NEXT_PUBLIC_[A-Z0-9_]+/g);
      for (const match of publicVar ?? []) {
        if (secretNames.some((name) => match.includes(name))) {
          findings.push({ file: file.path, code: "public_secret_name", variable: match });
        }
      }
    }
  }
  return findings;
}
