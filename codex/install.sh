#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SOURCE="$SCRIPT_DIR/../external/claude-skills/skills"

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
DIM="\033[2m"
RESET="\033[0m"

CODEX_HOME="$HOME/.codex"
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

require_skills() {
  [ -d "$SKILLS_SOURCE" ] && return 0
  echo -e "  ${RED}external/claude-skills is not initialized${RESET}"
  echo "  Run: git submodule update --init external/claude-skills"
  return 1
}

install_skills() {
  require_skills
  mkdir -p "$CODEX_HOME/skills"
  for skill_dir in "$SKILLS_SOURCE"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    local skill_name
    skill_name=$(basename "$skill_dir")
    rm -rf "$CODEX_HOME/skills/$skill_name"
    cp -r "$skill_dir" "$CODEX_HOME/skills/$skill_name"
    echo -e "  ✅  ${GREEN}~/.codex/skills/$skill_name/${RESET}"
    COUNT=$((COUNT + 1))
  done
}

install_core() {
  local core="$SCRIPT_DIR/core"
  [ -d "$core" ] || { echo -e "  ${RED}core/ not found${RESET}"; return 1; }

  echo -e "${BOLD}Installing core...${RESET}"
  echo ""
  echo -e "  ${CYAN}codex${RESET}"

  copy_file "$core/global-instructions.md" "$CODEX_HOME/AGENTS.md" "~/.codex/AGENTS.md"
  copy_file "$core/config.toml" "$CODEX_HOME/config.toml" "~/.codex/config.toml"
  copy_file "$core/auth.json" "$CODEX_HOME/auth.json" "~/.codex/auth.json"
  copy_file "$core/hooks.json" "$CODEX_HOME/hooks.json" "~/.codex/hooks.json"
  copy_dir "$core/hooks" "$CODEX_HOME/hooks" "~/.codex/hooks/"
  chmod +x "$CODEX_HOME/hooks/"*.sh 2>/dev/null || true
  install_skills

  echo ""
}

list_skills() {
  require_skills
  echo -e "${BOLD}Available skills:${RESET}"
  echo ""
  for skill_dir in "$SKILLS_SOURCE"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    echo -e "  ${CYAN}$(basename "$skill_dir")${RESET}"
  done
  echo ""
}

usage() {
  echo -e "${BOLD}dotcodex${RESET} — Codex CLI config installer"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --core  Install core config + shared Claude skills"
  echo "  ./install.sh --all   Install core config + shared Claude skills"
  echo "  ./install.sh --list  List shared Claude skills"
  echo ""
}

[ $# -gt 0 ] || { usage; exit 0; }

DO_CORE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --core|--all) DO_CORE=true ;;
    --list) list_skills; exit 0 ;;
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
