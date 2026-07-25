# PDD generation evidence

Store one validated JSON manifest per generation attempt under a module directory:

```text
pdd/evidence/<module>/<timestamp>-<contract-version>.json
```

Each manifest must validate against `pdd/evidence-manifest.schema.json`. Set `accepted` to `true` only after the generated diff is reviewed and every required verification command passes.

This directory intentionally contains no example run. An example with invented digests, outputs, or verification results could be mistaken for real generation evidence.
