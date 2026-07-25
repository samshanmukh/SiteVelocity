# PDD generation evidence

**Accepted** generation manifests live here under a module directory:

```text
pdd/evidence/<module>/<timestamp>-<contract-version>.json
```

Each manifest must validate against `pdd/evidence-manifest.schema.json`. Set `accepted` to `true` only after the generated diff is reviewed and every required verification command passes.

Native CLI runtime telemetry under `.pdd/evidence/runs/` (snapshot-context / replay artifacts) is **not** the project acceptance store. Do not commit or review those paths as substitute provenance for merge acceptance.

This directory intentionally contains no example run. An example with invented digests, outputs, or verification results could be mistaken for real generation evidence.
