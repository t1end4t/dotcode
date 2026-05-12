#!/usr/bin/env bash
# Cache the user's prompt text for use in the Stop hook notification
INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // .conversation_id // "default"')
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .message // .input // ""' | cut -c1-80)
echo "$PROMPT" > "/tmp/codex-prompt-${SESSION}" 2>/dev/null || true
