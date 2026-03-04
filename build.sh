#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  OpenHei - 1-Click Build Script"
echo "=========================================="
echo ""

detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        CYGWIN*|MINGW*|MSYS*) echo "windows";;
        *)          echo "unknown";;
    esac
}

install_deps() {
    echo "[1/5] Installing dependencies..."
    bun install
    echo "Dependencies installed."
    echo ""
}

build_cli() {
    echo "[2/5] Building OpenHei CLI..."
    bun run --cwd packages/openhei build
    echo "CLI built."
    echo ""
}

build_app() {
    echo "[3/5] Building Web App..."
    bun run --cwd packages/app build
    echo "Web App built."
    echo ""
}

build_desktop_linux() {
    echo "[4/5] Building Desktop App for Linux..."
    if ! command -v cargo &> /dev/null; then
        echo "Error: Rust/Cargo is required to build the desktop app."
        echo "Install it from: https://rustup.rs/"
        exit 1
    fi
    bun run --cwd packages/desktop tauri build --target x86_64-unknown-linux-gnu
    echo "Linux Desktop App built."
    echo ""
}

build_desktop_windows() {
    echo "[4/5] Building Desktop App for Windows..."
    if ! command -v cargo &> /dev/null; then
        echo "Error: Rust/Cargo is required to build the desktop app."
        echo "Install it from: https://rustup.rs/"
        exit 1
    fi
    bun run --cwd packages/desktop tauri build --target x86_64-pc-windows-msvc
    echo "Windows Desktop App built."
    echo ""
}

build_desktop_macos() {
    echo "[4/5] Building Desktop App for macOS..."
    if ! command -v cargo &> /dev/null; then
        echo "Error: Rust/Cargo is required to build the desktop app."
        echo "Install it from: https://rustup.rs/"
        exit 1
    fi
    bun run --cwd packages/desktop tauri build --target aarch64-apple-darwin
    bun run --cwd packages/desktop tauri build --target x86_64-apple-darwin
    echo "macOS Desktop App built (ARM64 + x86_64)."
    echo ""
}

build_ide_linux() {
    echo "[5/5] Building Linux IDE bundle..."
    if [ -d "packages/desktop/src-tauri/target/release/bundle/deb" ]; then
        cp packages/desktop/src-tauri/target/release/bundle/deb/*.deb "build/openhei-ide-linux-x64.deb" 2>/dev/null || true
    fi
    if [ -d "packages/desktop/src-tauri/target/release/bundle/rpm" ]; then
        cp packages/desktop/src-tauri/target/release/bundle/rpm/*.rpm "build/openhei-ide-linux-x64.rpm" 2>/dev/null || true
    fi
    echo "Linux IDE bundle created."
    echo ""
}

build_ide_windows() {
    echo "[5/5] Building Windows IDE bundle..."
    if [ -d "packages/desktop/src-tauri/target/release/bundle/nsis" ]; then
        cp packages/desktop/src-tauri/target/release/bundle/nsis/*.exe "build/openhei-ide-windows-x64.exe" 2>/dev/null || true
    fi
    echo "Windows IDE bundle created."
    echo ""
}

build_all() {
    mkdir -p build

    install_deps
    build_cli
    build_app
    
    OS=$(detect_os)
    
    case "$OS" in
        linux)
            build_desktop_linux
            build_ide_linux
            ;;
        windows)
            build_desktop_windows
            build_ide_windows
            ;;
        macos)
            build_desktop_macos
            ;;
    esac

    echo "=========================================="
    echo "  Build Complete!"
    echo "=========================================="
    echo ""
    echo "Outputs:"
    echo "  - CLI: packages/openhei/dist/"
    echo "  - Web App: packages/app/dist/"
    if [ "$OS" = "linux" ]; then
        echo "  - Linux IDE: packages/desktop/src-tauri/target/release/bundle/"
    elif [ "$OS" = "windows" ]; then
        echo "  - Windows IDE: packages/desktop/src-tauri/target/release/bundle/"
    elif [ "$OS" = "macos" ]; then
        echo "  - macOS IDE: packages/desktop/src-tauri/target/release/bundle/"
    fi
}

show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  all         Build everything (CLI + Web App + Desktop App for current OS)"
    echo "  cli         Build only the CLI"
    echo "  app         Build only the Web App"
    echo "  desktop     Build Desktop App for current OS"
    echo "  ide         Build IDE (Desktop App) for current OS"
    echo "  cross       Build Desktop App for all platforms (requires Rust cross-compilation)"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 all      # Build everything for current platform"
    echo "  $0 cli      # Build only CLI"
    echo "  $0 desktop  # Build only desktop app"
}

case "${1:-all}" in
    all)
        build_all
        ;;
    cli)
        install_deps
        build_cli
        ;;
    app)
        install_deps
        build_app
        ;;
    desktop)
        install_deps
        build_cli
        build_app
        OS=$(detect_os)
        case "$OS" in
            linux)  build_desktop_linux ;;
            windows) build_desktop_windows ;;
            macos)  build_desktop_macos ;;
        esac
        ;;
    ide)
        install_deps
        build_cli
        build_app
        OS=$(detect_os)
        case "$OS" in
            linux)  build_desktop_linux && build_ide_linux ;;
            windows) build_desktop_windows && build_ide_windows ;;
            macos)  build_desktop_macos ;;
        esac
        ;;
    cross)
        install_deps
        build_cli
        build_app
        echo "Building for all platforms..."
        build_desktop_linux
        build_desktop_windows
        build_desktop_macos
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
