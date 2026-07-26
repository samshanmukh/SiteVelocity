# Runbook — Render Alpha rollback

Rollback restores the last known good **application** release. It never touches the
database and never cancels work. Contract rules R11, R13, R14
(`prompts/modules/render-alpha-deployment_typescript.prompt`).

## Invariants

- The database is **not** rolled back. Down migrations are never run automatically —
  the migration runner refuses files matching `*.down.*` — and application rollback
  does not schedule any migration.
- The active stored snapshot (`DEMO_SNAPSHOT_ID`) is preserved; the demo keeps
  serving the last accepted snapshot.
- Existing workflow runs are preserved: the separately managed Workflow shuts down
  gracefully on release and rollback never duplicates or silently cancels queued or
  in-flight work. The cron command is date-idempotent.

## When to roll back

Any of: production build failure, `db:migrate` failure in pre-deploy, readiness stuck
at 503 after deploy, or smoke-check failure
(`npm run deployment:check -- --target=render --smoke --base-url=...` exits 1 and
prints the rollback plan).

Build and migration failures block promotion automatically — the previous release keeps
serving; no action needed beyond diagnosis. Readiness/smoke failures after promotion
require the manual steps below.

## Procedure

1. Read `LAST_KNOWN_GOOD_RELEASE_ID` from the Render environment. If it is blank
   (first deploy), **hold**: fix forward, never guess a target.
2. In the Render dashboard, redeploy `sitevelocity-web` and
   `sitevelocity-ingestion-schedule` at that commit, then release the separately
   managed `sitevelocity-workflow` from the same commit. All three must land on the
   same SHA.
3. Do **not** change `DEMO_SNAPSHOT_ID` and do not run any migration as part of the
   rollback.
4. Verify: `/api/health/live` returns 200, then
   `npm run deployment:check -- --target=render --smoke --base-url=https://<app-host>`.
5. Leave `LAST_KNOWN_GOOD_RELEASE_ID` unchanged (it already names the release now
   serving). Record the failed candidate SHA and the failure reason in the PDD
   evidence manifest as a non-accepted attempt.

## Schema-change caveat

If a failed release had already applied a new migration, the last known good release
must tolerate the newer schema (expand-and-contract migrations only). If it cannot,
this is a fix-forward situation — escalate to the team rather than hand-editing the
database.
