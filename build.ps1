#!/usr/bin/env pwsh
# OpenHei 1-Click Build Script for Windows (PowerShell)
# Usage: .\build.ps1 [command]

param(
    [Parameter(Position=0)]
    [ValidateSet("all", "cli", "app", "desktop", "ide", "help")]
    [string]$Command = "all"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Write-Step([string]$Message) {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Test-Command([string]$Cmd) {
    $null = Get-Command $Cmd -ErrorAction SilentlyContinue
    return $?
}

Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  OpenHei - 1-Click Build Script (PS)" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

$HasBun = Test-Command "bun"
if (-not $HasBun) {
    Write-Host "Error: Bun is not installed." -ForegroundColor Red
    Write-Host "Install it from: https://bun.sh" -ForegroundColor Yellow
    exit 1
}

$HasCargo = Test-Command "cargo"

switch ($Command) {
    "all" {
        Write-Step "Installing dependencies..."
        bun install
        Write-Success "Dependencies installed"

        Write-Step "Building OpenHei CLI..."
        bun run --cwd packages/openhei build
        Write-Success "CLI built"

        Write-Step "Building Web App..."
        bun run --cwd packages/app build
        Write-Success "Web App built"

        if (-not $HasCargo) {
            Write-Host "Warning: Rust/Cargo not found. Skipping Desktop App build." -ForegroundColor Yellow
        } else {
            Write-Step "Building Desktop App for Windows..."
            bun run --cwd packages/desktop tauri build --target x86_64-pc-windows-msvc
            Write-Success "Windows Desktop App built"

            Write-Step "Creating Windows IDE bundle..."
            $BundlePath = "packages\desktop\src-tauri\target\release\bundle\nsis"
            if (Test-Path $BundlePath) {
                New-Item -ItemType Directory -Force -Path "build" | Out-Null
                Copy-Item "$BundlePath\*.exe" "build\openhei-ide-windows-x64.exe" -Force -ErrorAction SilentlyContinue
            }
            Write-Success "IDE bundle created"
        }

        Write-Host "`n==========================================" -ForegroundColor Green
        Write-Host "  Build Complete!" -ForegroundColor Green
        Write-Host "==========================================" -ForegroundColor Green
        Write-Host "`nOutputs:"
        Write-Host "  - CLI: packages\openhei\dist\"
        Write-Host "  - Web App: packages\app\dist\"
        if ($HasCargo) {
            Write-Host "  - Windows IDE: packages\desktop\src-tauri\target\release\bundle\"
        }
    }

    "cli" {
        Write-Step "Installing dependencies..."
        bun install
        Write-Step "Building OpenHei CLI..."
        bun run --cwd packages/openhei build
        Write-Success "CLI built"
    }

    "app" {
        Write-Step "Installing dependencies..."
        bun install
        Write-Step "Building Web App..."
        bun run --cwd packages/app build
        Write-Success "Web App built"
    }

    "desktop" {
        if (-not $HasCargo) {
            Write-Host "Error: Rust/Cargo is required to build the desktop app." -ForegroundColor Red
            Write-Host "Install it from: https://rustup.rs/" -ForegroundColor Yellow
            exit 1
        }

        Write-Step "Installing dependencies..."
        bun install

        Write-Step "Building OpenHei CLI..."
        bun run --cwd packages/openhei build

        Write-Step "Building Web App..."
        bun run --cwd packages/app build

        Write-Step "Building Desktop App for Windows..."
        bun run --cwd packages/desktop tauri build --target x86_64-pc-windows-msvc
        Write-Success "Desktop App built"
    }

    "ide" {
        if (-not $HasCargo) {
            Write-Host "Error: Rust/Cargo is required to build the IDE." -ForegroundColor Red
            Write-Host "Install it from: https://rustup.rs/" -ForegroundColor Yellow
            exit 1
        }

        Write-Step "Installing dependencies..."
        bun install

        Write-Step "Building OpenHei CLI..."
        bun run --cwd packages/openhei build

        Write-Step "Building Web App..."
        bun run --cwd packages/app build

        Write-Step "Building Desktop App for Windows..."
        bun run --cwd packages/desktop tauri build --target x86_64-pc-windows-msvc

        Write-Step "Creating Windows IDE bundle..."
        $BundlePath = "packages\desktop\src-tauri\target\release\bundle\nsis"
        if (Test-Path $BundlePath) {
            New-Item -ItemType Directory -Force -Path "build" | Out-Null
            Copy-Item "$BundlePath\*.exe" "build\openhei-ide-windows-x64.exe" -Force -ErrorAction SilentlyContinue
        }
        Write-Success "IDE bundle created"
    }

    "help" {
        Write-Host @"
Usage: .\build.ps1 [command]

Commands:
  all       Build everything (CLI + Web App + Desktop App for current OS)
  cli       Build only the CLI
  app       Build only the Web App
  desktop   Build Desktop App for current OS
  ide       Build IDE (Desktop App) for current OS
  help      Show this help message

Examples:
  .\build.ps1 all      # Build everything for current platform
  .\build.ps1 cli      # Build only CLI
  .\build.ps1 desktop  # Build only desktop app

"@
    }
}
