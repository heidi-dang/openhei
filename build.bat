@echo off
REM OpenHei 1-Click Build Script for Windows
REM Usage: build.bat [command]

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ==========================================
echo   OpenHei - 1-Click Build Script (Windows)
echo ==========================================
echo.

set "BUN_CMD=bun"
where !BUN_CMD! >nul 2>&1 || set "BUN_CMD=bun.exe"
where !BUN_CMD! >nul 2>&1 (
    echo Error: Bun is not installed.
    echo Install it from: https://bun.sh
    exit /b 1
)

set "CARGO_CMD=cargo"
where !CARGO_CMD! >nul 2>&1 || set "CARGO_CMD=cargo.exe"
where !CARGO_CMD! >nul 2>&1 (
    echo Warning: Rust/Cargo is not installed. Desktop app build will be skipped.
    echo Install it from: https://rustup.rs/
    set "CARGO_CMD="
)

goto %1

:all
echo [1/6] Installing dependencies...
call bun install
echo Dependencies installed.
echo.

echo [2/6] Building OpenHei CLI...
call bun run --cwd packages\openhei build
echo CLI built.
echo.

echo [3/6] Building Web App...
call bun run --cwd packages\app build
echo Web App built.
echo.

if not defined CARGO_CMD (
    echo Skipping Desktop App build - Rust not found.
    goto :done_all
)

echo [4/6] Building Desktop App for Windows...
call bun run --cwd packages\desktop tauri build --target x86_64-pc-windows-msvc
echo Windows Desktop App built.
echo.

echo [5/6] Creating Windows IDE bundle...
if exist "packages\desktop\src-tauri\target\release\bundle\nsis" (
    if not exist "build" mkdir build
    copy /Y "packages\desktop\src-tauri\target\release\bundle\nsis\*.exe" "build\openhei-ide-windows-x64.exe" >nul 2>&1
)
echo Windows IDE bundle created.
echo.

:done_all
echo ==========================================
echo   Build Complete!
echo ==========================================
echo.
echo Outputs:
echo   - CLI: packages\openhei\dist\
echo   - Web App: packages\app\dist\
if defined CARGO_CMD (
    echo   - Windows IDE: packages\desktop\src-tauri\target\release\bundle\
)
goto :end

:cli
echo [1/2] Installing dependencies...
call bun install
echo.

echo [2/2] Building OpenHei CLI...
call bun run --cwd packages\openhei build
echo CLI built.
goto :end

:app
echo [1/2] Installing dependencies...
call bun install
echo.

echo [2/2] Building Web App...
call bun run --cwd packages\app build
echo Web App built.
goto :end

:desktop
echo [1/4] Installing dependencies...
call bun install
echo.

echo [2/4] Building OpenHei CLI...
call bun run --cwd packages\openhei build
echo.

echo [3/4] Building Web App...
call bun run --cwd packages\app build
echo.

if not defined CARGO_CMD (
    echo Error: Rust/Cargo is required to build the desktop app.
    echo Install it from: https://rustup.rs/
    exit /b 1
)

echo [4/4] Building Desktop App for Windows...
call bun run --cwd packages\desktop tauri build --target x86_64-pc-windows-msvc
echo Desktop App built.
goto :end

:ide
echo [1/5] Installing dependencies...
call bun install
echo.

echo [2/5] Building OpenHei CLI...
call bun run --cwd packages\openhei build
echo.

echo [3/5] Building Web App...
call bun run --cwd packages\app build
echo.

if not defined CARGO_CMD (
    echo Error: Rust/Cargo is required to build the IDE.
    echo Install it from: https://rustup.rs/
    exit /b 1
)

echo [4/5] Building Desktop App for Windows...
call bun run --cwd packages\desktop tauri build --target x86_64-pc-windows-msvc
echo.

echo [5/5] Creating Windows IDE bundle...
if exist "packages\desktop\src-tauri\target\release\bundle\nsis" (
    if not exist "build" mkdir build
    copy /Y "packages\desktop\src-tauri\target\release\bundle\nsis\*.exe" "build\openhei-ide-windows-x64.exe" >nul 2>&1
)
echo IDE bundle created.
goto :end

:help
echo Usage: build.bat [command]
echo.
echo Commands:
echo   all       Build everything (CLI + Web App + Desktop App)
echo   cli       Build only the CLI
echo   app       Build only the Web App
echo   desktop   Build Desktop App for Windows
echo   ide       Build IDE (Desktop App) for Windows
echo   help      Show this help message
goto :end

:end
