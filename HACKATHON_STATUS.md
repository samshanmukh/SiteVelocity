# HACKATHON_STATUS

Build Fast. Launch Loud. — Prompt Driven Development Hackathon
Saturday, July 25, 2026 · 9:00 AM–9:00 PM · 555 University Ave, Palo Alto

## Locked scope

- Market: San José, CA / Santa Clara County
- Thesis: multifamily & mixed-use residential redevelopment, 0.5–10 acres, prefer 100+ units
- Hero workflow: SEARCH → DISCOVER → RESEARCH → VERIFY → NEXT STEP
- Funnel: 50–100 raw HCD/DGS records → ~15 candidates → top 5 researched → 3 hero sites → 1 polished dossier
- Sponsor stack (runtime): Render Workflows → Rtrvr.ai → MiniMax. PDD as methodology. ElevenLabs only after all core criteria pass.
- Not integrating today: Cerebras, Band, Nexla, Respan, TokenRouter, mem0, RocketRide, Featherless, Tencent EdgeOne.

Other delegation segments (Foundation & QA, Government Ingestion, Candidate Pipeline,
Research Providers, Evidence & Snapshots, Decision Layer, App UI, Landing Page) are
tracked on their own `pdd/*` branches — see the team delegation doc.

## Segment 9 — Deployment (this branch: `pdd/deployment`, owner: Chris/dogsleddev)

### Working

- `prompts/modules/render-alpha-deployment_typescript.prompt` — 16 contract rules
  (R1–R16), passes `pdd contracts check --strict` clean
- `lib/config/deployment-env.ts` — deterministic environment parsing, readiness
  evaluation, rollback planning, migration selection, secret-leak scanning
- `tests/contracts/render-alpha-deployment.contract.test.ts` — 16/16 passing,
  one test per rule
- `render.yaml` — single Blueprint, one web + one worker service, same branch/release
  SHA, Node 22 pinned, `preDeployCommand: npm run db:migrate`,
  `healthCheckPath: /api/health/live`, all secrets presence-only (`sync: false`)
- `app/api/health/live/route.ts` — liveness: no DB/provider/network access, no-store
- `app/api/health/ready/route.ts` + `lib/config/deployment-probes.ts` — readiness:
  200 only when config + mode-required dependencies are ready, else 503 with stable
  reason codes (no secret values or provider diagnostics leak)
- `scripts/db-migrate.ts` — idempotent `npm run db:migrate`; never runs `*.down.*`
  files; a failure blocks promotion
- `scripts/workflow-entrypoint.ts` — `npm run workflow:start`, graceful shutdown
- `scripts/deployment-check.ts` — `npm run deployment:check -- --target=render
  [--static|--smoke --base-url=...]`; static mode statically re-verifies render.yaml,
  runtime pin, CI order, single hosting target, and secret hygiene
- `.github/workflows/ci.yml` — typecheck → lint → unit → contract tests → build →
  `npm audit --audit-level=high`, in that order; does not touch the PDD-managed
  `pdd-secrets-dispatch.yml`
- `docs/runbooks/render-deployment.md`, `docs/runbooks/render-rollback.md` — release
  and rollback procedures; rollback never runs a down migration and always preserves
  the active snapshot and in-flight workflow runs
- `pdd/evidence/render-alpha-deployment/manifest.json` — accepted evidence manifest
- Definition-of-Done green: `npm run typecheck`, `npm run lint`, `npm test` (8/8),
  `npm run test:contracts` (16/16 for this module), `npm run build`,
  `npm audit --audit-level=high` (0 vulnerabilities)

### Blocked — needs a human with Render/GitHub access

- Render account + Blueprint apply (creates the two services from `render.yaml`)
- Provider secrets entered directly in the Render dashboard (never through PDD or
  this repo)
- A stored Research Snapshot's id set as `DEMO_SNAPSHOT_ID` once Segment 5 lands
  fixture snapshots
- First `LAST_KNOWN_GOOD_RELEASE_ID` recorded after the first accepted release
- Actual deploy + smoke run: `npm run deployment:check -- --target=render --smoke
  --base-url=https://<deployed-host>`

### Non-responsibilities (explicitly out of scope for this segment)

- No account/database/domain/certificate/secret provisioning
- No migration SQL or schema design
- No application, provider, workflow, scoring, or UI implementation
