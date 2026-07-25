# Segment 7 — Alpha Application UI

Provider-independent presentation contracts, fixtures, and thin App Router product routes for the Alpha journey.

## Module table

| Artifact | Path | Role |
| --- | --- | --- |
| UI standards (include) | `prompts/context/sitevelocity-ui-standards.prompt` | U1–U10 inherited a11y/capability/safe-render rules |
| View-model freeze | `prompts/context/alpha_ui_view_models.prompt` | Frozen TS view models + actions (no React) |
| Generation mold | `prompts/modules/alpha_application_ui_typescript.prompt` | R1–R22 presentation module |
| Product routes | `app/(product)/…` | Thin wrappers; product entry `/command-center` |
| Fixtures | `tests/fixtures/ui/` | Sanitized synthetic view models |
| Contract tests | `tests/contracts/alpha_application_ui.contract.test.ts` | Rule-mapped; skip behavioral until generated |
| UI standards matrix | `tests/contracts/sitevelocity_ui_standards.coverage.test.ts` | Always-run U1–U10 coverage |

`/` remains the provider-readiness surface for now. Segment 8 owns the public landing later. Do **not** place readiness inside the product shell.

## Definition of done (contracts phase)

```bash
pdd contracts check prompts/context/sitevelocity-ui-standards.prompt --strict
pdd contracts check prompts/modules/alpha_application_ui_typescript.prompt --strict
pdd context prompts/modules/alpha_application_ui_typescript.prompt --table
pdd --estimate-json generate prompts/modules/alpha_application_ui_typescript.prompt --unit-test tests/contracts/alpha_application_ui.contract.test.ts
npm run typecheck
npm test
```

## Generation note

Full UI implementation under `generated/` / `generated/ui/` waits on accepted contracts + fixtures. Do not generate until the estimate gate shows `provider_call_made: false` for the dry-run and contract tests are green.
