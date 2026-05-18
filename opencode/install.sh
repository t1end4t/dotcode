#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ──────────────────────────────────────────────────────────
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
DIM="\033[2m"
RESET="\033[0m"

# ── Target directories ─────────────────────────────────────────────
OPENCODE_HOME="$HOME/.config/opencode"

COUNT=0

# ── Helpers ─────────────────────────────────────────────────────────
copy_dir() {
  local src="$1" dst="$2" label="$3"
  [ -d "$src" ] || return 0
  local has_files=false
  for f in "$src"/*; do [ -e "$f" ] && has_files=true && break; done
  $has_files || return 0

  rm -rf "$dst"
  mkdir -p "$dst"
  cp -r "$src"/* "$dst"/
  echo -e "  ✅  ${GREEN}${label}${RESET} ${DIM}(synced)${RESET}"
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

# ── Install core ────────────────────────────────────────────────────
install_core() {
  local core="$SCRIPT_DIR/core"
  [ -d "$core" ] || { echo -e "  ${RED}core/ not found${RESET}"; return 1; }

  echo -e "${BOLD}Installing core...${RESET}"
  echo ""

  echo -e "  ${CYAN}opencode${RESET}"

  # Config + plugins
  copy_file "$core/opencode.json"  "$OPENCODE_HOME/opencode.json"  "~/.config/opencode/opencode.json"
  copy_file "$core/opencode.jsonc" "$OPENCODE_HOME/opencode.jsonc" "~/.config/opencode/opencode.jsonc"
  copy_file "$core/tui.json"       "$OPENCODE_HOME/tui.json"       "~/.config/opencode/tui.json"
  copy_dir  "$core/plugins"        "$OPENCODE_HOME/plugins"        "~/.config/opencode/plugins/"

  echo ""
}

# ── List available packs ───────────────────────────────────────────
list_packs() {
  echo -e "${BOLD}Available packs:${RESET}"
  echo ""
  echo -e "  ${YELLOW}No packs available yet.${RESET}"
  echo ""
}

# ── Usage ───────────────────────────────────────────────────────────
usage() {
  echo -e "${BOLD}dotopencode${RESET} — installable packs for OpenCode"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --core                   Install core config + plugins"
  echo "  ./install.sh --all                    Install core + all packs"
  echo "  ./install.sh --list                   List available packs"
  echo ""
  echo "Target: opencode (~/.config/opencode)"
  echo ""
}

# ── Parse args ──────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  usage
  exit 0
fi

DO_CORE=false
DO_ALL=false

while [ $# -gt 0 ]; do
  case "$1" in
    --core)
      DO_CORE=true
      ;;
    --all)
      DO_ALL=true
      ;;
    --list)
      list_packs
      exit 0
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

# ── Execute ─────────────────────────────────────────────────────────
echo ""

if $DO_ALL; then
  install_core
elif $DO_CORE; then
  install_core
fi

# ── Summary ─────────────────────────────────────────────────────────
if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing new installed.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) installed."
fi
echo ""
