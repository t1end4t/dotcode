#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

OPENCODE_HOME="$HOME/.config/opencode"
PACK_TARGET_DIR="$PWD"
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
  local skills_dir="$SCRIPT_DIR/../codex/core/skills"

  echo -e "${BOLD}Uninstalling core...${RESET}"
  echo ""

  remove_if_exists "$OPENCODE_HOME/AGENTS.md" "~/.config/opencode/AGENTS.md"
  remove_if_exists "$OPENCODE_HOME/opencode.json" "~/.config/opencode/opencode.json"
  remove_if_exists "$OPENCODE_HOME/opencode.jsonc" "~/.config/opencode/opencode.jsonc"
  remove_if_exists "$OPENCODE_HOME/oh-my-openagent.json" "~/.config/opencode/oh-my-openagent.json"
  remove_if_exists "$OPENCODE_HOME/oh-my-opencode-slim.json" "~/.config/opencode/oh-my-opencode-slim.json"
  remove_if_exists "$OPENCODE_HOME/tui.json" "~/.config/opencode/tui.json"

  if [ -d "$core/plugins" ]; then
    for item in "$core/plugins"/*; do
      [ -e "$item" ] || continue
      remove_if_exists "$OPENCODE_HOME/plugins/$(basename "$item")" "~/.config/opencode/plugins/$(basename "$item")"
    done
  fi

  if [ -d "$skills_dir" ]; then
    for skill_dir in "$skills_dir"/*/; do
      [ -d "$skill_dir" ] || continue
      remove_if_exists "$OPENCODE_HOME/skills/$(basename "$skill_dir")" "~/.config/opencode/skills/$(basename "$skill_dir")/"
    done
  fi

  echo ""
}

uninstall_pack() {
  local pack_name="$1"
  local pack_dir="$SCRIPT_DIR/../codex/packs/$pack_name"
  local skills_home="$PACK_TARGET_DIR/.agents/skills"

  if [ ! -d "$pack_dir" ]; then
    echo -e "  ${RED}Pack '$pack_name' not found${RESET}"
    return 1
  fi

  echo -e "${BOLD}Uninstalling pack: ${CYAN}$pack_name${RESET}"
  echo ""
  for skill_dir in "$pack_dir/skills"/*/; do
    [ -d "$skill_dir" ] || continue
    remove_if_exists "$skills_home/${pack_name}-$(basename "$skill_dir")" "$skills_home/${pack_name}-$(basename "$skill_dir")/"
  done
  echo ""
}

usage() {
  echo -e "${BOLD}dotopencode uninstall${RESET}"
  echo ""
  echo "Usage:"
  echo "  ./uninstall.sh --core"
  echo "  ./uninstall.sh --pack=NAME [--target=DIR]"
  echo "  ./uninstall.sh --all [--target=DIR]"
  echo ""
}

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

DO_CORE=false
DO_ALL=false
PACKS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --core) DO_CORE=true ;;
    --all) DO_ALL=true ;;
    --pack=*) PACKS+=("${1#--pack=}") ;;
    --target=*) PACK_TARGET_DIR="${1#--target=}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}Unknown option: $1${RESET}"; usage; exit 1 ;;
  esac
  shift
done

echo ""

if $DO_ALL; then
  uninstall_core
  for pack_dir in "$SCRIPT_DIR/../codex/packs"/*/; do
    [ -d "$pack_dir" ] || continue
    uninstall_pack "$(basename "$pack_dir")"
  done
elif $DO_CORE; then
  uninstall_core
fi

for pack in "${PACKS[@]}"; do
  uninstall_pack "$pack"
done

if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing to uninstall.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) removed."
fi
echo ""
