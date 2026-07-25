#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <prompt-path> <unit-test-path>" >&2
  exit 2
fi

prompt="$1"
unit_test="$2"

if [[ ! -f "$prompt" ]]; then
  echo "pdd-estimate: prompt not found: $prompt" >&2
  exit 1
fi
if [[ ! -f "$unit_test" ]]; then
  echo "pdd-estimate: unit test not found: $unit_test" >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Capture full CLI output; estimate JSON is expected on stdout.
if ! pdd --estimate-json generate "$prompt" --unit-test "$unit_test" >"$tmp" 2>&1; then
  cat "$tmp" >&2
  echo "pdd-estimate: pdd exited non-zero" >&2
  exit 1
fi

python3 - "$tmp" <<'PY'
import json, sys

text = open(sys.argv[1], encoding="utf-8").read()
candidates = []
try:
    candidates.append(json.loads(text))
except Exception:
    pass

decoder = json.JSONDecoder()
idx = 0
while idx < len(text):
    start = text.find("{", idx)
    if start < 0:
        break
    try:
        value, end = decoder.raw_decode(text, start)
    except Exception:
        idx = start + 1
        continue
    candidates.append(value)
    idx = end


def find_provider_flag(node):
    if isinstance(node, dict):
        if "provider_call_made" in node:
            return node
        for nested in node.values():
            found = find_provider_flag(nested)
            if found is not None:
                return found
    elif isinstance(node, list):
        for item in node:
            found = find_provider_flag(item)
            if found is not None:
                return found
    return None


obj = None
for value in candidates:
    obj = find_provider_flag(value)
    if obj is not None:
        break

if obj is None:
    sys.stderr.write("pdd-estimate: could not find provider_call_made in output\n")
    sys.stderr.write(text[-4000:])
    sys.exit(1)

if obj.get("provider_call_made") is not False:
    sys.stderr.write(
        f"pdd-estimate: expected provider_call_made=false, got {obj.get('provider_call_made')!r}\n"
    )
    sys.exit(1)

print("pdd-estimate: ok (provider_call_made=false)")
PY
