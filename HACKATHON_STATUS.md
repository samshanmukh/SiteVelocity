# HACKATHON_STATUS

Build Fast. Launch Loud. — Prompt Driven Development Hackathon
Saturday, July 25, 2026 · 9:00 AM–9:00 PM · 555 University Ave, Palo Alto

## Event facts (fill in at/after check-in)

- Official submission deadline: **TBD — get from organizers**
- Demo order / demo start time: **TBD — get from organizers**
- Pre-existing scaffolds/fixtures permitted: **TBD — confirm with organizers**
- Render credits claimed: TBD · Rtrvr credits ($30/person) claimed: TBD · MiniMax credits claimed: TBD

## Locked scope

- Market: San José, CA / Santa Clara County
- Thesis: multifamily & mixed-use residential redevelopment, 0.5–10 acres, prefer 100+ units
- Hero workflow: SEARCH → DISCOVER → RESEARCH → VERIFY → NEXT STEP
- Funnel: 50–100 raw HCD/DGS records → ~15 candidates → top 5 researched → 3 hero sites → 1 polished dossier
- Sponsor stack (runtime): Render Workflows → Rtrvr.ai → MiniMax, with Nexla managed-ingestion support, ElevenLabs Scout voice, and Mem0 preference memory. PDD is the implementation methodology.
- Optional/not selected for the core runtime: Cerebras, Band, TokenRouter, RocketRide, Featherless, and Tencent EdgeOne. Respan tracing awaits the required auto-vs-structured instrumentation choice.

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
- `render.yaml` — single Blueprint, one web + one ingestion cron service, same branch/release
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

### Deployment activation blockers — verified July 25, 2026

- The existing Render `SiteVelocity` production web service is connected to
  `master`, but its latest auto-deploy was canceled before the build because the
  workspace exhausted its build-pipeline minutes. A workspace owner must upgrade
  the plan or increase the build spend limit before another deploy can run.
- The Supabase endpoint and server credential are reachable, but every
  SiteVelocity application table is absent remotely. The signed-in Supabase
  Dashboard account explicitly lacks access to the configured project; the owner
  must grant access or approve a replacement project before migrations are pushed.
- The Mem0 CLI and local app are authenticated, and the Scout preference retrieval
  endpoint is live. The credential still needs to be added to the Render secret
  store for production; never print it in logs.
- Respan is configured, but code instrumentation intentionally awaits the required
  selection between automatic and structured tracing.
- After the blockers clear: apply migrations, bootstrap the first tenant, release
  both Render Workflow tasks, deploy the Blueprint, set the last-known-good release,
  and run `npm run deployment:check -- --target=render --smoke --base-url=https://sitevelocity.onrender.com`.

### Non-responsibilities (explicitly out of scope for this segment)

- No account/database/domain/certificate/secret provisioning
- No migration SQL or schema design
- No application, provider, workflow, scoring, or UI implementation

## Status (updated ~2:45 PM by Chris/Claude on branch `chris/alpha-loop`)

### Working

- Full app shell per the design handoff: Command Center, persisted Scout buy box, live Mapbox opportunity map, Sites, evidence-backed property dossier, feasibility studio, development events, watchlists, Next Steps, Research Runs, Data Sources, Agent Settings, Integrations, and Team
- **Real candidate ingestion** (`npm run ingest`): City of San José AB2011Parcels2024 (official ArcGIS service, 87 vacant parcels) → County of Santa Clara parcel enrichment (address/geometry/acreage) → candidate-normalizer (PDD contract) → buy-box filter → deterministic Strategy Fit ranking → **15 shortlisted candidates with full provenance** in `data/candidates.json`
- **Real research loop** (`npm run research`): per-site Land Use (SJ Zoning + General Plan 2040 layers), Site Risk (FEMA NFHL flood + city constraint screens), Verifier rules, deterministic Readiness + Evidence Confidence scores, Next Best Action, immutable Research Snapshot — **top 5 sites researched and persisted** under `data/sites/`
- Six visible agents with persisted statuses; snapshots honestly `partial` until live providers configured
- API: GET /api/candidates, GET /api/sites/:id, POST /api/sites/:id/research, GET /api/integrations
- Render Workflows task body ready: `workflows/research-site.ts` (same pipeline as API/CLI)
- Live Rtrvr+MiniMax Development History path coded (`lib/research/live-history.ts`) — activates when keys land
- ElevenLabs microphone transcription and answer playback are wired into Ask Scout; Mapbox uses the configured public token with a schematic fallback
- Scout preferences persist as immutable tenant projections and sync/retrieve through Mem0 when configured; they remain advisory and separate from property evidence
- PDD cycle demonstrable: prompt contract → 13 contract tests mapped R1–R12/P1–P8 → generated implementation → **accepted evidence manifest with real digests** (`pdd/evidence/candidate-normalizer/`)
- `npm run typecheck` clean; the integrated test count is verified before deployment
- **PDD Segment 2 (Government Ingestion) complete** on `pdd/government-adapters`: 5 prompt contracts (URL policy, source-record envelope, ArcGIS adapter, Socrata adapter, San José jurisdiction adapter), 84 rules, 130 contract tests, all three Definition-of-Done gates green — see `docs/PDD_SEGMENT_2_GOVERNMENT_INGESTION.md`
- Security: fail-closed https-only SSRF control (`lib/security/url-policy.ts`) — private-destination check precedes the allowlist, IPv6 unique-local/link-local covered, hostnames normalized so a trailing-dot form cannot evade it, refusals never echo path/query/credentials; untrusted-content rules in the extraction prompt
- Ingestion adapters distinguish an endpoint error from an empty result set (ArcGIS reports failures as HTTP 200 with an error body) and account for every requested Socrata key, so "not found" never becomes "does not exist"
- **PDD Segment 8 (Public Landing Page) complete** on `pdd/landing-page`: landing owns `/` (app relocated to `/command-center`), approved taxonomy copy, five-stage loop, differentiators, evidence model, labeled real Alpha-run figures (87 → 23 → 15 → 5, cross-checked against `data/candidates.json` by test), capability summary derived from the app's own `NAV_GROUPS`, R9 decision-support disclaimer; prompt contract + 16 rule-mapped contract tests, strict check + estimate green; verified live in browser (CTA lands in the app shell)

### Pending for Segment 8 (honest gaps)

- axe audit, keyboard-path E2E, JS-disabled E2E, and visual baselines await an E2E toolchain (no Playwright in repo yet) — statically verifiable a11y rules are contract-tested (skip link, one h1, landmarks, alt text, noopener, reduced-motion + focus-visible in stylesheet)

### Partially working

- Development History agent: runs and records honestly-unknown findings; live extraction untested until RTRVR_API_KEY + MINIMAX_API_KEY exist
- Production persistence and workflow execution require the Supabase project and Render Blueprint to be activated with their server-side environment variables

### Live with evidence/assumption boundaries

- Contacts, Development Events, Watchlists, Land & Parcel, Entitlements, Utilities, Title & Liens, Ownership, Air Rights, Buildable Envelope, Yield, Underwriting, and IC all render persisted research or explicit deterministic scenarios; unavailable records are shown as unknown

### Broken

- (none known; all checks green)

### Blocked — needs Chris (see CHRIS_GUIDE.md in the workspace root)

- Provider keys into `.env`: RENDER_API_KEY + RENDER_WORKFLOW_TASK_SLUG, RTRVR_API_KEY, MINIMAX_API_KEY (+ Supabase if used)
- Render Workflow must be created via Render Dashboard/CLI (render.yaml will not create it) — podium prizes require it
- Deployment URL, submission form, credits claiming, demo order

### Next highest-value task

- Add keys → rerun `npm run research` (snapshots upgrade to complete with live history) → deploy → wire Render task → rehearse

### Demo risks

- Demo works fully offline from stored snapshots (DEMO_MODE architecture) — live calls are optional depth, not a dependency
- Render Workflows integration is the only remaining prize-eligibility dependency

## Day gates

- 1:30 PM — one full research loop working
- 4:15 PM — core demo complete
- 5:00 PM — scope freeze
- 6:30 PM — code freeze
- 7:15 PM — three rehearsals done (normal, timed 4:20–4:40, failure)
