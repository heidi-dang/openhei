#!/usr/bin/env bash
# OpenHei Uninstaller
# Use this to clean up all OpenHei binaries, data, and configurations.

RED='\033[0;31m'
ORANGE='\033[38;5;214m'
NC='\033[0m' # No Color
MUTED='\033[0;2m'

echo -e "${ORANGE}OpenHei Uninstaller${NC}"
echo "-------------------"

# 1. Stop running processes
echo -n "Stopping running OpenHei processes... "
pkill -f "openhei" || true
pkill -f "bun packages/openhei/src/index.ts" || true
echo "Done."

# 2. Define targets
TARGETS=(
    "$HOME/.openhei"                           # Binary & Dashboard
    "$HOME/.local/share/openhei"               # Data & Database
    "$HOME/.config/openhei"                    # Config
    "$HOME/.cache/openhei"                     # Cache
    "$HOME/.local/state/openhei"               # State
)

# 3. Removal
for target in "${TARGETS[@]}"; do
    if [ -d "$target" ]; then
        echo -n "Removing $target... "
        rm -rf "$target"
        echo "Done."
    fi
done

# 4. Clean up Shell Configurations
clean_shell_config() {
    local file=$1
    if [ -f "$file" ]; then
        if grep -q "openhei" "$file"; then
            echo -n "Cleaning $file... "
            # Remove any line containing .openhei, OPENHEI_DASHBOARD_DIR, or the # openhei marker
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS sed needs an empty backup string
                sed -i '' '/openhei/d' "$file"
                sed -i '' '/# openhei/d' "$file"
            else
                sed -i '/openhei/d' "$file"
                sed -i '/# openhei/d' "$file"
            fi
            echo "Done."
        fi
    fi
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

# 5. Summary
echo "-------------------"
echo -e "${ORANGE}Cleanup complete!${NC}"
echo -e "You can now run ${MUTED}./install.sh --local-repo${NC} for a fresh start."
echo -e "${RED}Note:${NC} Remember to restart your terminal or run ${MUTED}source ~/.zshrc${NC} (or your shell config) to apply PATH changes."
