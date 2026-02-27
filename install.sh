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
     --reuse-build           Reuse existing local build output if present
     --skip-install          Skip dependency install for --local-repo
     --skip-build            Skip building for --local-repo (requires existing dist)
     --link                  Symlink into ~/.openhei instead of copying (dev)
        --no-modify-path    Don't modify shell config files (.zshrc, .bashrc, etc.)

Examples:
    curl -fsSL https://openhei.ai/install | bash
    curl -fsSL https://openhei.ai/install | bash -s -- --version 1.0.180
    ./install.sh --binary /path/to/openhei
    ./install.sh --local-repo --no-modify-path
    ./install.sh -repo-local --reuse-build --skip-install --skip-build --link
EOF
}

no_modify_path=false
binary_path=""
local_repo=false
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
    specific_version="local"
elif [ -n "$binary_path" ]; then
    if [ ! -f "$binary_path" ]; then
        echo -e "${RED}Error: Binary not found at ${binary_path}${NC}"
        exit 1
    fi
    specific_version="local"
else
    raw_os=$(uname -s)
    os=$(echo "$raw_os" | tr '[:upper:]' '[:lower:]')
    case "$raw_os" in
      Darwin*) os="darwin" ;;
      Linux*) os="linux" ;;
      MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    esac

    arch=$(uname -m)
    if [[ "$arch" == "aarch64" ]]; then
      arch="arm64"
    fi
    if [[ "$arch" == "x86_64" ]]; then
      arch="x64"
    fi

    if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
      rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
      if [ "$rosetta_flag" = "1" ]; then
        arch="arm64"
      fi
    fi

    combo="$os-$arch"
    case "$combo" in
      linux-x64|linux-arm64|darwin-x64|darwin-arm64|windows-x64)
        ;;
      *)
        echo -e "${RED}Unsupported OS/Arch: $os/$arch${NC}"
        exit 1
        ;;
    esac

    archive_ext=".zip"
    if [ "$os" = "linux" ]; then
      archive_ext=".tar.gz"
    fi

    is_musl=false
    if [ "$os" = "linux" ]; then
      if [ -f /etc/alpine-release ]; then
        is_musl=true
      fi

      if command -v ldd >/dev/null 2>&1; then
        if ldd --version 2>&1 | grep -qi musl; then
          is_musl=true
        fi
      fi
    fi

    needs_baseline=false
    if [ "$arch" = "x64" ]; then
      if [ "$os" = "linux" ]; then
        if ! grep -qwi avx2 /proc/cpuinfo 2>/dev/null; then
          needs_baseline=true
        fi
      fi

      if [ "$os" = "darwin" ]; then
        avx2=$(sysctl -n hw.optional.avx2_0 2>/dev/null || echo 0)
        if [ "$avx2" != "1" ]; then
          needs_baseline=true
        fi
      fi

      if [ "$os" = "windows" ]; then
        ps="(Add-Type -MemberDefinition \"[DllImport(\"\"kernel32.dll\"\")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);\" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)"
        out=""
        if command -v powershell.exe >/dev/null 2>&1; then
          out=$(powershell.exe -NoProfile -NonInteractive -Command "$ps" 2>/dev/null || true)
        elif command -v pwsh >/dev/null 2>&1; then
          out=$(pwsh -NoProfile -NonInteractive -Command "$ps" 2>/dev/null || true)
        fi
        out=$(echo "$out" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
        if [ "$out" != "true" ] && [ "$out" != "1" ]; then
          needs_baseline=true
        fi
      fi
    fi

    target="$os-$arch"
    if [ "$needs_baseline" = "true" ]; then
      target="$target-baseline"
    fi
    if [ "$is_musl" = "true" ]; then
      target="$target-musl"
    fi

    filename="$APP-$target$archive_ext"

    if [ "$os" = "linux" ]; then
        if ! command -v tar >/dev/null 2>&1; then
             echo -e "${RED}Error: 'tar' is required but not installed.${NC}"
             exit 1
        fi
    else
        if ! command -v unzip >/dev/null 2>&1; then
            echo -e "${RED}Error: 'unzip' is required but not installed.${NC}"
            exit 1
        fi
    fi

    if [ -z "$requested_version" ]; then
        # Fetch latest version from API
        response=$(curl -s https://api.github.com/repos/heidi-dang/openhei/releases/latest)
        specific_version=$(echo "$response" | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')

        if [ -z "$specific_version" ]; then
            echo -e "${RED}Error: No releases found for heidi-dang/openhei${NC}"
            echo -e "${ORANGE}Since this is a new repo, you need to create your first GitHub Release.${NC}"
            echo -e "${MUTED}For more info: https://github.com/heidi-dang/openhei/releases${NC}"
            exit 1
        fi
        url="https://github.com/heidi-dang/openhei/releases/download/v${specific_version}/$filename"
    else
        # Strip leading 'v' if present
        requested_version="${requested_version#v}"
        url="https://github.com/heidi-dang/openhei/releases/download/v${requested_version}/$filename"
        specific_version=$requested_version

        # Verify the release exists before downloading
        http_status=$(curl -sI -o /dev/null -w "%{http_code}" "https://github.com/heidi-dang/openhei/releases/tag/v${requested_version}")
        if [ "$http_status" = "404" ]; then
            echo -e "${RED}Error: Release v${requested_version} not found${NC}"
            echo -e "${MUTED}Available releases: https://github.com/heidi-dang/openhei/releases${NC}"
            exit 1
        fi
    fi

    # Verify asset exists before attempting download - use -L to follow redirects if necessary
    asset_check=$(curl -sLI "$url" | grep -Ei "^HTTP/" | awk '{print $2}' | tail -n 1 || echo "failed")
    if [ "$asset_check" != "200" ]; then
        echo -e "${RED}Error: Binary asset '$filename' not found at $url (Status: $asset_check)${NC}"
        echo -e "${ORANGE}Please check that the binaries are correctly uploaded to the release.${NC}"
        exit 1
    fi
fi

print_message() {
    local level=$1
    local message=$2
    local color=""
    case $level in
        info) color="${NC}" ;;
        warning) color="${NC}" ;;
        error) color="${RED}" ;;
    esac
    echo -e "${color}${message}${NC}"
}

check_version() {
    if command -v openhei >/dev/null 2>&1; then
        openhei_path=$(which openhei)
        installed_version=$(openhei --version 2>/dev/null || echo "")
        if [[ "$installed_version" == "$specific_version" ]]; then
            echo -e "${NC}Version $specific_version already installed at $openhei_path${NC}"
            show_logo
            exit 0
        fi
    fi
}

unbuffered_sed() {
    if echo | sed -u -e "" >/dev/null 2>&1; then
        sed -nu "$@"
    elif echo | sed -l -e "" >/dev/null 2>&1; then
        sed -nl "$@"
    else
        local pad="$(printf "\n%512s" "")"
        sed -ne "s/$/\\${pad}/" "$@"
    fi
}

print_progress() {
    local bytes="$1"
    local length="$2"
    [ "$length" -gt 0 ] || return 0
    local width=50
    local percent=$(( bytes * 100 / length ))
    [ "$percent" -gt 100 ] && percent=100
    local on=$(( percent * width / 100 ))
    local off=$(( width - on ))
    local filled=$(printf "%*s" "$on" "")
    filled=${filled// /■}
    local empty=$(printf "%*s" "$off" "")
    empty=${empty// /･}
    printf "\r${ORANGE}%s%s %3d%%${NC}" "$filled" "$empty" "$percent" >&4
}

download_with_progress() {
    local url="$1"
    local output="$2"
    if [ -t 2 ]; then
        exec 4>&2
    else
        exec 4>/dev/null
    fi
    local tmp_dir=${TMPDIR:-/tmp}
    local basename="${tmp_dir}/openhei_install_$$"
    local tracefile="${basename}.trace"
    rm -f "$tracefile"
    mkfifo "$tracefile"
    printf "\033[?25l" >&4
    trap "trap - RETURN; rm -f \"$tracefile\"; printf '\033[?25h' >&4; exec 4>&-" RETURN
    (
        curl --trace-ascii "$tracefile" -s -L -o "$output" "$url"
    ) &
    local curl_pid=$!
    unbuffered_sed \
        -e 'y/ACDEGHLNORTV/acdeghlnortv/' \
        -e '/^0000: content-length:/p' \
        -e '/^<= recv data/p' \
        "$tracefile" | \
    {
        local length=0
        local bytes=0
        while IFS=" " read -r -a line; do
            [ "${#line[@]}" -lt 2 ] && continue
            local tag="${line[0]} ${line[1]}"
            if [ "$tag" = "0000: content-length:" ]; then
                length="${line[2]}"
                length=$(echo "$length" | tr -d '\r')
                bytes=0
            elif [ "$tag" = "<= recv" ]; then
                local size="${line[3]}"
                bytes=$(( bytes + size ))
                if [ "$length" -gt 0 ]; then
                    print_progress "$bytes" "$length"
                fi
            fi
        done
    }
    wait $curl_pid
    local ret=$?
    echo "" >&4
    return $ret
}

download_and_install() {
    print_message info "\n${MUTED}Installing ${NC}openhei ${MUTED}version: ${NC}$specific_version"
    local tmp_dir="${TMPDIR:-/tmp}/openhei_install_$$"
    mkdir -p "$tmp_dir"
    if [[ "$os" == "windows" ]] || ! [ -t 2 ] || ! download_with_progress "$url" "$tmp_dir/$filename"; then
        curl -# -L -o "$tmp_dir/$filename" "$url"
    fi
    if [ "$os" = "linux" ]; then
        tar -xzf "$tmp_dir/$filename" -C "$tmp_dir"
    else
        unzip -q "$tmp_dir/$filename" -d "$tmp_dir"
    fi

    # Support both new bundled structure (bin/, dashboard/) and legacy flat structure
    rm -rf "$INSTALL_DIR" "$DASHBOARD_DIR"
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$DASHBOARD_DIR"

    if [ -d "$tmp_dir/bin" ]; then
        mv "$tmp_dir/bin"/* "$INSTALL_DIR/"
    elif [ -f "$tmp_dir/openhei" ]; then
        mv "$tmp_dir/openhei" "$INSTALL_DIR/"
    elif [ -f "$tmp_dir/openhei.exe" ]; then
        mv "$tmp_dir/openhei.exe" "$INSTALL_DIR/"
    fi

    if [ -d "$tmp_dir/dashboard" ]; then
        mv "$tmp_dir/dashboard"/* "$DASHBOARD_DIR/"
    fi

    chmod 755 "${INSTALL_DIR}/openhei" 2>/dev/null || chmod 755 "${INSTALL_DIR}/openhei.exe" 2>/dev/null || true
    rm -rf "$tmp_dir"
}

install_from_binary() {
    print_message info "\n${MUTED}Installing ${NC}openhei ${MUTED}from: ${NC}$binary_path"
    # When installing from a local binary, we don't necessarily have a dashboard folder
    # but we'll try to find it relative to the binary
    cp "$binary_path" "${INSTALL_DIR}/openhei"
    local src_dir=$(dirname "$binary_path")
    if [ -d "$src_dir/../dashboard" ]; then
        cp -r "$src_dir/../dashboard" "$DASHBOARD_DIR"
    fi
    chmod 755 "${INSTALL_DIR}/openhei"
}

install_from_repo() {
    print_message info "\n${MUTED}Building openhei from source...${NC}"
    cd "$SCRIPT_DIR"

    # Ensure dependencies are installed
    if [ "$skip_install" != "true" ]; then
        HUSKY=0 bun install
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

    # Run build - removing --cwd and using relative path to avoid context issues
    if [ "$skip_build" != "true" ]; then
        (
            cd "$SCRIPT_DIR/packages/openhei"
            OPENHEI_CHANNEL=local OPENHEI_VERSION=local bun run build --single --skip-install --reuse-dashboard --reuse-models
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
        return
    fi

    rm -rf "$INSTALL_DIR" "$DASHBOARD_DIR"
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$DASHBOARD_DIR"

    cp "$build_dir/bin/openhei" "${INSTALL_DIR}/openhei"
    cp -r "$dashboard_src/"* "$DASHBOARD_DIR/"
    chmod 755 "${INSTALL_DIR}/openhei"
}

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
    if grep -Fxq "$command" "$config_file"; then
        print_message info "Command already exists in $config_file, skipping write."
    elif [[ -w $config_file ]]; then
        echo -e "\n# openhei" >> "$config_file"
        echo "$command" >> "$config_file"
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
