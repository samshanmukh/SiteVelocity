# SiteVelocity PDD Workflow

This document defines how Prompt Driven Development is used in SiteVelocity. It follows the [official PDD prompting guide](https://github.com/promptdriven/pdd/blob/main/docs/prompting_guide.md) while keeping all commands and configuration version-specific. The current `.pddrc` baseline was created with and verified against PDD CLI `0.0.308`.

## 1. Operating principle

The development unit is:

```text
module prompt + curated includes + declared interface + contract tests
```

The prompt owns intended behavior. Tests own observable correctness. Generated code is replaceable output. An evidence manifest proves which inputs produced an accepted output and which checks passed.

PDD is used when behavior can be expressed as a narrow contract and verified. Interactive development remains appropriate for exploration, architecture discovery, visual iteration, and debugging hidden coupling. Once behavior stabilizes, capture it in a prompt and tests before treating regeneration as authoritative.

## 2. Artifact authority

1. The PRD defines the product problem, user, workflow, scope, and capability state.
2. `docs/SYSTEM_DESIGN.md` defines architecture, domain boundaries, and trust rules.
3. `prompts/context/` contains curated cross-cutting facts shared by multiple modules.
4. Foundation owns `prompts/context/sitevelocity-preamble.prompt` and `prompts/context/domain-types.prompt`. Only the foundation owner edits the preamble; other contributors propose preamble changes through review.
5. `prompts/modules/` contains one behavioral contract per generated module.
6. `tests/contracts/` proves prompt rules through observable behavior.
7. `pdd/evidence/` records accepted generation runs (see §9).

A prompt may link to an owning artifact but must not copy large sections of it. Duplicated requirements drift and are removed rather than synchronized manually.

## 3. Readiness gate

A module is ready for generation only when all answers are yes:

- Does it have exactly one responsibility?
- Are non-responsibilities explicit and modalized (`DOES NOT` / `MUST NOT`)?
- Is the interface declared and free of provider SDK types?
- Does every rule have a stable `R<n>` identifier and `MUST` or `MUST NOT`?
- Is every rule observable through at least one behavioral test?
- Are unknown, conflict, validation, and failure behavior explicit where relevant?
- Are includes limited to required context and written as repo-root paths?
- Are architecture and product ambiguities resolved by their owning documents?
- Is the installed PDD version pinned and its command/configuration syntax verified?

If any answer is no, continue conventional exploration or fix the controlling artifact. Do not make the generation prompt compensate for unresolved product design.

## 4. Prompt form

Use this minimum form and omit sections that add no behavioral information:

```text
% Role and narrow objective.

<include>prompts/context/sitevelocity-preamble.prompt</include>

<pdd-reason>One-line reason this module exists.</pdd-reason>

<pdd-interface>
{"type":"module","module":{"functions":[
  {"name":"example","signature":"(input: Input) -> Output","returns":"Output"}]}}
</pdd-interface>

<responsibility>
One observable responsibility.
</responsibility>

<non_responsibilities>
- DOES NOT cross this boundary.
</non_responsibilities>

<vocabulary>
term: definition used by the rules below.
</vocabulary>

<contract_rules>
R1 (MUST): One testable rule.
R2 (MUST NOT): One prohibited behavior.
</contract_rules>
```

Includes resolve from the repository root under PDD CLI `0.0.308`. Use `<include>prompts/context/sitevelocity-preamble.prompt</include>`. Do **not** use `../context/...`.

Rules describe outcomes and invariants, not implementation steps, package choices, or internal algorithms unless the algorithm itself is the approved product contract.

## 5. Naming policy

- **Generation modules:** exactly one stable path per module:
  `prompts/modules/<snake_case>_typescript.prompt`
- Never keep hyphenated and underscored duals for the same module long-term.
- **Context includes:** `prompts/context/<name>.prompt` (include-only; never generate from them).
- **Legacy exemplar:** `prompts/modules/candidate-normalizer.prompt` remains the repaired hyphenated path on this branch. Segment 3 supersedes it with `prompts/modules/candidate_normalizer_typescript.prompt` when that lands — do not maintain both as long-term peers.

## 6. Shared template

Authors should copy the mold in `prompts/context/module_prompt_template.prompt` into a new `prompts/modules/<snake_name>_typescript.prompt`. The template is an authoring checklist, not a generate target.

## 7. CLI conventions (PDD 0.0.308)

Empirical checks from Segment 2 and foundation work:

- Vocabulary entries used by `contract_rules` must be `term: definition` (lowercase term, colon).
- Every `non_responsibilities` line needs a modal: `DOES NOT`, `MUST NOT`, `MAY NOT`, or `WILL NOT`.
- Includes use repo-root paths: `prompts/context/...`, not `../context/...`.
- Generation prompts end with `_typescript.prompt` so the CLI can detect the language.
- The preamble is include-only — never run `pdd generate` against it.
- Run `pdd contracts check <prompt> --strict` and `pdd context <prompt> --table` before accepting a contract.

## 8. Verification

Each contract test declares the rule IDs it verifies. Local npm scripts:

| Script | Purpose |
| --- | --- |
| `npm test` | Unit + contract tests (`tests/unit/**`, `tests/contracts/**`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run pdd:stories` | Validate prompt-to-user-story and rule-to-test traceability |
| `npm run pdd:check` | Strict contract check + context table for every generation module |
| `npm run pdd:estimate -- <prompt> <test>` | Dry estimate; asserts `provider_call_made` is false |

The verification gate for an accepted generation additionally requires:

- every declared rule is covered;
- schema/type checking passes;
- linting passes where configured;
- module unit and contract tests pass;
- relevant integration tests pass;
- generated paths contain only expected changes;
- no secrets or sensitive payloads appear in prompts, outputs, fixtures, logs, or manifests.

Exact commands and exit codes are recorded in the evidence manifest for that run.

## 9. Evidence location

**Decision:** accepted generation manifests live under the project store:

```text
pdd/evidence/<module>/<timestamp>-<contract-version>.json
```

Each accepted manifest must validate against `pdd/evidence-manifest.schema.json`.

Native CLI runtime telemetry under `.pdd/evidence/runs/` (including snapshot-context / replay artifacts) is **not** the project acceptance store. Do not treat `.pdd/evidence/runs/` as substitute provenance for merge review.

Manifest lifecycle:

1. Create one manifest per generation attempt under `pdd/evidence/<module>/`.
2. Compute content digests after the prompt and includes are finalized.
3. Record the pinned generator/tool version and generation timestamp.
4. Record generated output paths and digests.
5. Record verification commands, exit codes, and test-to-rule mappings.
6. Set `accepted` to `true` only when all required checks pass and a reviewer accepts the diff.
7. Validate the document with `pdd/evidence-manifest.schema.json` before commit.

Manifests prove engineering provenance; they are not application telemetry and do not contain real-estate source evidence.

## 10. Regeneration policy

When generated behavior is wrong:

1. Determine whether the prompt contract is wrong, incomplete, or ambiguous.
2. If so, update the prompt and its tests, regenerate, and verify.
3. If the prompt is correct but generated code fails its contract, use the installed PDD release's supported diagnostic/fix workflow.
4. Never accept a manual generated-code patch without back-propagating the behavioral correction to the prompt or tests.
5. Preserve failed verification in a non-accepted manifest when it is part of the demonstrated prompt-improvement chain.

Do not regenerate unrelated modules. Review generated diffs with the same care as handwritten code.

## 11. Module sequence

The authoritative full-app sequence and dependency graph live in
`docs/PDD_PROMPT_CATALOG.md`. In summary:

1. Foundation domain types and source-safety boundaries.
2. Government adapters and candidate normalization/qualification.
3. Candidate ingestion orchestration and persistence repositories.
4. Research provider adapters and finding/evidence validation.
5. Agent lifecycle, site-research orchestration, and snapshot assembly.
6. Snapshot selection, ranking, finance, and Next Best Action.
7. Render workflow dispatch and the framework-neutral application API.
8. Application UI, public landing page, and Render deployment.

Contract tests for generation modules skip until the corresponding file exists under `generated/`.

## 12. Foundation ownership / preamble change process

- Foundation owns `sitevelocity-preamble.prompt` and `domain-types.prompt`.
- Only the foundation owner merges edits to the preamble.
- Other contributors open a review proposing the vocabulary or P-rule change, with affected modules and tests listed.
- Changing `domain-types.prompt` is an interface freeze change: require foundation-owner review before regenerating consumers.
