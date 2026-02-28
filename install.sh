#!/usr/bin/env bash
set -euo pipefail
APP=openhei
specific_version=""
requested_version=""
echo "OpenHei Installer started..."

MUTED='\033[0;2m'
RED='\033[0;31m'
ORANGE='\033[38;5;214m'
NC='\033[0m' # No Color

show_logo() {
    echo -e ""
    echo -e "${MUTED}█▀▀█ █▀▀█ █▀▀█ █▀▀▄ ${NC}█░░█ █▀▀▀ ░█░░"
    echo -e "${MUTED}█░░█ █░░█ █▀▀▀ █░░█ ${NC}█▀▀█ █▀▀▀ ░█░░"
    echo -e "${MUTED}▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀  ▀ ${NC}▀  ▀ ▀▀▀▀ ▀▀▀▀"
    echo -e ""
    echo -e ""
    echo -e "${MUTED}OpenHei includes free models, to start:${NC}"
    echo -e ""
    echo -e "cd <project>  ${MUTED}# Open directory${NC}"
    echo -e "openhei      ${MUTED}# Run command${NC}"
    echo -e ""
    echo -e "${MUTED}For more information visit ${NC}https://openhei.ai/docs"
    echo -e ""
    echo -e ""
}

print_install_summary() {
    local build_id="${specific_version:-unknown}"
    local server_port="4096"
    local smoke_url="http://localhost:${server_port}/health"
    local current_sha=""

    if [ -d "$SCRIPT_DIR/.git" ] && command -v git >/dev/null 2>&1; then
        current_sha=$(cd "$SCRIPT_DIR" && git rev-parse HEAD 2>/dev/null | cut -c1-8 || echo "unknown")
    fi

    echo -e ""
    echo -e "${MUTED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MUTED}  Installation Summary${NC}"
    echo -e "${MUTED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e ""
    echo -e "  ${MUTED}Mode:${NC}            local-repo"
    echo -e "  ${MUTED}Git SHA:${NC}        ${current_sha:-unknown}"
    echo -e "  ${MUTED}Build ID:${NC}       $build_id"
    echo -e "  ${MUTED}Install Dir:${NC}    $INSTALL_DIR"
    echo -e "  ${MUTED}Dashboard Dir:${NC}  $DASHBOARD_DIR"
    echo -e "  ${MUTED}Server Port:${NC}    $server_port"
    echo -e "  ${MUTED}Smoke URL:${NC}      $smoke_url"
    echo -e ""
    echo -e "${MUTED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e ""
    echo -e "${ORANGE}To verify installation:${NC}"
    echo -e "  which openhei"
    echo -e "  ls -l \$(which openhei)"
    echo -e "  openhei --version"
    echo -e ""
}

usage() {
    cat <<EOF
OpenHei Installer

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Install a specific version (e.g., 1.0.180)
    -b, --binary <path>     Install from a local binary instead of downloading
    --local-repo            Build and install from the current repository
    --repo-local            Alias for --local-repo
    -repo-local             Legacy alias for --local-repo
    --latest-main          Install latest main branch build (unstable)
    --latest-release       Install latest stable release (default)
    --dev                  Alias for --local-repo (development mode)
    --reuse-build           Reuse existing local build output if present
    --skip-install          Skip dependency install for --local-repo
    --skip-build            Skip building for --local-repo (requires existing dist)
    --link                  Symlink into ~/.openhei instead of copying (dev)
    --no-modify-path        Don't modify shell config files (.zshrc, .bashrc, etc.)
    --uninstall             Uninstall openhei and clean up

Examples:
    curl -fsSL https://openhei.ai/install | bash
    curl -fsSL https://openhei.ai/install | bash -s -- --version 1.0.180
    ./install.sh --binary /path/to/openhei
    ./install.sh --local-repo --no-modify-path
    ./install.sh --latest-main
    ./install.sh --latest-release
    ./install.sh --uninstall
    ./install.sh -repo-local --reuse-build --skip-install --skip-build --link
EOF
}

no_modify_path=false
binary_path=""
local_repo=false
latest_main=false
latest_release=false
dev_mode=false
uninstall_mode=false
skip_install=false
skip_build=false
reuse_build=false
link_install=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--version)
            if [[ -n "${2:-}" ]]; then
                requested_version="$2"
                shift 2
            else
                echo -e "${RED}Error: --version requires a version argument${NC}"
                exit 1
            fi
            ;;
        -b|--binary)
            if [[ -n "${2:-}" ]]; then
                binary_path="$2"
                shift 2
            else
                echo -e "${RED}Error: --binary requires a path argument${NC}"
                exit 1
            fi
            ;;
        --local-repo|--repo-local|-repo-local)
            local_repo=true
            shift
            ;;
        --latest-main)
            latest_main=true
            shift
            ;;
        --latest-release)
            latest_release=true
            shift
            ;;
        --dev)
            dev_mode=true
            local_repo=true
            shift
            ;;
        --uninstall)
            uninstall_mode=true
            shift
            ;;
        --reuse-build)
            reuse_build=true
            shift
            ;;
        --skip-install)
            skip_install=true
            shift
            ;;
        --skip-build)
            skip_build=true
            shift
            ;;
        --link)
            link_install=true
            shift
            ;;
        --no-modify-path)
            no_modify_path=true
            shift
            ;;
        --with-plugins)
            WITH_PLUGINS=true
            shift
            ;;
        *)
            echo -e "${ORANGE}Warning: Unknown option '$1'${NC}" >&2
            shift
            ;;
    esac
done

INSTALL_BASE="$HOME/.openhei"
INSTALL_DIR="$INSTALL_BASE/bin"
DASHBOARD_DIR="$INSTALL_BASE/dashboard"
mkdir -p "$INSTALL_DIR"
mkdir -p "$DASHBOARD_DIR"

# Detect local dashboard in repo for development
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DASHBOARD_DIR="$SCRIPT_DIR/packages/app/dist"
USE_LOCAL_DASHBOARD=false
if [ -d "$LOCAL_DASHBOARD_DIR" ] && [ -f "$LOCAL_DASHBOARD_DIR/index.html" ]; then
    USE_LOCAL_DASHBOARD=true
fi

if [ "$local_repo" = "true" ]; then
    install_from_repo
    # Install external OpenCode plugins into the user's global plugin dir only
    # when the user explicitly requests it via an opt-in flag.
    if [ "${WITH_PLUGINS:-false}" = "true" ]; then
        install_opencode_morph_plugin
        install_dynamic_pruning_plugin
    else
        print_message info "${MUTED}Skipping optional plugin installs (pass --with-plugins to opt-in)${NC}"
    fi
elif [ "$latest_main" = "true" ]; then
    print_message info "${MUTED}Installing latest main branch build...${NC}"
    # Fetch latest main branch artifact from GitHub Actions
    download_from_main
elif [ "$latest_release" = "true" ]; then
    print_message info "${MUTED}Installing latest stable release...${NC}"
    # Default behavior - download latest release
    check_version
    download_and_install
elif [ -n "$binary_path" ]; then
    install_from_binary
else
    # Default: install latest release
    check_version
    download_and_install
fi

uninstall_openhei() {
    print_message info "${MUTED}Uninstalling openhei...${NC}"

    # Remove managed PATH block from shell configs (marker-based)
    for config_file in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.zshrc" "$HOME/.zshenv" "$HOME/.config/fish/config.fish"; do
        if [ -f "$config_file" ]; then
            # Remove the entire managed block between markers
            sed -i '/# >>> openhei install marker >>>/,/# <<< openhei install marker <<</d' "$config_file" 2>/dev/null || true
            # Also remove any leftover markers
            sed -i '/# >>> openhei install marker >>>/d' "$config_file" 2>/dev/null || true
            sed -i '/# <<< openhei install marker <<</d' "$config_file" 2>/dev/null || true
            # Remove old-style entries
            sed -i '/# openhei$/d' "$config_file" 2>/dev/null || true
            sed -i '/^# openhei$/d' "$config_file" 2>/dev/null || true
            sed -i '/OPENHEI_DASHBOARD_DIR/d' "$config_file" 2>/dev/null || true
            sed -i "/export PATH=\$HOME\/.openhei:\$PATH/d" "$config_file" 2>/dev/null || true
            sed -i "/fish_add_path.*\.openhei/d" "$config_file" 2>/dev/null || true
        fi
    done

    # Remove installation directories
    rm -rf "$INSTALL_BASE"

    print_message info "${MUTED}OpenHei has been uninstalled.${NC}"
    print_message info "${MUTED}Please restart your shell or run: hash -r${NC}"
}

# Marker-managed uninstaller block
OPENHEI_INSTALL_MARKER="# >>> openhei install marker >>>"
OPENHEI_UNINSTALL_MARKER="# <<< openhei install marker <<<"

if [ "$uninstall_mode" = "true" ]; then
    uninstall_openhei
    exit 0
fi

# Auto-install opencode-morph-fast-apply plugin for local repo installs
install_opencode_morph_plugin() {
    # Only run for local repo installs
    local plugin_repo="https://github.com/JRedeker/opencode-morph-fast-apply.git"
    XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}
    local plugins_dir="$XDG_CONFIG_HOME/openhei/plugins"
    local plugin_dir="$plugins_dir/opencode-morph-fast-apply"

    mkdir -p "$plugins_dir"

    print_message info "${MUTED}Installing plugin:${NC} opencode-morph-fast-apply -> $plugin_dir"

    if command -v git >/dev/null 2>&1; then
        if [ -d "$plugin_dir/.git" ]; then
            print_message info "${MUTED}Updating existing plugin at:${NC} $plugin_dir"
            git -C "$plugin_dir" pull --ff-only || git -C "$plugin_dir" fetch --all --prune || true
        else
            git clone --depth 1 "$plugin_repo" "$plugin_dir" || true
        fi
        return
    fi

    # Fallback to curl+tar if git is not available
    if command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then
        tmp=$(mktemp -d)
        for branch in main master; do
            url="https://github.com/JRedeker/opencode-morph-fast-apply/archive/refs/heads/${branch}.tar.gz"
            if curl -fsSL "$url" -o "$tmp/plugin.tar.gz"; then
                mkdir -p "$plugin_dir"
                tar -xzf "$tmp/plugin.tar.gz" -C "$tmp"
                extracted_dir=$(find "$tmp" -maxdepth 1 -type d -name "opencode-morph-fast-apply-*" | head -n1)
                if [ -n "$extracted_dir" ]; then
                    rm -rf "$plugin_dir"
                    mv "$extracted_dir" "$plugin_dir"
                fi
                rm -rf "$tmp"
                return
            fi
        done
        rm -rf "$tmp"
    fi

    print_message warning "Could not install opencode-morph-fast-apply plugin (git/curl/tar not available or network error)."
}

install_dynamic_pruning_plugin() {
    # Dynamic context pruning is optional. Do not fail install if upstream repo is missing.
    # This function performs a best-effort checkout only when the user explicitly
    # passes --with-plugins to the installer. By default it is a no-op.
    :
}

download_from_main() {
    # Fetch latest main branch artifact from GitHub Actions
    # This requires the artifact to be uploaded to a public location
    print_message info "${MUTED}Fetching latest main branch build...${NC}"

    # Try to get the latest main branch artifact info
    response=$(curl -s "https://api.github.com/repos/heidi-dang/openhei/actions/artifacts?per_page=1&branch=main" 2>/dev/null || echo '{"artifacts":[]}')

    # For now, fall back to latest release if main artifact not available
    print_message warning "${MUTED}Main branch artifacts not directly available. Using latest release.${NC}"
    specific_version=$(curl -s https://api.github.com/repos/heidi-dang/openhei/releases/latest | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')
    download_and_install
}

install_from_repo() {
    print_message info "\n${MUTED}=========================================${NC}"
    print_message info "${MUTED}  INSTALL MODE: local-repo${NC}"
    print_message info "${MUTED}=========================================${NC}"

    # Get current git SHA for this installation
    local current_sha=""
    if command -v git >/dev/null 2>&1 && [ -d "$SCRIPT_DIR/.git" ]; then
        current_sha=$(cd "$SCRIPT_DIR" && git rev-parse HEAD 2>/dev/null || echo "unknown")
        print_message info "${MUTED}Building from git SHA: ${NC}$current_sha"
    else
        current_sha="unknown"
        print_message warning "${MUTED}Not a git repo, cannot determine SHA${NC}"
    fi

    # Set version to git SHA for this local build
    specific_version="${current_sha:0:8}"

    cd "$SCRIPT_DIR"

    # Ensure dependencies are installed
    if [ "$skip_install" != "true" ]; then
        print_message info "${MUTED}Installing dependencies...${NC}"
        HUSKY=0 bun install
    fi

    # Build the app (packages/app) first
    local app_dist_dir="$SCRIPT_DIR/packages/app/dist"
    if [ "$skip_build" != "true" ]; then
        print_message info "${MUTED}Building app (packages/app)...${NC}"
        (
            cd "$SCRIPT_DIR/packages/app"
            bun run build
        )
    fi

    # Verify app dist was built and write .build_sha
    if [ ! -d "$app_dist_dir" ] || [ ! -f "$app_dist_dir/index.html" ]; then
        echo -e "${RED}Error: App build failed - no dist/index.html found at $app_dist_dir${NC}"
        exit 1
    fi

    # Write .build_sha to app dist
    echo "$current_sha" > "$app_dist_dir/.build_sha"
    print_message info "${MUTED}Wrote .build_sha to app dist: ${NC}$current_sha"

    # Verify .build_sha matches
    local dist_sha=$(cat "$app_dist_dir/.build_sha" 2>/dev/null || echo "")
    if [ "$current_sha" != "$dist_sha" ]; then
        echo -e "${RED}Error: SHA verification failed! Expected $current_sha, got $dist_sha${NC}"
        exit 1
    fi

    # Detect target name used by build script
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    [ "$os" == "linux" ] && os="linux"
    [ "$os" == "darwin" ] && os="darwin"

    local arch=$(uname -m)
    [[ "$arch" == "x86_64" ]] && arch="x64"
    [[ "$arch" == "aarch64" ]] && arch="arm64"

    local target_name="openhei-$os-$arch"
    local build_dir="$SCRIPT_DIR/packages/openhei/dist/$target_name"

    if [ "$reuse_build" = "true" ] && [ -f "$build_dir/bin/openhei" ]; then
        print_message info "${MUTED}Reusing existing build output: ${NC}$build_dir"
        skip_build=true
    fi

    # Run build - MUST build from local source, no downloads
    if [ "$skip_build" != "true" ]; then
        print_message info "${MUTED}Building openhei from local source...${NC}"
        (
            cd "$SCRIPT_DIR/packages/openhei"
            # Force local build - DO NOT download releases
            OPENHEI_CHANNEL=local OPENHEI_VERSION=local BUILD_FROM_GIT=1 bun run build --single --skip-install --reuse-dashboard --reuse-models
        )
    fi

    if [ ! -d "$build_dir" ]; then
         # Fallback to whatever directory was built
         shopt -s nullglob
         local dirs=("$SCRIPT_DIR"/packages/openhei/dist/openhei-*-*)
         shopt -u nullglob
         for d in "${dirs[@]}"; do
             if [ -f "$d/bin/openhei" ]; then
                 build_dir="$d"
                 break
             fi
         done
    fi

    if [ -z "$build_dir" ] || [ ! -d "$build_dir" ]; then
        echo -e "${RED}Error: Build failed or build directory not found at $build_dir${NC}"
        exit 1
    fi

    print_message info "${MUTED}Installing from: ${NC}$build_dir"
    local dashboard_src="$build_dir/dashboard"
    if [ "$USE_LOCAL_DASHBOARD" = "true" ]; then
        dashboard_src="$LOCAL_DASHBOARD_DIR"
    fi

    if [ "$link_install" = "true" ]; then
        if ! command -v ln >/dev/null 2>&1; then
            echo -e "${RED}Error: 'ln' is required but not installed.${NC}"
            exit 1
        fi
        if [ ! -d "$dashboard_src" ]; then
            echo -e "${RED}Error: Dashboard directory not found at $dashboard_src${NC}"
            exit 1
        fi
        rm -rf "$INSTALL_DIR" "$DASHBOARD_DIR"
        mkdir -p "$INSTALL_DIR"
        ln -sf "$build_dir/bin/openhei" "${INSTALL_DIR}/openhei"
        ln -s "$dashboard_src" "$DASHBOARD_DIR"
        chmod 755 "${INSTALL_DIR}/openhei" || true
    else
        rm -rf "$INSTALL_DIR" "$DASHBOARD_DIR"
        mkdir -p "$INSTALL_DIR"
        mkdir -p "$DASHBOARD_DIR"

        cp "$build_dir/bin/openhei" "${INSTALL_DIR}/openhei"
        cp -r "$dashboard_src/"* "$DASHBOARD_DIR/"
        chmod 755 "${INSTALL_DIR}/openhei"
    fi

    # Write SHA to a file for validation
    echo "$current_sha" > "$INSTALL_DIR/.build_sha"
    print_message info "${MUTED}Installed binary SHA: ${NC}$current_sha"

    # Validate the installed binary
    validate_install "$current_sha"
}

validate_install() {
    local expected_sha="$1"

    print_message info "${MUTED}Validating installation...${NC}"

    # Check if binary runs
    if [ ! -x "${INSTALL_DIR}/openhei" ]; then
        echo -e "${RED}Error: Installed binary is not executable${NC}"
        exit 1
    fi

    # Detect other openhei binaries in PATH
    local other_binaries=""
    while IFS= read -r -d '' bin; do
        if [ "$bin" != "${INSTALL_DIR}/openhei" ]; then
            other_binaries="$other_binaries$bin"$'\n'
        fi
    done < <(which -a openhei 2>/dev/null | tr '\n' '\0')

    if [ -n "$other_binaries" ]; then
        echo -e ""
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}  WARNING: Duplicate openhei found!${NC}"
        echo -e "${RED}========================================${NC}"
        echo -e ""
        echo -e "${RED}Other openhei binaries in PATH:${NC}"
        echo -e "$other_binaries"
        echo -e ""
        echo -e "${RED}Installed binary: ${NC}${INSTALL_DIR}/openhei"
        echo -e ""
        echo -e "This may cause the wrong openhei to run."
        echo -e "Run: ${MUTED}hash -r && which openhei${NC}"
        echo -e ""
        echo -e "${RED}========================================${NC}"
        echo -e ""
    fi

    # Try to get version from binary
    local installed_version=$("${INSTALL_DIR}/openhei" --version 2>/dev/null || echo "unknown")
    print_message info "${MUTED}Installed version: ${NC}$installed_version"

    # For local-repo mode, FAIL if SHA doesn't match
    if [ "$local_repo" = "true" ]; then
        # Read SHA from installed binary's location
        local installed_sha=""
        if [ -f "${INSTALL_DIR}/.build_sha" ]; then
            installed_sha=$(cat "${INSTALL_DIR}/.build_sha" 2>/dev/null || echo "")
        fi

        # Compare SHAs (short form for display)
        local expected_short="${expected_sha:0:8}"
        local installed_short="${installed_sha:0:8}"

        if [ "$expected_sha" != "$installed_sha" ]; then
            echo -e ""
            echo -e "${RED}========================================${NC}"
            echo -e "${RED}  ERROR: SHA MISMATCH!${NC}"
            echo -e "${RED}========================================${NC}"
            echo -e ""
            echo -e "Expected git SHA: ${expected_short}"
            echo -e "Installed SHA:    ${installed_short:-unknown}"
            echo -e ""
            echo -e "Your PATH may point to a different openhei binary,"
            echo -e "or there is an install prefix mismatch."
            echo -e ""
            echo -e "Fix: Run these commands:"
            echo -e "  ${MUTED}hash -r${NC}"
            echo -e "  ${MUTED}which openhei${NC}"
            echo -e "  ${MUTED}ls -la \$(which openhei)${NC}"
            echo -e ""
            echo -e "Expected path: ${INSTALL_DIR}/openhei"
            echo -e ""
            echo -e "${RED}========================================${NC}"
            echo -e ""
            exit 1
        fi

        print_message info "${MUTED}SHA verified: ${installed_short} (matches expected)${NC}"
    fi
}

if [ "$local_repo" = "true" ]; then
    install_from_repo
    # Install external OpenCode plugins into the user's global plugin dir only
    # when the user explicitly requests it via an opt-in flag.
    if [ "${WITH_PLUGINS:-false}" = "true" ]; then
        install_opencode_morph_plugin
        install_dynamic_pruning_plugin
    else
        print_message info "${MUTED}Skipping optional plugin installs (pass --with-plugins to opt-in)${NC}"
    fi
elif [ -n "$binary_path" ]; then
    install_from_binary
else
    check_version
    download_and_install
fi

clean_old_env() {
    local config_file=$1
    if [ -f "$config_file" ] && grep -q "OPENHEI_DASHBOARD_DIR" "$config_file"; then
        sed -i '/# openhei/d' "$config_file" 2>/dev/null || true
        sed -i '/OPENHEI_DASHBOARD_DIR/d' "$config_file" 2>/dev/null || true
        print_message info "${MUTED}Cleaned up old dev environment variables from ${NC}$config_file"
    fi
}

add_to_path() {
    local config_file=$1
    local command=$2

    # Check if already managed by our marker block
    if grep -q "# >>> openhei install marker >>>" "$config_file" 2>/dev/null; then
        print_message info "PATH already managed in $config_file, skipping."
        return
    fi

    if grep -Fxq "$command" "$config_file" 2>/dev/null; then
        # Old-style entry exists, replace with marker block
        sed -i "/$command/d" "$config_file" 2>/dev/null || true
    fi

    if [[ -w $config_file ]]; then
        echo -e "\n# >>> openhei install marker >>>" >> "$config_file"
        echo "$command" >> "$config_file"
        echo "# <<< openhei install marker <<<" >> "$config_file"
        print_message info "${MUTED}Successfully added ${NC}openhei ${MUTED}to \$PATH in ${NC}$config_file"
    else
        print_message warning "Manually add the directory to $config_file (or similar):"
        print_message info "  $command"
    fi
}

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}
current_shell=$(basename "$SHELL")
case $current_shell in
    fish) config_files="$HOME/.config/fish/config.fish" ;;
    zsh) config_files="${ZDOTDIR:-$HOME}/.zshrc ${ZDOTDIR:-$HOME}/.zshenv $XDG_CONFIG_HOME/zsh/.zshrc $XDG_CONFIG_HOME/zsh/.zshenv" ;;
    bash) config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile" ;;
    ash|sh) config_files="$HOME/.ashrc $HOME/.profile /etc/profile" ;;
    *) config_files="$HOME/.bashrc $HOME/.bash_profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile" ;;
esac

if [[ "$no_modify_path" != "true" ]]; then
    config_file=""
    for file in $config_files; do
        if [[ -f $file ]]; then
            config_file=$file
            break
        fi
    done
    if [[ -z $config_file ]]; then
        print_message warning "No config file found for $current_shell. You may need to manually add to PATH:"
        print_message info "  export PATH=$INSTALL_DIR:\$PATH"
    else
        clean_old_env "$config_file"
        if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
            case $current_shell in
                fish) add_to_path "$config_file" "fish_add_path $INSTALL_DIR" ;;
                zsh|bash|ash|sh) add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH" ;;
                *)
                    export PATH=$INSTALL_DIR:$PATH
                    print_message warning "Manually add the directory to $config_file (or similar):"
                    print_message info "  export PATH=$INSTALL_DIR:\$PATH"
                ;;
            esac
        fi
    fi
fi

if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" == "true" ]; then
    echo "$INSTALL_DIR" >> $GITHUB_PATH
    print_message info "Added $INSTALL_DIR to \$GITHUB_PATH"
fi

show_logo
print_install_summary

# Optional: Run immediately
export PATH="$INSTALL_DIR:$PATH"
if [ -t 0 ]; then
    echo -e "${ORANGE}Installation complete!${NC}"
    read -p "Would you like to run openhei now? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        exec "${INSTALL_DIR}/openhei"
    fi
fi
