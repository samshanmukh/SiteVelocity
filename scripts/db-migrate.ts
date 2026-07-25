// Idempotent migration runner: `npm run db:migrate` (render-alpha-deployment R10, R11).
// Applies pending SQL files from db/migrations in lexical order, exactly once each.
// Down migrations are never selected. A failure exits non-zero, which blocks
// promotion (render.yaml runs this as preDeployCommand).
// This runner owns bookkeeping only; migration SQL is authored by humans.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { filterPendingMigrations } from "../lib/config/deployment-env";

export interface MigrationRunResult {
  status: "noop" | "applied" | "failed";
  applied: string[];
  refusedDownMigrations: string[];
  failedFile?: string;
}

export interface MigrationExecutor {
  journal(): Promise<string[]>;
  apply(file: string, sql: string): Promise<void>;
  record(file: string): Promise<void>;
}

export async function runMigrations(
  files: Map<string, string>,
  executor: MigrationExecutor,
): Promise<MigrationRunResult> {
  const journal = await executor.journal();
  const selection = filterPendingMigrations([...files.keys()], journal);

  if (selection.pending.length === 0) {
    return { status: "noop", applied: [], refusedDownMigrations: selection.refusedDownMigrations };
  }

  const applied: string[] = [];
  for (const file of selection.pending) {
    try {
      await executor.apply(file, files.get(file) ?? "");
      await executor.record(file);
      applied.push(file);
    } catch {
      return {
        status: "failed",
        applied,
        refusedDownMigrations: selection.refusedDownMigrations,
        failedFile: file,
      };
    }
  }

  return { status: "applied", applied, refusedDownMigrations: selection.refusedDownMigrations };
}

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

function loadMigrationFiles(): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(MIGRATIONS_DIR)) return files;
  for (const name of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    files.set(name, readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));
  }
  return files;
}

async function createPostgresExecutor(databaseUrl: string): Promise<MigrationExecutor> {
  // Non-literal specifier: the driver is an optional runtime dependency that
  // only needs to exist once the first human-authored migration lands.
  const driverName = "pg";
  let pg;
  try {
    pg = await import(driverName);
  } catch {
    throw new Error(
      "Migration files exist but the 'pg' driver is not installed. Add it with: npm install pg",
    );
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (file text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  return {
    async journal() {
      const result = await client.query("SELECT file FROM schema_migrations ORDER BY file");
      return result.rows.map((row: { file: string }) => row.file);
    },
    async apply(_file, sql) {
      await client.query(sql);
    },
    async record(file) {
      await client.query("INSERT INTO schema_migrations (file) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
    },
  };
}

async function main(): Promise<void> {
  const files = loadMigrationFiles();

  if (files.size === 0) {
    console.log(JSON.stringify({ status: "noop", applied: [], refusedDownMigrations: [] }));
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("db:migrate: migration files exist but DATABASE_URL is not set; blocking promotion.");
    process.exitCode = 1;
    return;
  }

  const executor = await createPostgresExecutor(databaseUrl);
  const result = await runMigrations(files, executor);
  console.log(JSON.stringify(result));
  if (result.status === "failed") process.exitCode = 1;
}

const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/db-migrate.ts");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(`db:migrate: ${error instanceof Error ? error.message : "unknown failure"}`);
    process.exitCode = 1;
  });
}
