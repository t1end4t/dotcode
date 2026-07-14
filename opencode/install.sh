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
PACK_TARGET_DIR="$PWD"

COUNT=0

# ── Helpers ─────────────────────────────────────────────────────────
copy_dir() {
  local src="$1" dst="$2" label="$3"
  [ -d "$src" ] || return 0
  local has_files=false
  for f in "$src"/*; do [ -e "$f" ] && has_files=true && break; done
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

# ── Install core ────────────────────────────────────────────────────
install_core() {
  local core="$SCRIPT_DIR/core"
  [ -d "$core" ] || { echo -e "  ${RED}core/ not found${RESET}"; return 1; }

  echo -e "${BOLD}Installing core...${RESET}"
  echo ""

  echo -e "  ${CYAN}opencode${RESET}"

  # Config + plugins
  copy_file "$core/global-instructions.md" "$OPENCODE_HOME/AGENTS.md" "~/.config/opencode/AGENTS.md"
  copy_file "$core/opencode.json"  "$OPENCODE_HOME/opencode.json"  "~/.config/opencode/opencode.json"
  copy_file "$core/opencode.jsonc" "$OPENCODE_HOME/opencode.jsonc" "~/.config/opencode/opencode.jsonc"
  # Remove the config owned by the retired Slim integration during migration.
  rm -f "$OPENCODE_HOME/oh-my-opencode-slim.json"
  copy_file "$core/oh-my-openagent.json" "$OPENCODE_HOME/oh-my-openagent.json" "~/.config/opencode/oh-my-openagent.json"
  copy_file "$core/tui.json"       "$OPENCODE_HOME/tui.json"       "~/.config/opencode/tui.json"
  copy_dir  "$core/plugins"        "$OPENCODE_HOME/plugins"        "~/.config/opencode/plugins/"

  # OpenCode uses the same Agent Skills format as Codex.
  local skills_dir="$SCRIPT_DIR/../codex/core/skills"
  if [ -d "$skills_dir" ]; then
    mkdir -p "$OPENCODE_HOME/skills"
    for skill_dir in "$skills_dir"/*/; do
      [ -f "$skill_dir/SKILL.md" ] || continue
      local skill_name
      skill_name=$(basename "$skill_dir")
      rm -rf "$OPENCODE_HOME/skills/$skill_name"
      cp -r "$skill_dir" "$OPENCODE_HOME/skills/$skill_name"
      echo -e "  ✅  ${GREEN}~/.config/opencode/skills/$skill_name/${RESET}"
      COUNT=$((COUNT + 1))
    done
  fi

  echo ""
}

# ── Install a pack ──────────────────────────────────────────────────
install_pack() {
  local pack_name="$1"
  local pack_dir="$SCRIPT_DIR/../codex/packs/$pack_name"
  local skills_home="$PACK_TARGET_DIR/.agents/skills"

  if [ ! -d "$pack_dir" ]; then
    echo -e "  ${RED}Pack '$pack_name' not found${RESET}"
    return 1
  fi

  echo -e "${BOLD}Installing pack: ${CYAN}$pack_name${RESET}"
  echo ""
  mkdir -p "$skills_home"
  for skill_dir in "$pack_dir/skills"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    local skill_name dest_name dest
    skill_name=$(basename "$skill_dir")
    dest_name="${pack_name}-${skill_name}"
    dest="$skills_home/$dest_name"
    rm -rf "$dest"
    cp -r "$skill_dir" "$dest"
    sed -i "s/^name: .*/name: $dest_name/" "$dest/SKILL.md"
    echo -e "  ✅  ${GREEN}$dest/${RESET}"
    COUNT=$((COUNT + 1))
  done
  echo ""
}

# ── List available packs ───────────────────────────────────────────
list_packs() {
  echo -e "${BOLD}Available packs:${RESET}"
  echo ""
  for pack_dir in "$SCRIPT_DIR/../codex/packs"/*/; do
    [ -d "$pack_dir" ] || continue
    echo -e "  ${CYAN}$(basename "$pack_dir")${RESET}"
  done
  echo ""
}

# ── Usage ───────────────────────────────────────────────────────────
usage() {
  echo -e "${BOLD}dotopencode${RESET} — installable packs for OpenCode"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --core                   Install core config + plugins"
  echo "  ./install.sh --pack=NAME              Install pack into DIR/.agents/skills"
  echo "  ./install.sh --pack=NAME --target=DIR Install pack into DIR/.agents/skills"
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
PACKS=()

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
    --pack=*)
      PACKS+=("${1#--pack=}")
      ;;
    --target=*)
      PACK_TARGET_DIR="${1#--target=}"
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
  for pack_dir in "$SCRIPT_DIR/../codex/packs"/*/; do
    [ -d "$pack_dir" ] || continue
    install_pack "$(basename "$pack_dir")"
  done
elif $DO_CORE; then
  install_core
fi

for pack in "${PACKS[@]}"; do
  install_pack "$pack"
done

# ── Summary ─────────────────────────────────────────────────────────
if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing new installed.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) installed."
fi
echo ""
