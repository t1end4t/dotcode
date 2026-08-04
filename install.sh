#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

AGENTS=()
ARGS=()

usage() {
  echo -e "${BOLD}dotcode${RESET} — shared config installer for coding agents"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --codex --core"
  echo "  ./install.sh --claude --core"
  echo "  ./install.sh --opencode --core"
  echo "  ./install.sh --all-agents --all"
  echo "  ./install.sh --codex --list"
  echo ""
  echo "Agents:"
  echo "  --codex       Target Codex CLI (~/.codex)"
  echo "  --claude      Target Claude Code (~/.claude)"
  echo "  --opencode    Target OpenCode (~/.config/opencode)"
  echo "  --all-agents  Target every supported agent"
  echo ""
  echo "Options passed through to agent installers:"
  echo "  --core --all --list -h --help"
  echo "  --mcp  Claude only"
  echo ""
}

add_agent() {
  local agent="$1"
  for existing in "${AGENTS[@]}"; do
    [ "$existing" = "$agent" ] && return 0
  done
  AGENTS+=("$agent")
}

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --codex) add_agent "codex" ;;
    --claude) add_agent "claude" ;;
    --opencode) add_agent "opencode" ;;
    --all-agents)
      add_agent "codex"
      add_agent "claude"
      add_agent "opencode"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

if [ ${#AGENTS[@]} -eq 0 ]; then
  echo -e "${RED}No agent selected.${RESET} Use --codex, --claude, --opencode, or --all-agents."
  echo ""
  usage
  exit 1
fi

if [ ${#ARGS[@]} -eq 0 ]; then
  echo -e "${YELLOW}No install option selected.${RESET} Pass --core, --all, or --list."
  exit 1
fi

for agent in "${AGENTS[@]}"; do
  installer="$SCRIPT_DIR/$agent/install.sh"
  if [ ! -x "$installer" ]; then
    echo -e "${RED}$agent installer not found/executable:${RESET} $installer"
    exit 1
  fi

  echo -e "${BOLD}${CYAN}==> $agent${RESET}"
  "$installer" "${ARGS[@]}"
done

printf "${GREEN}dotcode done.${RESET}\n"
