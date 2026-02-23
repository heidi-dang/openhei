#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

slow=(bash "$root/install.sh" -repo-local --no-modify-path)
fast=(bash "$root/install.sh" -repo-local --reuse-build --skip-install --skip-build --no-modify-path)

echo "Repo: $root"
echo "Baseline: ${slow[*]}"
echo "Fast:     ${fast[*]}"

if command -v hyperfine >/dev/null 2>&1; then
  hyperfine --warmup 1 "${slow[*]}" "${fast[*]}"
  exit 0
fi

echo "hyperfine not installed; using /usr/bin/time" >&2
/usr/bin/time -p "${slow[@]}"
/usr/bin/time -p "${fast[@]}"
