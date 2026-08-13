#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD="\033[1m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

CODEX_HOME="$HOME/.codex"
COUNT=0

remove_if_exists() {
  local path="$1" label="$2"
  if [ -e "$path" ]; then
    rm -rf "$path"
    echo -e "  🗑  ${RED}$label${RESET}"
    COUNT=$((COUNT + 1))
  fi
}

uninstall_core() {
  local core="$SCRIPT_DIR/core"
  echo -e "${BOLD}Uninstalling core...${RESET}"
  echo ""

  remove_if_exists "$CODEX_HOME/AGENTS.md" "~/.codex/AGENTS.md"
  remove_if_exists "$CODEX_HOME/config.toml" "~/.codex/config.toml"
  remove_if_exists "$CODEX_HOME/auth.json" "~/.codex/auth.json"
  remove_if_exists "$CODEX_HOME/hooks.json" "~/.codex/hooks.json"

  if [ -d "$core/hooks" ]; then
    for file in "$core/hooks"/*; do
      [ -f "$file" ] || continue
      remove_if_exists "$CODEX_HOME/hooks/$(basename "$file")" "~/.codex/hooks/$(basename "$file")"
    done
  fi

  echo ""
}

usage() {
  echo -e "${BOLD}dotcodex uninstall${RESET}"
  echo ""
  echo "Usage:"
  echo "  ./uninstall.sh --core  Uninstall core config"
  echo "  ./uninstall.sh --all   Uninstall core config"
  echo ""
}

[ $# -gt 0 ] || { usage; exit 0; }

DO_CORE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --core|--all) DO_CORE=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}Unknown option: $1${RESET}"; usage; exit 1 ;;
  esac
  shift
done

echo ""
$DO_CORE && uninstall_core

if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing to uninstall.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) removed."
fi
echo ""
