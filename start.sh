#!/usr/bin/env bash
# heidi_train_wizard.sh
# Interactive, fail-closed training launcher for heidi-engine.
# - Prompts for everything
# - Validates deps + GPU + paths
# - Writes a run config you can re-use
# - Supports resume (same run_dir)

set -euo pipefail

say() { printf "\n\033[1m%s\033[0m\n" "$*"; }
err() { printf "\n\033[31mERROR:\033[0m %s\n" "$*" >&2; }
warn(){ printf "\n\033[33mWARN:\033[0m %s\n" "$*" >&2; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || err "Missing command: $1"; }
need_py()  { python - <<'PY' >/dev/null 2>&1 || exit 1
import sys; assert sys.version_info >= (3,9), sys.version
PY
}

ask() {
  local prompt="$1" default="${2:-}"
  local v=""
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " v
    v="${v:-$default}"
  else
    read -r -p "$prompt: " v
  fi
  printf "%s" "$v"
}

ask_yn() {
  local prompt="$1" default="${2:-y}"
  local v=""
  read -r -p "$prompt (y/n) [$default]: " v
  v="${v:-$default}"
  [[ "$v" =~ ^[Yy]$ ]]
}

choose_from_list() {
  local prompt="$1"; shift
  local -a items=("$@")
  local i=1
  echo "$prompt" >&2
  for it in "${items[@]}"; do
    printf "  %d) %s\n" "$i" "$it" >&2
    i=$((i+1))
  done
  local sel
  while true; do
    sel="$(ask "Choose 1-${#items[@]}" "1")"
    if [[ "$sel" =~ ^[0-9]+$ ]] && (( sel>=1 && sel<=${#items[@]} )); then
      printf "%s" "${items[$((sel-1))]}"
      return 0
    fi
  done
}

py_has() {
python - <<PY 2>/dev/null
import importlib, sys
m = "$1"
try:
  importlib.import_module(m)
  print("OK")
except Exception as e:
  print("NO")
  sys.exit(1)
PY
}

detect_cuda() {
python - <<'PY' 2>/dev/null
try:
  import torch
  print("torch", torch.__version__)
  print("cuda_available", torch.cuda.is_available())
  if torch.cuda.is_available():
    print("cuda_device", torch.cuda.get_device_name(0))
    print("cuda_capability", torch.cuda.get_device_capability(0))
    print("cuda_mem_bytes", torch.cuda.get_device_properties(0).total_memory)
except Exception as e:
  print("torch_error", e)
PY
}

json_escape() {
python - <<PY
import json, sys
print(json.dumps(sys.argv[1]))
PY
}

write_json() {
  local path="$1"; shift
  python - "$path" "$@" <<'PY'
import json, sys, pathlib
path = pathlib.Path(sys.argv[1])
obj = json.loads(sys.argv[2])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(str(path))
PY
}

say "Heidi Engine — Training Wizard"
say "Preflight checks"

need_cmd git
need_cmd python
need_py

if ! python -c "import heidi_engine" >/dev/null 2>&1; then
  err "heidi_engine import failed. Activate your venv and install the repo (pip install -e .)."
  exit 1
fi
say "heidi_engine import: OK"

# Basic deps check (best-effort, fail-closed for training)
missing=()
for m in torch transformers peft datasets; do
  if ! python -c "import $m" >/dev/null 2>&1; then
    missing+=("$m")
  fi
done
if ((${#missing[@]})); then
  err "Missing python deps: ${missing[*]}"
  echo "Fix: pip install -U torch transformers peft datasets trl accelerate bitsandbytes"
  exit 1
fi
say "Python deps (torch/transformers/peft/datasets): OK"

say "GPU/CUDA probe (best-effort)"
cuda_info="$(detect_cuda || true)"
echo "$cuda_info"
if echo "$cuda_info" | grep -q "cuda_available True"; then
  say "CUDA: available"
else
  warn "CUDA not available. Training may run CPU-only (slow) or fail if your config requires GPU."
  if ! ask_yn "Continue anyway?" "n"; then
    exit 1
  fi
fi

say "Repo + runtime paths"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
echo "Repo root: $repo_root"

default_runtime="${HEIDI_RUNTIME_ROOT:-$HOME/.local/heidi-engine}"
runtime_root="$(ask "Runtime root" "$default_runtime")"
mkdir -p "$runtime_root"

say "Choose dataset JSONL"
echo "Tip: Use an *absolute* path. JSONL should be one JSON object per line."
data_path="$(ask "Path to training JSONL (raw/clean)" "")"
if [[ ! -f "$data_path" ]]; then
  err "Dataset file not found: $data_path"
  exit 1
fi
if [[ ! "$data_path" = /* ]]; then
  warn "Dataset path is not absolute. Converting to absolute."
  data_path="$(python -c "import os; print(os.path.abspath('$data_path'))")"
fi

# Quick JSONL sanity (first N lines)
say "Dataset quick sanity check (first 50 lines)"
python - "$data_path" <<'PY'
import json, sys
p=sys.argv[1]
ok=0; bad=0
with open(p,"r",encoding="utf-8") as f:
  for i,line in enumerate(f, start=1):
    if i>50: break
    line=line.strip()
    if not line: continue
    try:
      json.loads(line); ok+=1
    except Exception:
      bad+=1
print("ok_lines", ok, "bad_lines", bad)
if bad>0:
  raise SystemExit(1)
PY
say "JSONL parse: OK"

say "Training configuration (prompted)"

# Model + output
base_model="$(ask "Base model (HF id or local path)" "microsoft/phi-2")"
output_dir_default="$runtime_root/runs/$(date +%Y%m%d_%H%M%S)"
run_dir="$(ask "Run output dir (for checkpoints/logs)" "$output_dir_default")"
mkdir -p "$run_dir"

# QLoRA/LoRA knobs
lora_r="$(ask "LoRA r" "16")"
lora_alpha="$(ask "LoRA alpha" "32")"
lora_dropout="$(ask "LoRA dropout" "0.05")"

# Training knobs
epochs="$(ask "Epochs" "1")"
max_steps="$(ask "Max steps (0 = use epochs)" "0")"
train_bs="$(ask "Train batch size per device" "1")"
grad_accum="$(ask "Gradient accumulation steps" "8")"
lr="$(ask "Learning rate" "2e-4")"
warmup="$(ask "Warmup ratio" "0.03")"
seq_len="$(ask "Max seq length" "2048")"

# Optional: cap samples used (helps quick iteration)
cap_samples="$(ask "Cap samples (0 = all)" "0")"

# Precision/quant
dtype="$(choose_from_list "Compute dtype:" "bf16" "fp16" "fp32")"
use_4bit="y"
if ask_yn "Use 4-bit quantization (QLoRA)?" "y"; then use_4bit="y"; else use_4bit="n"; fi

# Resume?
resume="n"
resume_from=""
if ask_yn "Resume from existing checkpoint?" "n"; then
  resume="y"
  resume_from="$(ask "Checkpoint path (directory)" "$run_dir")"
  if [[ ! -d "$resume_from" ]]; then
    err "Checkpoint directory not found: $resume_from"
    exit 1
  fi
fi

# Build a config file
say "Writing run config"
cfg_path="$run_dir/run_config.json"
python - "$cfg_path" <<PY
import json, sys
cfg={
  "repo_root": ${repo_root@Q},
  "runtime_root": ${runtime_root@Q},
  "data_path": ${data_path@Q},
  "base_model": ${base_model@Q},
  "run_dir": ${run_dir@Q},
  "lora": {"r": int(${lora_r@Q}), "alpha": int(${lora_alpha@Q}), "dropout": float(${lora_dropout@Q})},
  "train": {
    "epochs": int(${epochs@Q}),
    "max_steps": int(${max_steps@Q}),
    "batch_size": int(${train_bs@Q}),
    "grad_accum": int(${grad_accum@Q}),
    "lr": float(${lr@Q}),
    "warmup_ratio": float(${warmup@Q}),
    "seq_len": int(${seq_len@Q}),
    "cap_samples": int(${cap_samples@Q}),
    "dtype": ${dtype@Q},
    "use_4bit": ${use_4bit@Q},
    "resume": ${resume@Q},
    "resume_from": ${resume_from@Q}
  }
}
p=sys.argv[1]
open(p,"w",encoding="utf-8").write(json.dumps(cfg, indent=2, sort_keys=True)+"\n")
print(p)
PY
echo "Saved: $cfg_path"

say "Discovering training entrypoint"
# Try a few common module names; you can add yours here.
candidates=(
  "heidi_engine.train"
  "heidi_engine.training"
  "heidi_engine.scripts.04_train_qlora"
  "heidi_engine.scripts.train_qlora"
)
entry=""
for m in "${candidates[@]}"; do
  if python -c "import importlib; importlib.import_module('$m')" >/dev/null 2>&1; then
    entry="$m"
    break
  fi
done

if [[ -z "$entry" ]]; then
  warn "Could not auto-detect training module from common candidates."
  echo "Installed modules containing 'train'/'qlora':"
  python - <<'PY'
import pkgutil, heidi_engine
mods=[m.name for m in pkgutil.iter_modules(heidi_engine.__path__)]
print([m for m in mods if ("train" in m or "qlora" in m)])
PY
  entry="$(ask "Enter the python module to run (e.g. heidi_engine.scripts.04_train_qlora)" "")"
  if [[ -z "$entry" ]]; then
    err "No module provided."
    exit 1
  fi
  if ! python -c "import importlib; importlib.import_module('$entry')" >/dev/null 2>&1; then
    err "Module import failed: $entry"
    exit 1
  fi
fi
say "Training module: $entry"

say "Final review"
cat "$cfg_path"

if ! ask_yn "Everything looks OK. Start training now?" "y"; then
  say "Aborted. You can re-run later with the same run_dir:"
  echo "  $0"
  exit 0
fi

say "Launching training"
# We pass config path; your module should accept --config or similar.
# If not, edit the command below to match your CLI.
cmd=(python -m "$entry" --config "$cfg_path")

# If your training script uses different flags, adjust here:
# cmd=(python -m "$entry" --data "$data_path" --model "$base_model" --out "$run_dir" ...)

echo "CMD: ${cmd[*]}"
"${cmd[@]}"
