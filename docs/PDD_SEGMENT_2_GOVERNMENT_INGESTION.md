# Segment 2 — Government Ingestion

Owner: Chris Dougherty (`dogsleddev`) · Branch: `pdd/government-adapters`

Source adapters for public records. This segment gets raw government records out of
public endpoints and into immutable, provenance-stamped envelopes. It stops before
canonicalization — mapping raw fields onto canonical candidate fields is the Candidate
Pipeline segment's responsibility.

## Boundary

| This segment owns | This segment must not do |
| --- | --- |
| Admitting outbound source URLs (SSRF control) | Canonical field mapping / normalization (Segment 3) |
| Querying ArcGIS and Socrata endpoints, with pagination | Deduplication, qualification, ranking (Segments 3, 6) |
| Stamping provenance onto every raw record | Evidence and finding validation (Segment 5) |
| Declaring San José's source descriptors and parcel-id rules | Scoring or finance (Segment 6) |

`lib/adapters/sources/source-record.ts` holds the vocabulary shared by every adapter in
this segment (`SourceDescriptor`, `SourceRecord`, `SourcePage`, `SourceTransport`).
Adapters import it; they never redeclare these shapes. Provenance reuses `SourceRef`
from `lib/domain/schemas/core.ts` rather than defining a parallel shape.

Adapters take an injectable `SourceTransport` so every contract test runs offline and
deterministically. No test in this segment performs a network call.

## Modules

| Prompt contract (`prompts/modules/`) | Implementation | Contract tests | Rules | Tests |
| --- | --- | --- | --- | --- |
| `source-url-policy_typescript.prompt` | `lib/security/url-policy.ts` | `tests/contracts/source-url-policy.contract.test.ts` | R1–R17 | 28 |
| `source-record-envelope_typescript.prompt` | `lib/adapters/sources/source-record.ts` | `tests/contracts/source-record-envelope.contract.test.ts` | R1–R13 | 16 |
| `arcgis-feature-source-adapter_typescript.prompt` | `lib/adapters/sources/arcgis.ts` | `tests/contracts/arcgis-feature-source-adapter.contract.test.ts` | R1–R19 | 32 |
| `socrata-resource-source-adapter_typescript.prompt` | `lib/adapters/sources/socrata.ts` | `tests/contracts/socrata-resource-source-adapter.contract.test.ts` | R1–R21 | 30 |
| `san-jose-jurisdiction-adapter_typescript.prompt` | `lib/adapters/jurisdictions/san-jose.ts` | `tests/contracts/san-jose-jurisdiction-adapter.contract.test.ts` | R1–R14 | 24 |

84 rules, 130 contract tests, every rule covered by at least one named test whose name
declares the rule IDs it verifies. `queryArcgis` remains exported so
`scripts/ingest-candidates.ts` is unaffected.

## Behavioral guarantees worth knowing

- **An endpoint error never becomes "zero results."** ArcGIS reports failures as HTTP 200
  with an `error` object in the body. `listArcgisFeatures` returns
  `status: "failed"` with `code: "endpoint_error"` and the endpoint's error code, while a
  genuinely empty result set returns `status: "listed"` with `stopReason: "exhausted"`.
  These two cases are distinguishable by the caller — that is the point.
- **Every requested Socrata key is accounted for.** Keys the endpoint did not return are
  reported as *not returned*, never silently dropped and never recorded as absent.
- **An empty `getPermitSources()` means no source is declared**, not that San José
  publishes no permits.
- **Fail-closed SSRF control.** The private/loopback/link-local check runs before the
  allowlist, so `RESEARCH_URL_ALLOWLIST` cannot re-admit a metadata endpoint. Hostnames
  are normalized (lowercased, trailing DNS root dot stripped) so the deny check and the
  allow check judge one canonical spelling. Refusals name the host but never echo the
  path, query, or credentials.
- **Offline-deterministic tests.** Adapters take an injected `SourceTransport` and clock.
  The whole contract suite passes with `globalThis.fetch` and `net.Socket.prototype.connect`
  replaced by throwing stubs.

## PDD CLI conventions (CLI 0.0.308)

These are enforced by `pdd contracts check --strict` but are not written down in
`docs/PDD_WORKFLOW.md`. They were established empirically while authoring this segment.

1. **Prompt filenames must end `_typescript.prompt`.** Without the language suffix
   `pdd generate` fails with "Could not determine language from input files or options",
   so the no-write estimate gate cannot run.
2. **`<include>` paths resolve from the repo root, not the prompt file.** Use
   `<include>prompts/context/sitevelocity-preamble.prompt</include>`. A `../context/...`
   path resolves to nothing, and the include is silently dropped from the hydrated
   payload — `pdd context <prompt> --table` reports it as `unresolved (file not found)`.
3. **Vague terms in `<contract_rules>` need a `<vocabulary>` entry in `term: definition`
   form** (lowercase term, colon, one line). Prose such as "Valid means X." does not
   clear the check. Terms observed as flagged: `valid`, `invalid`, `complete`, `safe`,
   `unsafe`, `trusted`, `untrusted`, `successful`, `recent`, `reasonable`, `gracefully`.
4. **Every `<non_responsibilities>` line needs an explicit modal** — `MUST NOT`,
   `DOES NOT`, `MAY NOT`, or `WILL NOT`. "Do not fetch source data." fails the check.

### Action for the foundation owner

`prompts/modules/candidate-normalizer.prompt` — the exemplar every other segment is
copying — currently violates 1, 2, and 4:

```
prompts/modules/candidate-normalizer.prompt: 0 warning(s), 7 error(s)
  ERROR VAGUE_TERM   ... "complete" / "invalid" / "valid"
  ERROR MISSING_MODAL ... 4 non-responsibility lines
```

Its include also does not resolve, so generation runs without the shared P1–P8 preamble.
This is left untouched here because it belongs to another segment, but it should be
fixed repo-wide before other owners run their own Definition-of-Done gate.

## Definition of Done — verification commands

Per prompt contract:

```bash
pdd contracts check prompts/modules/<module>_typescript.prompt --strict
pdd context prompts/modules/<module>_typescript.prompt --table
pdd --estimate-json generate prompts/modules/<module>_typescript.prompt --unit-test tests/contracts/<module>.contract.test.ts
```

Repo-wide:

```bash
npm run typecheck
npm test
```

### Result on this branch

| Gate | Result |
| --- | --- |
| `pdd contracts check --strict` (5 prompts) | `0 warning(s), 0 error(s)` each |
| `pdd context --table` (5 prompts) | all includes resolve, no `unresolved` warning |
| `pdd --estimate-json generate ... --unit-test ...` (5) | all produce an estimate, `provider_call_made: false` |
| `npm run typecheck` | clean |
| `npm test` | 151 pass / 0 fail |
| Contract suite with network disabled | 143 pass / 0 fail |
| Secret scan of the segment diff | clean; no `.env` in the commit |

## Open items

- Segment 1 (foundation) has not landed a branch. This segment declared its own shared
  vocabulary in `lib/adapters/sources/source-record.ts` and reused `SourceRef` from
  `lib/domain/schemas/core.ts` rather than inventing a parallel provenance shape. If the
  foundation owner later publishes a different shared source vocabulary, this is the file
  to reconcile.
- `normalize()` from the `SourceAdapter` port in §9.4 is intentionally **not** implemented
  here — canonical mapping belongs to the Candidate Pipeline segment, which already owns
  `lib/domain/candidate-normalizer.ts`.
- `lib/adapters/sources/registry.ts` still imports `SourceMapping` from
  `lib/domain/candidate-normalizer`, which couples the source registry to Segment 3. Worth
  a joint decision with that owner about which side the mappings live on.
