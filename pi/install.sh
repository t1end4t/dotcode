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
PI_HOME="$HOME/.pi/agent"

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

  echo -e "${BOLD}Installing core (Layer 0)...${RESET}"
  echo ""

  echo -e "  ${CYAN}pi${RESET}"

  copy_file "$core/global-instructions.md" "$PI_HOME/AGENTS.md" "~/.pi/agent/AGENTS.md"
  copy_file "$core/settings.json" "$PI_HOME/settings.json" "~/.pi/agent/settings.json"
  copy_file "$core/models.json" "$PI_HOME/models.json" "~/.pi/agent/models.json"
  if [ -d "$core/skills" ]; then
    mkdir -p "$PI_HOME/skills"
    find "$PI_HOME/skills" -mindepth 1 -maxdepth 1 -type d ! -name '*:*' -exec rm -rf {} +
    for skill_dir in "$core/skills"/*/; do
      [ -f "$skill_dir/SKILL.md" ] || continue
      local skill_name=$(basename "$skill_dir")
      rm -rf "$PI_HOME/skills/$skill_name"
      cp -r "$skill_dir" "$PI_HOME/skills/$skill_name"
      echo -e "  ✅  ${GREEN}~/.pi/agent/skills/$skill_name/${RESET}"
      COUNT=$((COUNT + 1))
    done
  fi
  copy_dir  "$core/prompts" "$PI_HOME/prompts" "~/.pi/agent/prompts/"
  copy_dir  "$core/themes" "$PI_HOME/themes" "~/.pi/agent/themes/"
  copy_dir  "$core/extensions" "$PI_HOME/extensions" "~/.pi/agent/extensions/"

  echo ""
}

# ── Install a pack ──────────────────────────────────────────────────
install_pack() {
  local pack_name="$1"
  local pack_dir="$SCRIPT_DIR/packs/$pack_name"
  # Fall back to codex packs if pi has no local packs
  [ -d "$pack_dir" ] || pack_dir="$SCRIPT_DIR/../codex/packs/$pack_name"
  if [ ! -d "$pack_dir" ]; then
    echo -e "  ${RED}Pack '$pack_name' not found${RESET}"
    return 1
  fi

  local desc=""
  if [ -f "$pack_dir/manifest.toml" ]; then
    desc=$(grep '^description' "$pack_dir/manifest.toml" | head -1 | sed 's/.*= *"\(.*\)"/\1/')
  fi

  echo -e "${BOLD}Installing pack: ${CYAN}$pack_name${RESET}"
  [ -n "$desc" ] && echo -e "  ${DIM}$desc${RESET}"
  echo ""

  echo -e "  ${CYAN}pi${RESET}"

  if [ -d "$pack_dir/skills" ]; then
    mkdir -p "$PI_HOME/skills"
    for skill_dir in "$pack_dir/skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local skill_name=$(basename "$skill_dir")
      [ -f "$skill_dir/SKILL.md" ] || continue
      local dest="$PI_HOME/skills/${skill_name}"
      rm -rf "$dest"
      cp -r "$skill_dir" "$dest"
      # Rewrite frontmatter name to drop pack prefix (Pi requires name = dir name)
      if [ -f "$dest/SKILL.md" ]; then
        sed -i "s/^name: ${pack_name}:${skill_name}$/name: ${skill_name}/" "$dest/SKILL.md"
      fi
      echo -e "  ✅  ${GREEN}~/.pi/agent/skills/${skill_name}/${RESET}"
      COUNT=$((COUNT + 1))
    done
  fi

  copy_dir "$pack_dir/prompts" "$PI_HOME/prompts" "~/.pi/agent/prompts/"
  copy_dir "$pack_dir/themes" "$PI_HOME/themes" "~/.pi/agent/themes/"
  copy_dir "$pack_dir/extensions" "$PI_HOME/extensions" "~/.pi/agent/extensions/"
  copy_file "$pack_dir/settings.json" "$PI_HOME/settings.json" "~/.pi/agent/settings.json"
  copy_file "$pack_dir/models.json" "$PI_HOME/models.json" "~/.pi/agent/models.json"

  echo ""
}

# ── List available packs ───────────────────────────────────────────
list_packs() {
  echo -e "${BOLD}Available packs:${RESET}"
  echo ""
  local packs_dir="$SCRIPT_DIR/packs"
  [ -d "$packs_dir" ] || packs_dir="$SCRIPT_DIR/../codex/packs"
  [ -d "$packs_dir" ] || { echo -e "  ${DIM}(none)${RESET}"; echo ""; return 0; }
  for pack_dir in "$packs_dir"/*/; do
    [ -d "$pack_dir" ] || continue
    local name=$(basename "$pack_dir")
    local desc=""
    if [ -f "$pack_dir/manifest.toml" ]; then
      desc=$(grep '^description' "$pack_dir/manifest.toml" | head -1 | sed 's/.*= *"\(.*\)"/\1/')
    fi
    local file_count=$(find "$pack_dir" -type f ! -name "manifest.toml" | wc -l)
    echo -e "  ${CYAN}$name${RESET} ${DIM}($file_count files)${RESET}"
    [ -n "$desc" ] && echo -e "    $desc"
  done
  echo ""
}

# ── Usage ───────────────────────────────────────────────────────────
usage() {
  echo -e "${BOLD}dotpi${RESET} — installable config for Pi Coding Agent"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --core                   Install Layer 0 (AGENTS.md, settings, models)"
  echo "  ./install.sh --pack=NAME              Install a specific pack"
  echo "  ./install.sh --pack=NAME --pack=NAME  Install multiple packs"
  echo "  ./install.sh --all                    Install core + all packs"
  echo "  ./install.sh --list                   List available packs"
  echo ""
  echo "Target: pi (~/.pi/agent)"
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
  all_packs_dir="$SCRIPT_DIR/packs"
  [ -d "$all_packs_dir" ] || all_packs_dir="$SCRIPT_DIR/../codex/packs"
  if [ -d "$all_packs_dir" ]; then
    for pack_dir in "$all_packs_dir"/*/; do
      [ -d "$pack_dir" ] || continue
      install_pack "$(basename "$pack_dir")"
    done
  fi
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
