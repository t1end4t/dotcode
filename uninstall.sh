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
  echo -e "${BOLD}dotcode uninstall${RESET}"
  echo ""
  echo "Usage:"
  echo "  ./uninstall.sh --codex --core"
  echo "  ./uninstall.sh --claude --core"
  echo "  ./uninstall.sh --opencode --core"
  echo "  ./uninstall.sh --all-agents --all"
  echo ""
  echo "Agents: --codex --claude --opencode --all-agents"
  echo "Options passed through: --core --all -h --help"
  echo "Claude only: --mcp"
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
  echo -e "${YELLOW}No uninstall option selected.${RESET} Pass --core or --all."
  exit 1
fi

for agent in "${AGENTS[@]}"; do
  uninstaller="$SCRIPT_DIR/$agent/uninstall.sh"
  if [ ! -x "$uninstaller" ]; then
    echo -e "${RED}$agent uninstaller not found/executable:${RESET} $uninstaller"
    exit 1
  fi

  echo -e "${BOLD}${CYAN}==> $agent${RESET}"
  "$uninstaller" "${ARGS[@]}"
done

printf "${GREEN}dotcode uninstall done.${RESET}\n"
