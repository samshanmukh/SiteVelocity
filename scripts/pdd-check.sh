#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

shopt -s nullglob
prompts=(prompts/modules/*_typescript.prompt)
if [[ -f prompts/modules/candidate-normalizer.prompt ]]; then
  prompts+=(prompts/modules/candidate-normalizer.prompt)
fi

if [[ ${#prompts[@]} -eq 0 ]]; then
  echo "pdd-check: no module prompts found" >&2
  exit 1
fi

for f in "${prompts[@]}"; do
  echo "==> pdd contracts check --strict $f"
  pdd contracts check "$f" --strict
  echo "==> pdd context --table $f"
  pdd context "$f" --table
done

echo "pdd-check: ok (${#prompts[@]} prompt(s))"
