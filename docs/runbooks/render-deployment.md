# Runbook — Render Alpha deployment

Render is the exclusive Alpha host. The Blueprint (`render.yaml`) deploys
`sitevelocity-web` (Next.js) and `sitevelocity-ingestion-schedule` (daily cron)
from the same repository, branch, and release SHA. Blueprints do not manage Render
Workflow services, so `sitevelocity-workflow` is created once through the Render
Workflow setup flow and configured to use this repository, `master`, and
`npm run workflow:start`. Contract:
`prompts/modules/render-alpha-deployment_typescript.prompt` (rules R1–R16), verified by
`tests/contracts/render-alpha-deployment.contract.test.ts`.

## Current external state

The connected Render workspace already contains a `SiteVelocity` production web
service on `master`. Its latest deployment was canceled before build because the
workspace had exhausted its build-pipeline minutes. A workspace owner must restore
build capacity before triggering another deploy; retrying without that account
change will fail before repository code is evaluated.

## Prerequisites (human actions — never automated)

1. Render account with the team's credits claimed; repository connected.
2. Secrets entered in the Render dashboard environment for the web, cron, and Workflow services. Names match
   `.env.example`; values never enter the repo, prompts, logs, or `NEXT_PUBLIC_` vars.
3. A stored Research Snapshot seeded and its id set as `DEMO_SNAPSHOT_ID`
   (demo mode refuses to become ready without it — stored snapshots, never fabricated data).
4. `LAST_KNOWN_GOOD_RELEASE_ID` set to the currently accepted release SHA (blank on first deploy).
5. A Render Workflow created from this repository and `master`, with both registered
   tasks visible: `researchSite` and `ingestCandidates`. Set
   `RENDER_WORKFLOW_TASK_SLUG` to the full `workflow/researchSite` task slug; the
   ingestion task is derived as its sibling. This step is separate because Render
   Blueprints do not create or manage Workflow services.

## Release procedure

1. Merge to `master` only through a PR with green CI
   (`.github/workflows/ci.yml`: typecheck → lint → unit → contracts → build → audit).
2. Record the release SHA: `git rev-parse HEAD`. Web and cron deploy this same SHA;
   release the Workflow from that same commit before enabling live commands.
3. Render applies the Blueprint. `preDeployCommand: npm run db:migrate` runs the
   idempotent migration command exactly once before promotion; a migration failure
   blocks the release (no promotion happens).
4. Render health-checks the web service at `/api/health/live` (liveness only — no
   database, provider, or network access). `/api/integrations` is a diagnostics page,
   never the platform health path.
5. After promotion, run bounded smoke checks from any machine:

   ```
   npm run deployment:check -- --target=render --smoke --base-url=https://<app-host>
   ```

   This verifies liveness and readiness; readiness (`/api/health/ready`) returns 200
   only when configuration parses and the mode-required dependencies are ready —
   all modes: Supabase persistence; demo mode additionally requires a stored snapshot;
   live research additionally requires Render, Rtrvr, and MiniMax.
   Optional providers never gate readiness.
6. On success, update `LAST_KNOWN_GOOD_RELEASE_ID` in the Render environment to the
   new release SHA and record the release in the PDD evidence manifest.
7. On any failure (build, migration, readiness, smoke): do not accept the release —
   follow `render-rollback.md`.

The cron uses a date-scoped idempotency key and dispatches `ingestCandidates` once per
day. A retry or duplicate cron invocation reuses the existing durable command.

## Verification commands (recorded)

```
npm ci
npm run typecheck
npm run lint
npm test
npm run test:contracts -- render-alpha-deployment
npm run build
npm audit --audit-level=high
npm run deployment:check -- --target=render
```

## Mode matrix

| DEMO_MODE | LIVE_RESEARCH | State |
| --- | --- | --- |
| true | false | Alpha default: serves stored snapshots; requires persistence + snapshot |
| true | true | Demo + live research; requires all of the above plus Render/Rtrvr/MiniMax |
| false | true | Live-only; requires Supabase + Render/Rtrvr/MiniMax |
| false | false | Rejected (`mode_conflict`) — never deployable |
