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
CODEX_HOME="$HOME/.codex"
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

  echo -e "${BOLD}Installing core (Layer 0)...${RESET}"
  echo ""

  echo -e "  ${CYAN}codex${RESET}"

  copy_file "$core/global-instructions.md" "$CODEX_HOME/AGENTS.md" "~/.codex/AGENTS.md"
  copy_file "$core/config.toml"    "$CODEX_HOME/config.toml"    "~/.codex/config.toml"
  copy_file "$core/auth.json"      "$CODEX_HOME/auth.json"      "~/.codex/auth.json"
  copy_file "$core/hooks.json"     "$CODEX_HOME/hooks.json"     "~/.codex/hooks.json"
  copy_dir  "$core/hooks"         "$CODEX_HOME/hooks"         "~/.codex/hooks/"
  chmod +x "$CODEX_HOME/hooks/"*.sh 2>/dev/null || true

  # Core skills
  if [ -d "$core/skills" ]; then
    mkdir -p "$CODEX_HOME/skills"
    for skill_dir in "$core/skills"/*/; do
      [ -f "$skill_dir/SKILL.md" ] || continue
      local skill_name=$(basename "$skill_dir")
      rm -rf "$CODEX_HOME/skills/$skill_name"
      cp -r "$skill_dir" "$CODEX_HOME/skills/$skill_name"
      echo -e "  ✅  ${GREEN}~/.codex/skills/$skill_name/${RESET}"
      COUNT=$((COUNT + 1))
    done
  fi

  # External submodule path pointers (read-only references, not installed)
  if [ -d "$SCRIPT_DIR/../external" ]; then
    for ext_dir in "$SCRIPT_DIR/../external"/*/; do
      [ -d "$ext_dir" ] || continue
      local ext_name=$(basename "$ext_dir")
      echo "$ext_dir" > "$CODEX_HOME/${ext_name}-path"
      echo -e "  ✅  ${GREEN}~/.codex/${ext_name}-path${RESET}"
      COUNT=$((COUNT + 1))
    done
  fi

  echo ""
}

# ── Install a pack ──────────────────────────────────────────────────
install_pack() {
  local pack_name="$1"
  local pack_dir="$SCRIPT_DIR/packs/$pack_name"
  local skills_home="$PACK_TARGET_DIR/.agents/skills"

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

  echo -e "  ${CYAN}codex${RESET}"

  # Skills (repo-local, use pack:skill naming)
  if [ -d "$pack_dir/skills" ]; then
    mkdir -p "$skills_home"
    rm -rf "$skills_home/${pack_name}:"*
    for skill_dir in "$pack_dir/skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local skill_name=$(basename "$skill_dir")
      [ -f "$skill_dir/SKILL.md" ] || continue
      local dest="$skills_home/${pack_name}:${skill_name}"
      rm -rf "$dest"
      cp -r "$skill_dir" "$dest"
      echo -e "  ✅  ${GREEN}$skills_home/${pack_name}:${skill_name}/${RESET}"
      COUNT=$((COUNT + 1))
    done
  fi

  # Hooks
  if [ -d "$pack_dir/hooks" ]; then
    copy_dir "$pack_dir/hooks" "$CODEX_HOME/hooks" "~/.codex/hooks/"
    chmod +x "$CODEX_HOME/hooks/"*.sh 2>/dev/null || true
  fi

  # Config
  copy_file "$pack_dir/config.toml" "$CODEX_HOME/config.toml" "~/.codex/config.toml"

  echo ""
}

# ── List available packs ───────────────────────────────────────────
list_packs() {
  echo -e "${BOLD}Available packs:${RESET}"
  echo ""
  for pack_dir in "$SCRIPT_DIR/packs"/*/; do
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
  echo -e "${BOLD}dotcodex${RESET} — installable packs for Codex CLI"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --core                   Install Layer 0 (core AGENTS.md, config, hooks, skills)"
  echo "  ./install.sh --pack=NAME              Install a specific pack"
  echo "  ./install.sh --pack=NAME --target=DIR Install pack skills into DIR/.agents/skills"
  echo "  ./install.sh --pack=NAME --pack=NAME  Install multiple packs"
  echo "  ./install.sh --all                    Install core + all packs"
  echo "  ./install.sh --list                   List available packs"
  echo ""
  echo "Target: core → ~/.codex, packs → ./ .agents/skills unless --target=DIR"
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
  for pack_dir in "$SCRIPT_DIR/packs"/*/; do
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
