#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_ROOT="$REPO_ROOT/external/scientific-agent-skills/scientific-skills"
DST_ROOT="$SCRIPT_DIR/packs"
PACK_MAPPING_FILE="$SCRIPT_DIR/pack-mapping.toml"

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
DIM="\033[2m"
RESET="\033[0m"

if [ ! -f "$PACK_MAPPING_FILE" ]; then
    echo -e "  ${RED}Pack mapping not found: $PACK_MAPPING_FILE${RESET}" >&2
    exit 1
fi

eval "$(python3 -c "
import tomllib
with open('$PACK_MAPPING_FILE', 'rb') as f:
    data = tomllib.load(f)
print('declare -A PACK_MAPPING')
print('declare -A PACK_DESC')
for pack, v in data.get('pack', {}).items():
    skills = ' '.join(v['skills'])
    desc = v.get('description', '').replace('\"', '\\\"')
    print(f'PACK_MAPPING[{pack}]=\"{skills}\"')
    print(f'PACK_DESC[{pack}]=\"{desc}\"')
")"


DRY_RUN=false
SPECIFIC_PACK=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --pack)
            SPECIFIC_PACK="$2"
            shift 2
            ;;
        --list)
            echo "Available packs:"
            for pack in "${!PACK_MAPPING[@]}"; do
                echo "  $pack"
            done
            exit 0
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "  --dry-run       Show what would be synced (no changes)"
            echo "  --pack NAME     Sync only specific pack"
            echo "  --list          List available packs"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [ ! -d "$SRC_ROOT" ]; then
    echo -e "  ${RED}Source not found: $SRC_ROOT${RESET}" >&2
    echo "  Run: git submodule update --init --recursive" >&2
    exit 1
fi

sync_pack() {
    local pack_name="$1"
    local skills="${PACK_MAPPING[$pack_name]}"
    local tmp_pack=""
    if [ "$DRY_RUN" = false ]; then
        tmp_pack=$(mktemp -d)
    fi

    echo -e "${BOLD}Syncing pack: ${CYAN}$pack_name${RESET}"

    local missing_skills=()
    for skill in $skills; do
        if [ ! -d "$SRC_ROOT/$skill" ]; then
            missing_skills+=("$skill")
        fi
    done

    if [ ${#missing_skills[@]} -gt 0 ]; then
        echo -e "  ${RED}Missing skills: ${missing_skills[*]}${RESET}" >&2
        return 1
    fi

    for skill in $skills; do
        local src="$SRC_ROOT/$skill"
        local dst="$tmp_pack/skills/$skill"
        if [ "$DRY_RUN" = true ]; then
            echo "  Would copy: $src → $dst"
        else
            mkdir -p "$(dirname "$dst")"
            cp -a "$src" "$dst"
        fi
    done

    local desc="${PACK_DESC[$pack_name]:-}"
    if [ "$DRY_RUN" = true ]; then
        echo "  Would write manifest: $DST_ROOT/$pack_name/manifest.toml"
    else
        mkdir -p "$tmp_pack"
        cat > "$tmp_pack/manifest.toml" << EOF
[pack]
name = "$pack_name"
description = "$desc"
version = "1.0.0"

[claude]
skills = "skills"
EOF
        rm -rf "$DST_ROOT/$pack_name"
        mv "$tmp_pack" "$DST_ROOT/$pack_name"
    fi

    echo -e "  ✅ ${GREEN}$pack_name${RESET} ${DIM}(${skills// /, })${RESET}"
}

echo -e "${BOLD}Syncing scientific skills to Claude packs...${RESET}"
echo ""

if [ -n "$SPECIFIC_PACK" ]; then
    if [[ ! -v "PACK_MAPPING[$SPECIFIC_PACK]" ]]; then
        echo -e "  ${RED}Unknown pack: $SPECIFIC_PACK${RESET}" >&2
        echo "  Run: $0 --list" >&2
        exit 1
    fi
    sync_pack "$SPECIFIC_PACK"
else
    for pack in "${!PACK_MAPPING[@]}"; do
        sync_pack "$pack" || true
    done
fi

echo ""
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}Dry run complete. Run without --dry-run to apply.${RESET}"
else
    echo -e "${GREEN}Sync complete. Install with:${RESET}"
    echo "  ./claude/install.sh --pack=<pack-name>"
fi