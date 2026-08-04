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

CLAUDE_HOME="$HOME/.claude"
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
  mkdir -p "$CLAUDE_HOME/skills"
  for skill_dir in "$SKILLS_SOURCE"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    local skill_name
    skill_name=$(basename "$skill_dir")
    rm -rf "$CLAUDE_HOME/skills/$skill_name"
    cp -r "$skill_dir" "$CLAUDE_HOME/skills/$skill_name"
    echo -e "  ✅  ${GREEN}~/.claude/skills/$skill_name/${RESET}"
    COUNT=$((COUNT + 1))
  done
}

install_core() {
  local core="$SCRIPT_DIR/core"
  [ -d "$core" ] || { echo -e "  ${RED}core/ not found${RESET}"; return 1; }

  echo -e "${BOLD}Installing core...${RESET}"
  echo ""
  echo -e "  ${CYAN}claude${RESET}"

  copy_dir "$core/hooks" "$CLAUDE_HOME/hooks" "~/.claude/hooks/"
  copy_dir "$core/commands" "$CLAUDE_HOME/commands" "~/.claude/commands/"
  copy_file "$core/settings.json" "$CLAUDE_HOME/settings.json" "~/.claude/settings.json"
  copy_file "$core/global-instructions.md" "$CLAUDE_HOME/CLAUDE.md" "~/.claude/CLAUDE.md"
  chmod +x "$CLAUDE_HOME/hooks/"*.sh 2>/dev/null || true
  install_skills

  if [ -d "$core/environment.d" ]; then
    local env_dst="$HOME/.config/environment.d"
    mkdir -p "$env_dst"
    for file in "$core/environment.d"/*; do
      [ -f "$file" ] || continue
      local filename
      filename=$(basename "$file")
      if [ -f "$env_dst/$filename" ]; then
        echo -e "  ⚠️   ${YELLOW}~/.config/environment.d/$filename${RESET} ${DIM}(already exists, skipped)${RESET}"
      else
        cp "$file" "$env_dst/$filename"
        mkdir -p "$CLAUDE_HOME/.dotcode/environment.d"
        touch "$CLAUDE_HOME/.dotcode/environment.d/$filename"
        echo -e "  ✅  ${GREEN}~/.config/environment.d/$filename${RESET}"
        COUNT=$((COUNT + 1))
      fi
    done
  fi

  echo ""
}

install_mcp() {
  local mcp_script="$SCRIPT_DIR/core/mcp.sh"
  [ -f "$mcp_script" ] || { echo -e "  ${RED}core/mcp.sh not found${RESET}"; return 1; }
  echo -e "${BOLD}Installing MCP servers...${RESET}"
  echo ""
  bash "$mcp_script"
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
  echo -e "${BOLD}dotclaude${RESET} — Claude Code config installer"
  echo ""
  echo "Usage:"
  echo "  ./install.sh --core  Install core config + shared Claude skills"
  echo "  ./install.sh --mcp   Install MCP servers"
  echo "  ./install.sh --all   Install core + MCP servers"
  echo "  ./install.sh --list  List shared Claude skills"
  echo ""
}

[ $# -gt 0 ] || { usage; exit 0; }

DO_CORE=false
DO_ALL=false
DO_MCP=false

while [ $# -gt 0 ]; do
  case "$1" in
    --core) DO_CORE=true ;;
    --all) DO_ALL=true ;;
    --mcp) DO_MCP=true ;;
    --list) list_skills; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}Unknown option: $1${RESET}"; usage; exit 1 ;;
  esac
  shift
done

echo ""
if $DO_ALL; then
  install_core
  install_mcp
elif $DO_CORE; then
  install_core
elif $DO_MCP; then
  install_mcp
fi

if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing new installed.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) installed."
fi
echo ""
