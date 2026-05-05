#!/usr/bin/env bash
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

PI_HOME="$HOME/.pi/agent"
COUNT=0

remove_path() {
  local path="$1" label="$2"
  if [ -e "$path" ]; then
    rm -rf "$path"
    echo -e "  ✅  ${GREEN}${label}${RESET}"
    COUNT=$((COUNT + 1))
  fi
}

usage() {
  echo -e "${BOLD}dotpi${RESET} — uninstall Pi Coding Agent config"
  echo ""
  echo "Usage:"
  echo "  ./uninstall.sh --core"
  echo "  ./uninstall.sh --all"
  echo ""
}

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --core|--all)
      echo ""
      echo -e "${BOLD}Removing pi core config...${RESET}"
      echo ""
      remove_path "$PI_HOME/AGENTS.md" "~/.pi/agent/AGENTS.md"
      remove_path "$PI_HOME/settings.json" "~/.pi/agent/settings.json"
      remove_path "$PI_HOME/models.json" "~/.pi/agent/models.json"
      remove_path "$PI_HOME/skills" "~/.pi/agent/skills/"
      remove_path "$PI_HOME/prompts" "~/.pi/agent/prompts/"
      remove_path "$PI_HOME/themes" "~/.pi/agent/themes/"
      remove_path "$PI_HOME/extensions" "~/.pi/agent/extensions/"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${RESET}"
      usage
      exit 1
      ;;
  esac
  shift
done

if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing removed.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) removed."
fi
echo ""
