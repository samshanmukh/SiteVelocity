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
