# SiteVelocity PDD Workflow

This document defines how Prompt Driven Development is used in SiteVelocity. It follows the [official PDD prompting guide](https://github.com/promptdriven/pdd/blob/main/docs/prompting_guide.md) while keeping all commands and configuration version-specific.

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
4. `prompts/modules/` contains one behavioral contract per generated module.
5. `tests/contracts/` proves prompt rules through observable behavior.
6. `pdd/evidence/` records accepted generation runs.

A prompt may link to an owning artifact but must not copy large sections of it. Duplicated requirements drift and are removed rather than synchronized manually.

## 3. Readiness gate

A module is ready for generation only when all answers are yes:

- Does it have exactly one responsibility?
- Are non-responsibilities explicit?
- Is the interface declared and free of provider SDK types?
- Does every rule have a stable `R<n>` identifier and `MUST` or `MUST NOT`?
- Is every rule observable through at least one behavioral test?
- Are unknown, conflict, validation, and failure behavior explicit where relevant?
- Are includes limited to required context?
- Are architecture and product ambiguities resolved by their owning documents?
- Is the installed PDD version pinned and its command/configuration syntax verified?

If any answer is no, continue conventional exploration or fix the controlling artifact. Do not make the generation prompt compensate for unresolved product design.

## 4. Prompt form

Use this minimum form and omit sections that add no behavioral information:

```text
% Role and narrow objective.

<include>../context/sitevelocity-preamble.prompt</include>

<responsibility>
One observable responsibility.
</responsibility>

<non_responsibilities>
Explicit boundaries.
</non_responsibilities>

<contract_rules>
R1 (MUST): One testable rule.
R2 (MUST NOT): One prohibited behavior.
</contract_rules>

<pdd-interface>
Declared inputs, outputs, and errors.
</pdd-interface>
```

Rules describe outcomes and invariants, not implementation steps, package choices, or internal algorithms unless the algorithm itself is the approved product contract.

## 5. Verification and traceability

Each contract test declares the rule IDs it verifies. The verification gate requires:

- every declared rule is covered;
- schema/type checking passes;
- linting passes;
- module unit and contract tests pass;
- relevant integration tests pass;
- generated paths contain only expected changes;
- no secrets or sensitive payloads appear in prompts, outputs, fixtures, logs, or manifests.

The exact commands are recorded in the evidence manifest. They are not documented here until the application toolchain and PDD CLI version are pinned.

## 6. Regeneration policy

When generated behavior is wrong:

1. Determine whether the prompt contract is wrong, incomplete, or ambiguous.
2. If so, update the prompt and its tests, regenerate, and verify.
3. If the prompt is correct but generated code fails its contract, use the installed PDD release's supported diagnostic/fix workflow.
4. Never accept a manual generated-code patch without back-propagating the behavioral correction to the prompt or tests.
5. Preserve failed verification in a non-accepted manifest when it is part of the demonstrated prompt-improvement chain.

Do not regenerate unrelated modules. Review generated diffs with the same care as handwritten code.

## 7. Evidence manifest lifecycle

1. Create one manifest per generation attempt under `pdd/evidence/<module>/`.
2. Compute content digests after the prompt and includes are finalized.
3. Record the pinned generator/tool version and generation timestamp.
4. Record generated output paths and digests.
5. Record verification commands, exit codes, and test-to-rule mappings.
6. Set `accepted` to `true` only when all required checks pass and a reviewer accepts the diff.
7. Validate the document with `pdd/evidence-manifest.schema.json` before commit.

Manifests prove engineering provenance; they are not application telemetry and do not contain real-estate source evidence.

## 8. Initial module sequence

1. Candidate normalizer
2. Candidate qualification filter
3. Finding/evidence validator
4. Research Snapshot selector and fallback
5. Government and sponsor provider adapters
6. Scout ranker after score approval
7. Finance engine after formula approval

The first contract is `prompts/modules/candidate-normalizer.prompt`. Its executable implementation and tests are intentionally deferred until the TypeScript project and installed PDD version are pinned.
