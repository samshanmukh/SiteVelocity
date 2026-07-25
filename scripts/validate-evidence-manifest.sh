#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

schema="pdd/evidence-manifest.schema.json"
if [[ ! -f "$schema" ]]; then
  echo "validate-evidence-manifest: schema missing: $schema" >&2
  exit 1
fi

shopt -s nullglob
files=(pdd/evidence/*/*.json)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "validate-evidence-manifest: no manifests under pdd/evidence/ (skip)"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "validate-evidence-manifest: python3 required" >&2
  exit 1
fi

python3 - "$schema" "${files[@]}" <<'PY'
import json, sys
from pathlib import Path

schema_path = Path(sys.argv[1])
files = [Path(p) for p in sys.argv[2:]]

try:
    import jsonschema  # type: ignore
except ImportError:
    # Lightweight structural check when jsonschema is unavailable:
    # require schemaVersion and accepted keys present.
    schema = json.loads(schema_path.read_text())
    required = set(schema.get("required", []))
    for path in files:
        data = json.loads(path.read_text())
        missing = sorted(required - set(data))
        if missing:
            raise SystemExit(f"{path}: missing required keys {missing}")
    print(f"validate-evidence-manifest: ok ({len(files)} file(s), structural)")
    raise SystemExit(0)

schema = json.loads(schema_path.read_text())
validator = jsonschema.Draft202012Validator(schema)
errors = []
for path in files:
    data = json.loads(path.read_text())
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        errors.append(f"{path}: {err.message}")
if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print(f"validate-evidence-manifest: ok ({len(files)} file(s))")
PY
