#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SOURCE="$SCRIPT_DIR/../external/claude-skills/skills"

BOLD="\033[1m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

CLAUDE_HOME="$HOME/.claude"
COUNT=0

remove_if_exists() {
  local path="$1" label="$2"
  if [ -e "$path" ]; then
    rm -rf "$path"
    echo -e "  🗑  ${RED}$label${RESET}"
    COUNT=$((COUNT + 1))
  fi
}

uninstall_skills() {
  [ -d "$SKILLS_SOURCE" ] || return 0
  for skill_dir in "$SKILLS_SOURCE"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    local skill_name
    skill_name=$(basename "$skill_dir")
    remove_if_exists "$CLAUDE_HOME/skills/$skill_name" "~/.claude/skills/$skill_name/"
  done
}

uninstall_core() {
  local core="$SCRIPT_DIR/core"
  echo -e "${BOLD}Uninstalling core...${RESET}"
  echo ""

  if [ -d "$core/hooks" ]; then
    for file in "$core/hooks"/*; do
      [ -f "$file" ] || continue
      remove_if_exists "$CLAUDE_HOME/hooks/$(basename "$file")" "~/.claude/hooks/$(basename "$file")"
    done
  fi

  if [ -d "$core/commands" ]; then
    for file in "$core/commands"/*; do
      [ -f "$file" ] || continue
      remove_if_exists "$CLAUDE_HOME/commands/$(basename "$file")" "~/.claude/commands/$(basename "$file")"
    done
  fi

  remove_if_exists "$CLAUDE_HOME/settings.json" "~/.claude/settings.json"
  remove_if_exists "$CLAUDE_HOME/CLAUDE.md" "~/.claude/CLAUDE.md"
  uninstall_skills

  if [ -d "$core/environment.d" ]; then
    local env_dst="$HOME/.config/environment.d"
    for file in "$core/environment.d"/*; do
      [ -f "$file" ] || continue
      local filename marker
      filename=$(basename "$file")
      marker="$CLAUDE_HOME/.dotcode/environment.d/$filename"
      if [ -f "$marker" ]; then
        remove_if_exists "$env_dst/$filename" "~/.config/environment.d/$filename"
        remove_if_exists "$marker" "~/.claude/.dotcode/environment.d/$filename"
      fi
    done
    rmdir "$CLAUDE_HOME/.dotcode/environment.d" "$CLAUDE_HOME/.dotcode" 2>/dev/null || true
  fi

  echo ""
}

uninstall_mcp() {
  echo -e "${BOLD}Uninstalling MCP servers...${RESET}"
  echo ""
  for server in fetch context-mode; do
    if claude mcp get "$server" &>/dev/null 2>&1; then
      claude mcp remove "$server" -s user
      echo -e "  🗑  ${RED}mcp/$server${RESET}"
      COUNT=$((COUNT + 1))
    fi
  done
  echo ""
}

usage() {
  echo -e "${BOLD}dotclaude uninstall${RESET}"
  echo ""
  echo "Usage:"
  echo "  ./uninstall.sh --core  Uninstall core config + shared Claude skills"
  echo "  ./uninstall.sh --mcp   Uninstall MCP servers"
  echo "  ./uninstall.sh --all   Uninstall core + MCP servers"
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
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}Unknown option: $1${RESET}"; usage; exit 1 ;;
  esac
  shift
done

echo ""
if $DO_ALL; then
  uninstall_core
  uninstall_mcp
elif $DO_CORE; then
  uninstall_core
elif $DO_MCP; then
  uninstall_mcp
fi

if [ $COUNT -eq 0 ]; then
  echo -e "${YELLOW}Nothing to uninstall.${RESET}"
else
  echo -e "${BOLD}${CYAN}Done!${RESET} $COUNT item(s) removed."
fi
echo ""
