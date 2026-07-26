# SiteVelocity

> **Find the sites that can move.**
> **Don't search for land. Search for time.**

SiteVelocity is an AI-native operating system for real-estate development opportunity discovery, pre-development intelligence, and next-step execution.

It helps a professional developer answer:

> Where should we deploy capital next, what can we probably build, what stands in the way, how reliable is the evidence, who can resolve the remaining questions, and what should we do next?

SiteVelocity is not a listing portal, a parcel database, a zoning chatbot, or a replacement for planners, surveyors, engineers, attorneys, title professionals, environmental consultants, lenders, or investment decision-makers. It is an evidence-backed decision-support system that helps those professionals spend time on the sites that matter.

## Project status

The immediate deliverable is a working vertical slice for the July 25, 2026 Prompt Driven Development Hackathon. The repository is designed as the foundation of the full SiteVelocity product rather than as a disposable demo.

The implemented product now includes a Next.js 16 / React 19 TypeScript application; tenant-aware Supabase persistence and sign-in; durable Render research/ingestion commands; Nexla managed-ingestion landing; Mapbox opportunity mapping; ElevenLabs Scout voice; evidence-backed contacts, utilities, ownership, title, and air-rights screens; deterministic feasibility/yield/underwriting/IC scenarios; watchlists and snapshot-change events; agent policy settings; integration diagnostics; and team-role administration. Provider credentials are not committed, and unavailable facts remain explicit unknowns.

The Alpha proves one complete loop:

```text
SEARCH -> DISCOVER -> RESEARCH -> VERIFY -> NEXT STEP
```

Alpha scope:

- Market: San José, California / Santa Clara County
- Strategy: multifamily and mixed-use residential redevelopment
- Initial universe: 50–100 raw government records
- Candidate shortlist: approximately 15 sites
- Deep research: top 5 candidates
- Demo sites: 3 hero sites
- Primary outcome: 1 decision-quality, evidence-backed site dossier

## The problem

Developers do not lack properties. They lack high-confidence opportunities worth spending time and capital on.

A single site can require research across zoning, general plans, entitlements, permits, parcel records, title, tax, easements, environmental databases, flood maps, utilities, infrastructure, prior applications, ownership, and market conditions. The information is distributed across incompatible government systems and documents, and the most important conclusion is often an unresolved question rather than a clean yes or no.

SiteVelocity compresses a large candidate universe into a small set of investigated opportunities while preserving evidence, uncertainty, and professional-verification requirements.

## Product workflow

The production workflow is:

```text
SEARCH -> DISCOVER -> RESEARCH -> VERIFY -> EVALUATE
       -> UNDERWRITE -> MONITOR -> ACT -> LEARN
```

1. A user defines a **Development Buy Box / Acquisition Thesis**.
2. SiteVelocity ingests structured candidate records from government and licensed sources.
3. Scout applies deterministic filters and explainable ranking rules.
4. Specialist agents research land use, development history, public risks, and unresolved issues.
5. A verifier challenges material findings against authoritative sources.
6. Research is persisted as evidence-linked snapshots.
7. The dossier distinguishes what is known, believed, unknown, and professionally unverified.
8. SiteVelocity recommends the highest-value next action and prepares the user to execute it.
9. Production versions learn from pursue, pass, LOI, acquisition, entitlement, and development outcomes.

## Core differentiation

### Development Event Intelligence

The important object is not merely a parcel. It is a meaningful change affecting that parcel:

- rezoning or general-plan change;
- entitlement approval, withdrawal, inactivity, or expiration;
- new permit activity;
- infrastructure funding;
- public-land disposition;
- tax distress or lien activity;
- ownership or portfolio change;
- removal of a condition that previously caused the customer to pass.

### Path-to-Permit Intelligence

SiteVelocity should identify which regulatory and technical steps are complete, required, discretionary, ministerial, expired, or unknown between the current property state and construction.

### Developer-Specific Opportunity Discovery

The long-term platform learns the user's actual acquisition behavior rather than relying only on static filters.

### Next Best Action

The product does not stop at a research report. It identifies:

- the most consequential unresolved question;
- why the answer matters;
- the department or professional role most likely to resolve it;
- known facts to bring to the conversation;
- questions to ask;
- documents to request;
- the expected follow-up.

## Decision framework

SiteVelocity uses five separate decision measures rather than one opaque AI score:

1. **Strategy Fit** — alignment with the customer's development thesis.
2. **Development Readiness** — remaining entitlement and regulatory friction.
3. **Site Feasibility** — preliminary physical and infrastructure feasibility.
4. **Deal Potential** — whether deterministic preliminary economics justify further work.
5. **Evidence Confidence** — authority, freshness, corroboration, conflicts, and missing information.

Material conditions are also displayed as explicit flags and are never diluted inside a composite score.

Examples include missing legal access, prohibited use, flood or wetland conflict, title/easement conflict, unresolved liens, and utility-capacity risk.

All scoring and financial calculations are versioned, deterministic, typed, and reproducible. An LLM may research assumptions or explain outputs; it is never the calculator of record.

## Evidence and uncertainty

Every material finding is linked to evidence and assigned an evidence level:

- **Document Verified**
- **GIS Screened**
- **AI Researched**
- **Professional / Field Verification Required**

Finding status is one of:

- verified;
- probable;
- unknown;
- conflicting.

Impact is classified separately as:

- opportunity;
- cost/timing risk;
- potential fatal constraint;
- unknown.

Important rules:

- “Not found” never becomes “does not exist.”
- A Housing Element site is a candidate, not a verified investment opportunity.
- GIS parcel geometry is not a legal survey boundary.
- A public risk screen is not environmental, title, engineering, or legal clearance.
- Conflicting evidence remains visible.

## Alpha agents

Only six agents are exposed in the hackathon interface:

| Agent | Responsibility |
| --- | --- |
| Scout | Filters and ranks real candidate sites against the thesis |
| Land Use | Researches zoning, general-plan context, and development standards |
| Development History | Reconstructs planning applications, approvals, permits, and inactivity |
| Site Risk | Performs initial public flood, environmental, and obvious-constraint screening |
| Verifier | Challenges high-impact claims and preserves conflicts |
| Next Best Action | Selects the most important unresolved question and how to resolve it |

The production capability map includes parcel integrity, title, ownership, tax/liens, survey, utilities, civil, geotechnical, environmental, access, buildable envelope, development yield, deterministic underwriting, contacts, interaction capture, and investment-committee output. These are routed behind a smaller set of lead capabilities rather than implemented as 39 autonomous LLMs.

## Product modules

The application exposes every sidebar capability as a working route. A module may
show an explicit unknown or require a declared scenario when authoritative inputs
are unavailable; it never substitutes fabricated property facts.

| Module | Alpha state |
| --- | --- |
| Command Center | LIVE |
| Scout Opportunities | LIVE |
| Opportunity Map | LIVE |
| Site Dossier | LIVE |
| Agent Research | LIVE |
| Next Steps | LIVE |
| Watchlists | LIVE |
| Development Events | LIVE |
| Land & Parcel | LIVE |
| Land Use | LIVE |
| Entitlements & Permits | LIVE |
| Site & Environment | LIVE |
| Utilities & Infrastructure | LIVE |
| Title & Liens | LIVE |
| Ownership & Capital | LIVE |
| Air & Vertical Rights | LIVE |
| Contacts | LIVE |
| Buildable Envelope | LIVE |
| Development Yield | LIVE |
| Underwriting | LIVE |
| Investment Committee | LIVE |
| Data Sources | LIVE |
| Agent Settings | LIVE |
| Integrations | LIVE |
| Team | LIVE |

`LIVE` means the route reads persisted ingestion, research, configuration, or
scenario state and its mutations persist through the tenant repository. “Unknown”
is a supported evidence state, not a preview or an inferred clean result.

## System architecture

```mermaid
flowchart LR
    U["Developer"] --> UI["Next.js Web Application"]
    UI --> API["Server API / Application Services"]
    API --> DB["PostgreSQL / Supabase"]
    API --> WF["WorkflowEngine"]
    WF --> RW["Render Workflows"]
    RW --> SA["Source Adapters"]
    SA --> NX["Nexla or Direct Structured Ingestion"]
    SA --> GOV["HCD, DGS, San José, Santa Clara, FEMA, EPA"]
    RW --> WR["WebResearchProvider"]
    WR --> RT["Rtrvr.ai"]
    RW --> MG["ModelGateway"]
    MG --> MM["MiniMax"]
    RW --> CE["Deterministic Rules and Calculation Engine"]
    RW --> DB
    OBS["Respan Tracing"] -.-> RW
    OBS -.-> MG
    VO["ElevenLabs Voice - Optional"] -.-> UI
    MEM["mem0 Preference Memory - Future"] -.-> API
```

The domain depends on internal interfaces, not sponsor SDKs:

- `WorkflowEngine`
- `WebResearchProvider`
- `ModelGateway`
- `ModelRouter`
- `VoiceProvider`
- `PersistenceProvider`
- `GISProvider`
- `SourceAdapter`
- `JurisdictionAdapter`
- `CalculationRegistry`

See [System Design](docs/SYSTEM_DESIGN.md) for implementation details.

## Technology stack

### Application

- Next.js App Router and React
- Strict TypeScript
- Tailwind CSS
- shadcn/ui-compatible component primitives
- Zod at every external and workflow boundary
- MapLibre GL JS for map rendering
- Turf.js for Alpha spatial operations

### Data and persistence

- PostgreSQL, initially hosted by Supabase
- PostGIS when production spatial queries require it; Alpha may use GeoJSON and Turf.js
- Object storage for raw documents and large source payloads
- Versioned SQL migrations
- Immutable evidence and append-oriented Research Snapshots

### Hackathon runtime providers

- **PDD:** prompt/spec artifacts define behavior and regeneration intent
- **Render Workflows / RocketRide:** selectable durable workflow runtime; Render remains the default
- **Rtrvr.ai:** targeted public-web retrieval and browser research
- **MiniMax:** structured evidence extraction and synthesis
- **Nexla:** conditional structured dataset ingestion and normalization
- **Respan:** optional low-risk tracing after the core loop works
- **Cerebras:** optional rapid first-pass signal extraction after the core loop works
- **ElevenLabs:** Scout speech-to-text microphone input and verified answer playback
- **Mem0:** semantic retrieval for durable Scout working preferences, backed by PostgreSQL

### Additional/provider options

- Expanded Mem0 pursue/pass rationale memory, never authoritative property facts
- TokenRouter or an internal router for multi-model fallback
- RocketRide as an integrated alternative pipeline runtime selected with `WORKFLOW_PROVIDER=rocketride`
- Tencent EdgeOne as an alternative deployment target
- Featherless for open-model access

## Government data sources

### Candidate generation

- [California HCD Sites Inventory](https://www.hcd.ca.gov/housing-element/sites-inventory)
- [California HCD Housing Open Data Tools](https://www.hcd.ca.gov/planning-and-community-development/housing-open-data-tools)
- [California DGS Housing and Local Land Development Opportunities](https://www.dgs.ca.gov/RESD/Projects/Page-Content/Projects-List-Folder/Housing-and-Local-Land-Development-Opportunities)
- [San José 2023–2031 Housing Element](https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/planning-division/citywide-planning/housing-element/2023-2031-draft-housing-element)

### Parcel, land-use, and development history

- [Santa Clara County Parcels](https://data.sccgov.org/Government/Parcels/ubcd-cewv)
- [San José GIS Open Data Map Service](https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer)
- [SJPermits](https://www.sjpermits.org)

### Initial risk screening

- FEMA National Flood Hazard Layer
- EPA ECHO web services
- NRCS Web Soil Survey
- USGS 3DEP
- USFWS IPaC
- FAA Obstruction Evaluation
- National Register / NPS downloads

Every source adapter preserves the raw payload, source URL, agency, source record ID, retrieval timestamp, and normalized output.

## Research Snapshots and demo reliability

Research is persisted as:

```text
Source -> Evidence -> Finding -> Verification -> Decision
```

`DEMO_MODE=true` loads the latest valid stored snapshot immediately. `LIVE_RESEARCH=true` permits selected refreshes. A failed refresh is recorded but never replaces the last valid snapshot.

A snapshot contains:

- source cutoff and creation times;
- evidence and finding identifiers;
- agent/workflow run identifiers;
- complete, partial, or failed status;
- prompt, schema, scoring, and calculation versions where applicable.

Demo mode changes freshness behavior, not factual standards. It never means fake data.

## Prompt Driven Development

SiteVelocity uses PDD for narrow, testable modules—not as a single prompt for the entire application. Product intent, generated behavior, architecture, and proof are intentionally separate:

| Artifact | Authority |
| --- | --- |
| Product Requirements Document | Product scope, users, outcomes, and capability state |
| System Design | Architecture, domain boundaries, provider ports, and operational constraints |
| Module prompt | Behavioral contract for one generated module |
| Tests | Executable proof that the module contract is satisfied |
| Evidence manifest | Reproducible record of prompt inputs, generation, and verification |

Prompts and their curated includes are durable source artifacts. Generated implementation is replaceable. A prompt is considered generation-ready only when it has one responsibility, a declared interface, stable `R<n>` rules using `MUST`/`MUST NOT`, explicit non-responsibilities, and at least one behavioral test for every contract rule.

The first PDD module is candidate normalization because it is deterministic, provider-independent, and straightforward to verify. Provider adapters, candidate qualification, evidence validation, snapshot fallback, scoring, and finance follow only as their interfaces and rules become stable. Exploratory UI work and unresolved architecture remain conventionally maintained until they have verifiable contracts.

The intended lifecycle is:

```text
explore -> capture contract in prompt + tests -> generate -> verify
        -> revise prompt (not generated behavior) -> regenerate -> verify
```

Important agent and workflow behavior must not exist only as ad hoc implementation patches. Each accepted generation records the prompt version, included context, declared interface, generator/tool version, output files, and verification results in an evidence manifest. See [PDD Workflow](docs/PDD_WORKFLOW.md).

## Security and trust boundaries

- Keep all provider keys server-side.
- Validate external API, scraped, model, webhook, and workflow payloads with Zod.
- Treat webpages and documents as untrusted data.
- Never follow instructions embedded inside retrieved content.
- Apply URL allow/deny rules and protect against SSRF.
- Use timeouts, bounded retries, backoff, and idempotency keys.
- Redact secrets and unnecessary personal data from logs and traces.
- Verify webhook signatures.
- Retain raw evidence separately from model interpretation.
- Restrict mem0 to preferences and decision memory.
- Keep deterministic calculation results separate from agent output.

## Repository layout

The implementation should converge on:

```text
app/                    Next.js routes, layouts, and server endpoints
components/             UI components and feature views
lib/
  domain/               Domain schemas and invariants
  providers/            Internal provider interfaces
  adapters/             Sponsor and government-source adapters
  calculations/         Deterministic scoring and finance engines
  persistence/          Repositories and database access
  security/             URL policy, sanitization, redaction, signatures
workflows/              Render workflow definitions and orchestration
prompts/
  context/              Curated cross-cutting rules and canonical vocabulary
  modules/              One behavioral contract per generated module
generated/              Replaceable PDD-generated artifacts when applicable
pdd/
  evidence/             Generation and verification manifests
  evidence-manifest.schema.json
docs/                   Architecture, ADRs, runbooks, and source registry
tests/
  contracts/            Behavioral tests mapped to prompt rule IDs
  unit/                 Conventional deterministic unit tests
  integration/          Provider and persistence boundaries
  e2e/                  Verified user workflows
```

The committed `.pddrc` was created with and verified against PDD CLI `0.0.308`. It targets TypeScript and routes generated code, tests, and examples to `generated/`, `tests/`, and `examples/`. Revalidate the configuration schema and commands before upgrading PDD.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`. Provider connection state is available in the UI and as JSON at `http://localhost:3000/api/integrations`.

The default is a safe local demo (`DEMO_MODE=true`, `LIVE_RESEARCH=false`). To use live persisted data, link and migrate a Supabase project, create an organization and membership, then set `PERSISTENCE_BACKEND=supabase`, `SITEVELOCITY_ORGANIZATION_ID=<uuid>`, `DEMO_MODE=false`, and `LIVE_RESEARCH=true`. The app fails closed if tenant identity or the live database is missing.

Verification commands:

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

Supabase database workflow:

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:types
```

See [Supabase Runbook](docs/runbooks/SUPABASE.md) for key boundaries, migrations, remote linking, RLS, Storage, and recovery procedures.

## Environment configuration

Expected variables are documented here as names only; never commit their values.

```dotenv
DATABASE_URL=
PERSISTENCE_BACKEND=auto
SITEVELOCITY_ORGANIZATION_ID=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
NEXT_PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/mapbox/streets-v12

DEMO_MODE=true
LIVE_RESEARCH=false

WORKFLOW_PROVIDER=render
RENDER_API_KEY=
RENDER_WORKFLOW_TASK_SLUG=
ROCKETRIDE_APIKEY=
ROCKETRIDE_URI=https://api.rocketride.ai
ROCKETRIDE_RESEARCH_PIPELINE=
ROCKETRIDE_INGEST_PIPELINE=
RTRVR_API_KEY=
MINIMAX_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
ELEVENLABS_STT_MODEL_ID=scribe_v2
MINIMAX_MODEL=MiniMax-M2.7

NEXLA_API_KEY=
NEXLA_API_URL=
NEXLA_TOKEN=
RESPAN_API_KEY=
CEREBRAS_API_KEY=
MEM0_API_KEY=
```

Only the core provider variables are required for the primary Alpha path. Optional integrations must fail closed and degrade gracefully.

## Definition of Alpha done

- A user can enter a San José multifamily thesis.
- Real government-derived candidates appear.
- Candidates and hero parcel geometry appear on a synchronized map.
- Six visible agents have persisted statuses.
- At least one site has sourced, schema-valid findings.
- The dossier explains why the site surfaced.
- The development-history timeline is evidence-backed.
- Known, believed, unknown, and conflicting information are distinct.
- Material findings expose sources and retrieval timestamps.
- A useful Next Best Action is generated from unresolved findings.
- Render Workflows or RocketRide is used in the real path, with exactly one selected as the workflow backend.
- At least one Rtrvr retrieval and MiniMax structured extraction are real.
- A Research Snapshot loads without rerunning external services.
- A failed refresh preserves the previous valid snapshot.
- PDD artifacts and at least one regeneration cycle are demonstrable.
- The demo can be completed reliably in approximately three minutes.

## Documentation

- [System Design](docs/SYSTEM_DESIGN.md) — technical architecture and implementation blueprint
- [PDD Workflow](docs/PDD_WORKFLOW.md) — prompt ownership, module lifecycle, verification, and evidence manifests
- [Official PDD Prompting Guide](https://github.com/promptdriven/pdd/blob/main/docs/prompting_guide.md) — upstream prompting conventions

## License

See [LICENSE](LICENSE).
