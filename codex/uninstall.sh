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

# ── Uninstall core ───────────────────────────────────────────────
uninstall_core() {
  local core="$SCRIPT_DIR/core"
  echo -e "${BOLD}Uninstalling core...${RESET}"
  echo ""

  remove_if_exists "$CODEX_HOME/AGENTS.md"   "~/.codex/AGENTS.md"
  remove_if_exists "$CODEX_HOME/config.toml" "~/.codex/config.toml"

  # Hooks
  if [ -d "$core/hooks" ]; then
    for f in "$core/hooks"/*; do
      [ -f "$f" ] || continue
      remove_if_exists "$CODEX_HOME/hooks/$(basename "$f")" "~/.codex/hooks/$(basename "$f")"
    done
  fi

  # Core skills
  if [ -d "$core/skills" ]; then
    for skill_dir in "$core/skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local skill_name=$(basename "$skill_dir")
      remove_if_exists "$CODEX_HOME/skills/$skill_name" "~/.codex/skills/$skill_name/"
    done
  fi

  # External submodule path pointers
  if [ -d "$SCRIPT_DIR/external" ]; then
    for ext_dir in "$SCRIPT_DIR/external"/*/; do
      [ -d "$ext_dir" ] || continue
      local ext_name=$(basename "$ext_dir")
      remove_if_exists "$CODEX_HOME/${ext_name}-path" "~/.codex/${ext_name}-path"
    done
  fi

  echo ""
}

# ── Uninstall a pack ───────────────────────────────────────────────
uninstall_pack() {
  local pack_name="$1"
  local pack_dir="$SCRIPT_DIR/packs/$pack_name"

  if [ ! -d "$pack_dir" ]; then
    echo -e "  ${RED}Pack '$pack_name' not found${RESET}"
    return 1
  fi

  echo -e "${BOLD}Uninstalling pack: ${CYAN}$pack_name${RESET}"
  echo ""

  # Skills (match pack:skill naming from install)
  if [ -d "$pack_dir/skills" ]; then
    for skill_dir in "$pack_dir/skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local skill_name=$(basename "$skill_dir")
      remove_if_exists "$CODEX_HOME/skills/${pack_name}:${skill_name}" "~/.codex/skills/${pack_name}:${skill_name}/"
    done
  fi

  # Hooks
  if [ -d "$pack_dir/hooks" ]; then
    for f in "$pack_dir/hooks"/*; do
      [ -f "$f" ] || continue
      remove_if_exists "$CODEX_HOME/hooks/$(basename "$f")" "~/.codex/hooks/$(basename "$f")"
    done
  fi

  echo ""
}

# ── Usage ───────────────────────────────────────────────────────────
usage() {
  echo -e "${BOLD}dotcodex uninstall${RESET}"
  echo ""
  echo "Usage:"
  echo "  ./uninstall.sh --core                   Uninstall Layer 0"
  echo "  ./uninstall.sh --pack=NAME              Uninstall a specific pack"
  echo "  ./uninstall.sh --all                    Uninstall core + all packs"
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
    --core)     DO_CORE=true ;;
    --all)      DO_ALL=true ;;
    --pack=*)   PACKS+=("${1#--pack=}") ;;
    -h|--help)  usage; exit 0 ;;
    *)          echo -e "${RED}Unknown option: $1${RESET}"; usage; exit 1 ;;
  esac
  shift
done

echo ""

if $DO_ALL; then
  uninstall_core
  for pack_dir in "$SCRIPT_DIR/packs"/*/; do
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
