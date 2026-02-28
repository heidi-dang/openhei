#!/usr/bin/env bash
set -Eeuo pipefail

APP="openhei"
REPO_OWNER="heidi-dang"
REPO_NAME="openhei"
REPO_SLUG="${REPO_OWNER}/${REPO_NAME}"

# ---------- UI ----------
if [[ -t 1 ]]; then
  MUTED=$'\033[0;2m'
  RED=$'\033[0;31m'
  ORANGE=$'\033[38;5;214m'
  GRN=$'\033[0;32m'
  CYN=$'\033[0;36m'
  NC=$'\033[0m'
else
  MUTED=""; RED=""; ORANGE=""; GRN=""; CYN=""; NC=""
fi

print_message() {
  local level="${1:-info}"; shift || true
  local prefix="[INFO]" color="$CYN"
  case "$level" in
    info) prefix="[INFO]"; color="$CYN" ;;
    ok|success) prefix="[ OK ]"; color="$GRN" ;;
    warn|warning) prefix="[WARN]"; color="$ORANGE" ;;
    fail|error) prefix="[FAIL]"; color="$RED" ;;
  esac
  echo -e "${color}${prefix}${NC} $*"
}

die() { print_message fail "$*"; exit 1; }

show_logo() {
  echo -e ""
  echo -e "${MUTED}█▀▀█ █▀▀█ █▀▀█ █▀▀▄ ${NC}█░░█ █▀▀▀ ░█░░"
  echo -e "${MUTED}█░░█ █░░█ █▀▀▀ █░░█ ${NC}█▀▀█ █▀▀▀ ░█░░"
  echo -e "${MUTED}▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀  ▀ ${NC}▀  ▀ ▀▀▀▀ ▀▀▀▀${NC}"
  echo -e ""
}

usage() {
  cat <<EOF
OpenHei Installer

Usage: ./install.sh [options]

Options:
  -h, --help              Show help
  --latest-release         Install latest stable release (default)
  --latest-main            Install latest main build (best-effort; may fall back)
  -v, --version <ver>      Install a specific version tag (e.g., 1.0.180 or v1.0.180)
  -b, --binary <path>      Install from a local binary
  --local-repo             Build + install from current repo (bun required)
  --repo-local             Alias for --local-repo
  -repo-local              Legacy alias for --local-repo
  --dev                    Alias for --local-repo
  --reuse-build            Reuse existing packages/openhei/dist build output if present
  --skip-install           Skip bun install in --local-repo mode
  --skip-build             Skip builds in --local-repo mode (requires existing dist)
  --link                   Symlink install (dev convenience) instead of copy
  --no-modify-path         Don't edit shell rc files
  --uninstall              Uninstall openhei (removes ~/.openhei and PATH markers)
  --with-plugins           Optional plugin installs (best-effort)

Examples:
  ./install.sh
  ./install.sh --latest-main
  ./install.sh --version 1.2.3
  ./install.sh --binary ./openhei
  ./install.sh --local-repo --skip-install
  ./install.sh --uninstall
EOF
}

# ---------- config ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INSTALL_BASE="${HOME}/.openhei"
INSTALL_DIR="${INSTALL_BASE}/bin"
DASHBOARD_DIR="${INSTALL_BASE}/dashboard"

OPENHEI_INSTALL_MARKER="# >>> openhei install marker >>>"
OPENHEI_UNINSTALL_MARKER="# <<< openhei install marker <<<"

mkdir -p "$INSTALL_DIR" "$DASHBOARD_DIR"

# ---------- flags ----------
no_modify_path=false
binary_path=""
local_repo=false
latest_main=false
latest_release=false
uninstall_mode=false
skip_install=false
skip_build=false
reuse_build=false
link_install=false
WITH_PLUGINS=false
requested_version=""

# ---------- args ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --latest-release) latest_release=true; shift ;;
    --latest-main) latest_main=true; shift ;;
    -v|--version)
      [[ -n "${2:-}" ]] || die "--version requires an argument"
      requested_version="$2"; shift 2 ;;
    -b|--binary|--bin)
      [[ -n "${2:-}" ]] || die "--binary requires a path"
      binary_path="$2"; shift 2 ;;
    --local-repo|--repo-local|-repo-local|--dev) local_repo=true; shift ;;
    --uninstall) uninstall_mode=true; shift ;;
    --reuse-build) reuse_build=true; shift ;;
    --skip-install) skip_install=true; shift ;;
    --skip-build) skip_build=true; shift ;;
    --link) link_install=true; shift ;;
    --no-modify-path) no_modify_path=true; shift ;;
    --with-plugins) WITH_PLUGINS=true; shift ;;
    *)
      print_message warn "Unknown option '$1' (ignoring)"
      shift ;;
  esac
done

# default behavior
if [[ "$latest_main" != "true" && "$latest_release" != "true" && -z "$requested_version" && -z "$binary_path" && "$local_repo" != "true" && "$uninstall_mode" != "true" ]]; then
  latest_release=true
fi

# ---------- deps ----------
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }
need_cmd_for_net() { [[ -n "${NO_NET:-}" ]] && die "Network disabled (NO_NET set)"; need_cmd curl; }

detect_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$os" in
    linux) os="linux" ;;
    darwin) os="darwin" ;;
    *) die "Unsupported OS: $os" ;;
  esac

  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "Unsupported arch: $arch" ;;
  esac

  echo "${os}" "${arch}"
}

# ---------- PATH management ----------
clean_old_env() {
  local config_file="$1"
  [[ -f "$config_file" ]] || return 0
  # remove marker block
  sed -i '/# >>> openhei install marker >>>/,/# <<< openhei install marker <<</d' "$config_file" 2>/dev/null || true
  # remove a few historic entries
  sed -i '/OPENHEI_DASHBOARD_DIR/d' "$config_file" 2>/dev/null || true
  sed -i "/export PATH=.*\\.openhei\\/bin/d" "$config_file" 2>/dev/null || true
  sed -i "/fish_add_path.*\\.openhei\\/bin/d" "$config_file" 2>/dev/null || true
}

add_to_path_block() {
  local config_file="$1"
  local line="$2"
  [[ -f "$config_file" ]] || return 0
  grep -qF "$OPENHEI_INSTALL_MARKER" "$config_file" 2>/dev/null && return 0

  {
    echo ""
    echo "$OPENHEI_INSTALL_MARKER"
    echo "# managed by openhei install.sh"
    echo "$line"
    echo "$OPENHEI_UNINSTALL_MARKER"
  } >> "$config_file"
}

maybe_modify_path() {
  $no_modify_path && { print_message info "${MUTED}--no-modify-path set; skipping PATH edits${NC}"; return 0; }

  local shell_name config_file=""
  shell_name="$(basename "${SHELL:-sh}")"

  case "$shell_name" in
    zsh) config_file="$HOME/.zshrc" ;;
    bash) config_file="$HOME/.bashrc" ;;
    fish) config_file="$HOME/.config/fish/config.fish" ;;
    *)
      # try common fallbacks
      if [[ -f "$HOME/.profile" ]]; then config_file="$HOME/.profile"; fi
      ;;
  esac

  if [[ -z "$config_file" ]]; then
    print_message warn "Could not determine shell rc file. Add to PATH manually:"
    print_message info "  export PATH=\"$INSTALL_DIR:\$PATH\""
    return 0
  fi

  mkdir -p "$(dirname "$config_file")" || true
  touch "$config_file" || true
  clean_old_env "$config_file"

  if [[ "$shell_name" == "fish" ]]; then
    add_to_path_block "$config_file" "fish_add_path \"$INSTALL_DIR\""
  else
    add_to_path_block "$config_file" "export PATH=\"$INSTALL_DIR:\$PATH\""
  fi

  print_message ok "PATH marker written to $config_file"
  print_message info "${MUTED}Restart shell or run: hash -r${NC}"
}

# ---------- install helpers ----------
install_files_from_dir() {
  local build_dir="$1"
  local dashboard_src="$2"

  [[ -x "$build_dir/bin/openhei" ]] || die "Missing binary: $build_dir/bin/openhei"
  [[ -d "$dashboard_src" ]] || die "Missing dashboard dir: $dashboard_src"

  rm -rf "$INSTALL_DIR" "$DASHBOARD_DIR"
  mkdir -p "$INSTALL_DIR" "$DASHBOARD_DIR"

  if [[ "$link_install" == "true" ]]; then
    ln -sf "$build_dir/bin/openhei" "$INSTALL_DIR/openhei"
    ln -snf "$dashboard_src" "$DASHBOARD_DIR"
  else
    cp -f "$build_dir/bin/openhei" "$INSTALL_DIR/openhei"
    cp -a "$dashboard_src/." "$DASHBOARD_DIR/"
  fi

  chmod 755 "$INSTALL_DIR/openhei" || true
}

validate_install() {
  [[ -x "$INSTALL_DIR/openhei" ]] || die "Installed binary not executable: $INSTALL_DIR/openhei"
  local v
  v="$("$INSTALL_DIR/openhei" --version 2>/dev/null || true)"
  print_message ok "Installed: $INSTALL_DIR/openhei"
  print_message info "openhei --version: ${v:-unknown}"
}

# ---------- GitHub release download ----------
normalize_tag() {
  local t="$1"
  [[ "$t" == v* ]] && echo "$t" || echo "v$t"
}

gh_api_get() {
  local url="$1"
  need_cmd_for_net
  curl -fsSL -H "Accept: application/vnd.github+json" "$url"
}

pick_asset_url() {
  # Input: JSON (single release object). Output: best asset URL or empty.
  # We avoid jq by using a conservative grep/sed approach.
  local json="$1"
  local os="$2" arch="$3"

  # Prefer tar.gz, then zip.
  # Match common names like: openhei-linux-x64.tar.gz / openhei-darwin-arm64.zip etc.
  local patterns=(
    "${APP}-${os}-${arch}.*tar\\.gz"
    "${APP}-${os}-${arch}.*zip"
  )

  local best=""
  for pat in "${patterns[@]}"; do
    best="$(printf "%s" "$json" \
      | tr '\n' ' ' \
      | sed -E 's/},{/},\n{/g' \
      | grep -E "\"name\" *: *\"${pat}\"" -m1 -B2 -A6 \
      | sed -nE 's/.*"browser_download_url" *: *"([^"]+)".*/\1/p' \
      | head -n1 || true)"
    [[ -n "$best" ]] && { echo "$best"; return 0; }
  done

  echo ""
}

download_release_asset() {
  local tag="$1"
  local os="$2" arch="$3"
  local api_url="https://api.github.com/repos/${REPO_SLUG}/releases/tags/${tag}"
  local json
  json="$(gh_api_get "$api_url")" || die "Failed to fetch release tag: $tag"

  local url
  url="$(pick_asset_url "$json" "$os" "$arch")"
  [[ -n "$url" ]] || die "Could not find a release asset for ${APP}-${os}-${arch} in tag ${tag}"

  print_message info "Downloading: $url"
  local tmpdir
  tmpdir="$(mktemp -d)"
  local out="$tmpdir/asset"
  curl -fL --retry 3 --retry-delay 1 -o "$out" "$url"

  echo "$tmpdir" "$out"
}

extract_and_install_asset() {
  local tmpdir="$1"
  local asset="$2"

  local work="$tmpdir/extract"
  mkdir -p "$work"

  if file "$asset" | grep -qi 'gzip'; then
    need_cmd tar
    tar -xzf "$asset" -C "$work"
  elif file "$asset" | grep -qi 'zip'; then
    need_cmd unzip
    unzip -q "$asset" -d "$work"
  else
    die "Unknown asset format (expected .tar.gz or .zip): $asset"
  fi

  # Find a directory containing bin/openhei
  local build_dir=""
  while IFS= read -r d; do
    if [[ -x "$d/bin/openhei" ]]; then
      build_dir="$d"
      break
    fi
  done < <(find "$work" -type d -maxdepth 4 2>/dev/null)

  [[ -n "$build_dir" ]] || die "Extracted asset did not contain bin/openhei"

  # Dashboard location: prefer "$build_dir/dashboard", else "$build_dir/packages/app/dist" style fallback
  local dash="$build_dir/dashboard"
  if [[ ! -d "$dash" ]]; then
    # search for dist/index.html
    local dist=""
    dist="$(find "$build_dir" -type f -name index.html -path '*dist/index.html' 2>/dev/null | head -n1 || true)"
    [[ -n "$dist" ]] && dash="$(dirname "$dist")"
  fi
  [[ -d "$dash" ]] || die "Could not find dashboard in extracted asset"

  install_files_from_dir "$build_dir" "$dash"
}

check_version() {
  local os="$1" arch="$2"

  if [[ -n "$requested_version" ]]; then
    specific_tag="$(normalize_tag "$requested_version")"
    print_message info "Requested version: $specific_tag"
    return 0
  fi

  if [[ "$latest_release" == "true" || "$latest_main" == "true" ]]; then
    local json tag
    json="$(gh_api_get "https://api.github.com/repos/${REPO_SLUG}/releases/latest")" || die "Failed to fetch latest release"
    tag="$(printf "%s" "$json" | sed -nE 's/.*"tag_name" *: *"([^"]+)".*/\1/p' | head -n1)"
    [[ -n "$tag" ]] || die "Could not parse latest tag_name"
    specific_tag="$tag"
    print_message info "Latest release tag: $specific_tag"
    return 0
  fi

  die "Internal: check_version called without a mode"
}

download_and_install() {
  local os="$1" arch="$2"
  local tag="$3"

  local tmpdir asset
  read -r tmpdir asset < <(download_release_asset "$tag" "$os" "$arch")

  extract_and_install_asset "$tmpdir" "$asset"
  rm -rf "$tmpdir" || true
}

download_from_main() {
  # Best-effort: if main artifacts not publicly published, we fall back.
  print_message warn "Main artifacts are not guaranteed public. Falling back to latest release."
  latest_release=true
}

install_from_binary() {
  local src="$1"
  [[ -f "$src" ]] || die "Binary not found: $src"
  mkdir -p "$INSTALL_DIR" "$DASHBOARD_DIR"
  cp -f "$src" "$INSTALL_DIR/openhei"
  chmod 755 "$INSTALL_DIR/openhei" || true
  print_message warn "Installed binary only. Dashboard not installed (no dist)."
}

install_opencode_morph_plugin() {
  local plugin_repo="https://github.com/JRedeker/opencode-morph-fast-apply.git"
  local xdg="${XDG_CONFIG_HOME:-$HOME/.config}"
  local plugins_dir="$xdg/openhei/plugins"
  local plugin_dir="$plugins_dir/opencode-morph-fast-apply"
  mkdir -p "$plugins_dir"

  if command -v git >/dev/null 2>&1; then
    if [[ -d "$plugin_dir/.git" ]]; then
      print_message info "Updating plugin: $plugin_dir"
      git -C "$plugin_dir" pull --ff-only || true
    else
      print_message info "Installing plugin: $plugin_dir"
      git clone --depth 1 "$plugin_repo" "$plugin_dir" || true
    fi
  else
    print_message warn "git not found; skipping plugin install"
  fi
}

install_dynamic_pruning_plugin() { :; }

install_from_repo() {
  need_cmd bun

  print_message info "${MUTED}=========================================${NC}"
  print_message info "${MUTED}  INSTALL MODE: local-repo${NC}"
  print_message info "${MUTED}=========================================${NC}"

  local current_sha="unknown"
  if command -v git >/dev/null 2>&1 && [[ -d "$SCRIPT_DIR/.git" ]]; then
    current_sha="$(cd "$SCRIPT_DIR" && git rev-parse HEAD 2>/dev/null || echo unknown)"
  fi
  print_message info "Building from git SHA: ${current_sha:0:8}"

  local app_dist="$SCRIPT_DIR/packages/app/dist"
  local target_os target_arch
  read -r target_os target_arch < <(detect_platform)

  local target_name="openhei-${target_os}-${target_arch}"
  local build_dir="$SCRIPT_DIR/packages/openhei/dist/$target_name"

  cd "$SCRIPT_DIR"

  if [[ "$skip_install" != "true" ]]; then
    print_message info "bun install…"
    HUSKY=0 bun install
  fi

  if [[ "$skip_build" != "true" ]]; then
    print_message info "Building dashboard (packages/app)…"
    (cd "$SCRIPT_DIR/packages/app" && bun run build)
  fi

  [[ -f "$app_dist/index.html" ]] || die "Dashboard build missing: $app_dist/index.html"
  echo "$current_sha" > "$app_dist/.build_sha" || true

  if [[ "$reuse_build" == "true" && -x "$build_dir/bin/openhei" ]]; then
    print_message info "Reusing existing build output: $build_dir"
  else
    if [[ "$skip_build" != "true" ]]; then
      print_message info "Building openhei (packages/openhei)…"
      (cd "$SCRIPT_DIR/packages/openhei" && bun run build --single --skip-install --reuse-dashboard --reuse-models)
    fi
  fi

  # Fallback: find any dist dir containing bin/openhei
  if [[ ! -x "$build_dir/bin/openhei" ]]; then
    local found=""
    found="$(find "$SCRIPT_DIR/packages/openhei/dist" -maxdepth 2 -type f -path '*/bin/openhei' 2>/dev/null | head -n1 || true)"
    [[ -n "$found" ]] || die "Build output not found under packages/openhei/dist"
    build_dir="$(dirname "$(dirname "$found")")"
  fi

  # Dashboard source: prefer build_dir/dashboard, else use repo app dist
  local dash="$build_dir/dashboard"
  if [[ ! -d "$dash" ]]; then
    dash="$app_dist"
  fi
  [[ -d "$dash" ]] || die "Dashboard dir not found: $dash"

  install_files_from_dir "$build_dir" "$dash"
  echo "$current_sha" > "$INSTALL_DIR/.build_sha" || true
}

uninstall_openhei() {
  print_message info "Uninstalling openhei…"

  for f in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.zshrc" "$HOME/.zshenv" "$HOME/.config/fish/config.fish"; do
    [[ -f "$f" ]] || continue
    sed -i '/# >>> openhei install marker >>>/,/# <<< openhei install marker <<</d' "$f" 2>/dev/null || true
    sed -i '/OPENHEI_DASHBOARD_DIR/d' "$f" 2>/dev/null || true
    sed -i "/export PATH=.*\\.openhei\\/bin/d" "$f" 2>/dev/null || true
    sed -i "/fish_add_path.*\\.openhei\\/bin/d" "$f" 2>/dev/null || true
  done

  rm -rf "$INSTALL_BASE"
  print_message ok "Uninstalled."
  print_message info "Restart shell or run: hash -r"
}

print_install_summary() {
  echo -e ""
  echo -e "${MUTED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${MUTED}  Installation Summary${NC}"
  echo -e "${MUTED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  ${MUTED}Install Dir:${NC}    $INSTALL_DIR"
  echo -e "  ${MUTED}Dashboard Dir:${NC}  $DASHBOARD_DIR"
  echo -e "  ${MUTED}Binary:${NC}         $INSTALL_DIR/openhei"
  echo -e "${MUTED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e ""
}

# ---------- main ----------
echo "OpenHei Installer started..."

if [[ "$uninstall_mode" == "true" ]]; then
  uninstall_openhei
  exit 0
fi

show_logo

read -r OS ARCH < <(detect_platform)
print_message info "Platform: ${OS}-${ARCH}"

# dispatch
if [[ "$local_repo" == "true" ]]; then
  install_from_repo
  if [[ "$WITH_PLUGINS" == "true" ]]; then
    install_opencode_morph_plugin
    install_dynamic_pruning_plugin
  else
    print_message info "${MUTED}Skipping optional plugin installs (pass --with-plugins to opt-in)${NC}"
  fi
elif [[ -n "$binary_path" ]]; then
  install_from_binary "$binary_path"
elif [[ "$latest_main" == "true" ]]; then
  print_message info "Installing latest main branch build…"
  download_from_main
  check_version "$OS" "$ARCH"
  download_and_install "$OS" "$ARCH" "$specific_tag"
else
  # latest release or explicit version
  check_version "$OS" "$ARCH"
  download_and_install "$OS" "$ARCH" "$specific_tag"
fi

maybe_modify_path
validate_install
print_install_summary

print_message ok "Installation complete!"
print_message info "Try: openhei --version"