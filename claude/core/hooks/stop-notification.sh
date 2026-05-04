#!/usr/bin/env bash
# Send a desktop notification when Claude finishes responding
INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // ""')
PROMPT=$(cat "/tmp/claude-prompt-${SESSION}" 2>/dev/null || echo 'Response done')
notify-send "Claude · $(basename $PWD)" "$PROMPT" 2>/dev/null || true
