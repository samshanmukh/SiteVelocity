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
- Sponsor stack (runtime): Render Workflows → Rtrvr.ai → MiniMax. PDD as methodology. ElevenLabs only after all core criteria pass.
- Not integrating today: Cerebras, Band, Nexla, Respan, TokenRouter, mem0, RocketRide, Featherless, Tencent EdgeOne.

## Status (updated ~2:45 PM by Chris/Claude on branch `chris/alpha-loop`)

### Working

- Full app shell per the design handoff: navy rail with LIVE/PREVIEW/ROADMAP badges, top bar, right drilldown pane, Scout FAB — all screens: Command Center, Scout (buy-box), Opportunity Map, Sites, Dossier (Snapshot/Land Use/History/Site Risk/Evidence + honest preview tabs), Next Steps, Research Runs, Data Sources
- **Real candidate ingestion** (`npm run ingest`): City of San José AB2011Parcels2024 (official ArcGIS service, 87 vacant parcels) → County of Santa Clara parcel enrichment (address/geometry/acreage) → candidate-normalizer (PDD contract) → buy-box filter → deterministic Strategy Fit ranking → **15 shortlisted candidates with full provenance** in `data/candidates.json`
- **Real research loop** (`npm run research`): per-site Land Use (SJ Zoning + General Plan 2040 layers), Site Risk (FEMA NFHL flood + city constraint screens), Verifier rules, deterministic Readiness + Evidence Confidence scores, Next Best Action, immutable Research Snapshot — **top 5 sites researched and persisted** under `data/sites/`
- Six visible agents with persisted statuses; snapshots honestly `partial` until live providers configured
- API: GET /api/candidates, GET /api/sites/:id, POST /api/sites/:id/research, GET /api/integrations
- Render Workflows task body ready: `workflows/research-site.ts` (same pipeline as API/CLI)
- Live Rtrvr+MiniMax Development History path coded (`lib/research/live-history.ts`) — activates when keys land
- PDD cycle demonstrable: prompt contract → 13 contract tests mapped R1–R12/P1–P8 → generated implementation → **accepted evidence manifest with real digests** (`pdd/evidence/candidate-normalizer/`)
- `npm run typecheck` clean · `npm test` 37/37 passing on this branch
- Security: https-only source allowlist (`lib/security/url-policy.ts`), untrusted-content rules in the extraction prompt
- **PDD Segment 8 (Public Landing Page) complete** on `pdd/landing-page`: landing owns `/` (app relocated to `/command-center`), approved taxonomy copy, five-stage loop, differentiators, evidence model, labeled real Alpha-run figures (87 → 23 → 15 → 5, cross-checked against `data/candidates.json` by test), capability summary derived from the app's own `NAV_GROUPS`, R9 decision-support disclaimer; prompt contract + 16 rule-mapped contract tests, strict check + estimate green; verified live in browser (CTA lands in the app shell)

### Pending for Segment 8 (honest gaps)

- axe audit, keyboard-path E2E, JS-disabled E2E, and visual baselines await an E2E toolchain (no Playwright in repo yet) — statically verifiable a11y rules are contract-tested (skip link, one h1, landmarks, alt text, noopener, reduced-motion + focus-visible in stylesheet)

### Partially working

- Development History agent: runs and records honestly-unknown findings; live extraction untested until RTRVR_API_KEY + MINIMAX_API_KEY exist
- Map is a schematic street grid with real parcel-centroid markers (MapLibre upgrade optional)

### Preview-only (truthful capability pages, no fabricated data)

- Contacts, Development Events, Watchlists, Land & Parcel, Entitlements, Utilities, Title & Liens, Ownership, Buildable Envelope, Yield, Underwriting, IC

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
