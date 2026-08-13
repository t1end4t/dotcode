#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
DIM="\033[2m"
RESET="\033[0m"

OPENCODE_HOME="$HOME/.config/opencode"
COUNT=0

copy_dir() {
  local src="$1" dst="$2" label="$3"
  [ -d "$src" ] || return 0
  local has_files=false
  for file in "$src"/*; do [ -e "$file" ] && has_files=true && break; done
  $has_files || return 0

  mkdir -p "$dst"
  cp -r "$src"/. "$dst"/
  echo -e "  ✅  ${GREEN}${label}${RESET} ${DIM}(updated)${RESET}"
  COUNT=$((COUNT + 1))
}

copy_file() {
  local src="$1" dst="$2" label="$3"
  [ -f "$src" ] || return 0
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo -e "  ✅  ${GREEN}${label}${RESET}"
  COUNT=$((COUNT + 1))
}

install_core() {
  local core="$SCRIPT_DIR/core"
  [ -d "$core" ] || { echo -e "  ${RED}core/ not found${RESET}"; return 1; }

  echo -e "${BOLD}Installing core...${RESET}"
  echo ""
  echo -e "  ${CYAN}opencode${RESET}"

  copy_file "$core/global-instructions.md" "$OPENCODE_HOME/AGENTS.md" "~/.config/opencode/AGENTS.md"
  copy_file "$core/opencode.json" "$OPENCODE_HOME/opencode.json" "~/.config/opencode/opencode.json"
  copy_file "$core/opencode.jsonc" "$OPENCODE_HOME/opencode.jsonc" "~/.config/opencode/opencode.jsonc"
  rm -f "$OPENCODE_HOME/oh-my-openagent.json"
  copy_file "$core/oh-my-opencode-slim.json" "$OPENCODE_HOME/oh-my-opencode-slim.json" "~/.config/opencode/oh-my-opencode-slim.json"
  copy_file "$core/tui.json" "$OPENCODE_HOME/tui.json" "~/.config/opencode/tui.json"
  copy_dir "$core/plugins" "$OPENCODE_HOME/plugins" "~/.config/opencode/plugins/"

  echo ""
}

usage() {
  echo -e "${BOLD}dotopencode${RESET} — OpenCode config installer"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --core  Install core config"
  echo "  ./install.sh --all   Install core config"
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
$DO_CORE && install_core

if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing new installed.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) installed."
fi
echo ""
