#!/usr/bin/env bash
# Point Codex's bare model ids at the codex provider in 9router.
# Without these, 9router routes gpt-5.6-* to the openai provider and Codex
# fails with "No active credentials for provider: openai".
# Aliases live in ~/.9router/db/data.sqlite (kv scope modelAliases); rerun
# after wiping that database, or when Codex ships a new gpt-5.6-* model.
set -euo pipefail

ROUTER="${ROUTER:-http://127.0.0.1:20128}"
MODELS=(gpt-5.6-sol gpt-5.6-terra gpt-5.6-luna)

curl -sf -m 5 "$ROUTER/api/models/alias" >/dev/null ||
  { echo "9router unreachable at $ROUTER" >&2; exit 1; }

for m in "${MODELS[@]}"; do
  curl -sf -m 10 -X PUT "$ROUTER/api/models/alias" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"codex/$m\",\"alias\":\"$m\"}" >/dev/null
  echo "$m -> codex/$m"
done
