#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
ORANGE='\033[38;5;214'
NC='\033[0m'
MUTED='\033[0;2m'
GREEN='\033[0;32m'

INSTALL_BASE="${OPENHEI_INSTALL_BASE:-$HOME/.openhei}"
BIN_DIR="${INSTALL_BASE}/bin"
DATA_DIR="${HOME}/.local/share/openhei"
CONFIG_DIR="${HOME}/.config/openhei"
CACHE_DIR="${HOME}/.cache/openhei"
STATE_DIR="${HOME}/.local/state/openhei"

DRY_RUN=false
YES=false
PURGE_ALL=false

usage() {
    cat <<EOF
OpenHei Uninstaller

Usage: uninstaller.sh [options]

Options:
    -h, --help           Display this help message
    -y, --yes            Skip confirmation prompts
    --dry-run            Show what would be deleted without making changes
    --purge-all          Remove all OpenHei data (binaries, config, data, cache)

Examples:
    ./uninstaller.sh              # Interactive uninstall
    ./uninstaller.sh --yes       # Non-interactive uninstall
    ./uninstaller.sh --dry-run   # Show what would be removed
    ./uninstaller.sh --purge-all # Remove everything including user data
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -y|--yes)
            YES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --purge-all)
            PURGE_ALL=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}" >&2
            usage
            exit 1
            ;;
    esac
done

echo -e "${ORANGE}OpenHei Uninstaller${NC}"
echo "-------------------"

# Check for running processes
find_and_stop_process() {
    local pidfile="$INSTALL_BASE/openhei.pid"
    
    # Try pidfile first
    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo -n "Stopping OpenHei (PID $pid)... "
            if [ "$DRY_RUN" = "true" ]; then
                echo "[DRY RUN] would send SIGTERM to $pid"
            else
                kill -TERM "$pid" 2>/dev/null || true
                sleep 2
                if kill -0 "$pid" 2>/dev/null; then
                    kill -KILL "$pid" 2>/dev/null || true
                fi
            fi
            echo "Done."
            return 0
        fi
    fi
    
    # Fallback: find by exact process name
    local pids
    pids=$(pgrep -f "openhei.*web" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo -n "Stopping OpenHei web processes... "
        if [ "$DRY_RUN" = "true" ]; then
            echo "[DRY RUN] would stop PIDs: $pids"
        else
            for pid in $pids; do
                kill -TERM "$pid" 2>/dev/null || true
            done
            sleep 2
            for pid in $pids; do
                if kill -0 "$pid" 2>/dev/null; then
                    kill -KILL "$pid" 2>/dev/null || true
                fi
            done
        fi
        echo "Done."
    fi
}

echo -e "${MUTED}This will remove:${NC}"
echo "  - Binary: $BIN_DIR"
echo "  - Dashboard: $INSTALL_BASE/dashboard"

if [ "$PURGE_ALL" = "true" ]; then
    echo "  - Data: $DATA_DIR"
    echo "  - Config: $CONFIG_DIR"
    echo "  - Cache: $CACHE_DIR"
    echo "  - State: $STATE_DIR"
fi

echo ""

if [ "$YES" = "false" ] && [ "$DRY_RUN" = "false" ]; then
    read -p "Continue? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Stop processes
find_and_stop_process

# Define targets
TARGETS=()

if [ -d "$BIN_DIR" ]; then
    TARGETS+=("$BIN_DIR")
fi

if [ -d "$INSTALL_BASE/dashboard" ]; then
    TARGETS+=("$INSTALL_BASE/dashboard")
fi

if [ "$PURGE_ALL" = "true" ]; then
    [ -d "$DATA_DIR" ] && TARGETS+=("$DATA_DIR")
    [ -d "$CONFIG_DIR" ] && TARGETS+=("$CONFIG_DIR")
    [ -d "$CACHE_DIR" ] && TARGETS+=("$CACHE_DIR")
    [ -d "$STATE_DIR" ] && TARGETS+=("$STATE_DIR")
fi

# Remove directories
for target in "${TARGETS[@]}"; do
    if [ -d "$target" ]; then
        echo -n "Removing $target... "
        if [ "$DRY_RUN" = "true" ]; then
            echo "[DRY RUN] would remove $target"
        else
            rm -rf "$target"
        fi
        echo "Done."
    fi
done

# Remove parent if empty
if [ -d "$INSTALL_BASE" ]; then
    if [ -z "$(ls -A "$INSTALL_BASE" 2>/dev/null || true)" ]; then
        echo -n "Removing empty $INSTALL_BASE... "
        if [ "$DRY_RUN" = "true" ]; then
            echo "[DRY RUN] would remove $INSTALL_BASE"
        else
            rmdir "$INSTALL_BASE" 2>/dev/null || true
        fi
        echo "Done."
    fi
fi

# Shell config cleanup with markers
SHELL_MARKER_BEGIN="# >>> openhei (managed)"
SHELL_MARKER_END="# <<< openhei (managed)"

clean_shell_config() {
    local file=$1
    if [ ! -f "$file" ]; then
        return
    fi
    
    # Check if file has our markers
    if ! grep -qF "$SHELL_MARKER_BEGIN" "$file" 2>/dev/null; then
        return
    fi
    
    echo -n "Cleaning $file... "
    
    if [ "$DRY_RUN" = "true" ]; then
        echo "[DRY RUN] would remove block between markers"
    else
        local tmp
        tmp=$(mktemp)
        
        # Extract lines outside our markers
        awk -v begin="$SHELL_MARKER_BEGIN" -v end="$SHELL_MARKER_END" '
            $0 == begin { skip=1; next }
            $0 == end { skip=0; next }
            !skip { print }
        ' "$file" > "$tmp"
        
        mv "$tmp" "$file"
    fi
    echo "Done."
}

CONFIG_FILES=(
    "$HOME/.zshrc"
    "$HOME/.bashrc"
    "$HOME/.profile"
    "$HOME/.zshenv"
    "$HOME/.config/fish/config.fish"
)

for file in "${CONFIG_FILES[@]}"; do
    clean_shell_config "$file"
done

# Summary
echo "-------------------"
if [ "$DRY_RUN" = "true" ]; then
    echo -e "${GREEN}Dry run complete!${NC}"
    echo "No changes were made."
else
    echo -e "${GREEN}Cleanup complete!${NC}"
fi
echo -e "You can now run ${MUTED}./install.sh${NC} for a fresh start."
echo -e "${RED}Note:${NC} Remember to restart your terminal or run ${MUTED}source ~/.zshrc${NC} to apply PATH changes."
