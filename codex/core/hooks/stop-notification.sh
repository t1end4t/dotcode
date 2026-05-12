#!/usr/bin/env bash
# Send a desktop notification when Codex finishes responding
INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // .conversation_id // "default"')
PROMPT=$(cat "/tmp/codex-prompt-${SESSION}" 2>/dev/null || echo 'Response done')
notify-send "Codex · $(basename "$PWD")" "$PROMPT" 2>/dev/null || true
