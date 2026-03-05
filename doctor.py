#!/usr/bin/env python3
"""
OpenHei Repo Doctor
- Runs monorepo checks in one go (install/lint/typecheck/test/build)
- Scans codebase for backend/UI/TUI/API/SSE hotspots
- Produces a report with issue locations + suggested fix intent + related issues

No external Python deps. Uses rg (ripgrep) if available for fast scanning.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as _dt
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ----------------------------
# Models
# ----------------------------

@dataclasses.dataclass
class CommandResult:
    name: str
    cmd: List[str]
    cwd: str
    exit_code: int
    log_path: str
    seconds: float


@dataclasses.dataclass
class Issue:
    issue_id: str
    severity: str  # "HIGH" | "MED" | "LOW"
    kind: str      # "BUILD" | "TYPECHECK" | "TEST" | "LINT" | "RUNTIME" | "STATIC"
    signature: str
    message: str
    locations: List[Dict[str, object]]  # {path,line,col,context}
    evidence: str
    suggested_fix: List[str]
    related_issue_ids: List[str]


# ----------------------------
# Utilities
# ----------------------------

TEXT_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".css", ".scss", ".json", ".md", ".yml", ".yaml",
    ".py", ".sh", ".bash", ".zsh",
    ".toml", ".ini", ".env", ".txt",
    ".c", ".cc", ".cpp", ".h", ".hpp",
}

DEFAULT_EXCLUDES = {
    "node_modules", ".git", "dist", "build", ".next", ".turbo", ".cache",
    "coverage", ".venv", "venv", "__pycache__", ".idea", ".vscode",
}

def now_stamp() -> str:
    return _dt.datetime.now().strftime("%Y%m%d-%H%M%S")

def which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)

def read_text_safe(p: Path, max_bytes: int = 2_000_000) -> str:
    try:
        if p.stat().st_size > max_bytes:
            return ""
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""

def run_cmd(name: str, cmd: List[str], cwd: Path, log_path: Path, env: Dict[str, str], timeout_sec: int) -> CommandResult:
    t0 = _dt.datetime.now()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", encoding="utf-8") as f:
        f.write(f"== {name} ==\n")
        f.write(f"cwd: {cwd}\n")
        f.write(f"cmd: {' '.join(cmd)}\n\n")
        f.flush()
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(cwd),
                env=env,
                stdout=f,
                stderr=subprocess.STDOUT,
                timeout=timeout_sec,
                text=True,
            )
            code = proc.returncode
        except subprocess.TimeoutExpired:
            f.write(f"\n[doctor] TIMEOUT after {timeout_sec}s\n")
            code = 124
        except FileNotFoundError:
            f.write("\n[doctor] COMMAND NOT FOUND\n")
            code = 127
        except Exception as e:
            f.write(f"\n[doctor] EXCEPTION: {e}\n")
            code = 1

    dt = (_dt.datetime.now() - t0).total_seconds()
    return CommandResult(
        name=name,
        cmd=cmd,
        cwd=str(cwd),
        exit_code=code,
        log_path=str(log_path),
        seconds=dt,
    )

def repo_root_from(start: Path) -> Path:
    # Prefer git root; fallback to start.
    try:
        out = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=str(start), text=True).strip()
        if out:
            return Path(out)
    except Exception:
        pass
    return start.resolve()

def git_info(root: Path) -> Dict[str, str]:
    info: Dict[str, str] = {}
    def _try(cmd: List[str], key: str):
        try:
            out = subprocess.check_output(cmd, cwd=str(root), text=True, stderr=subprocess.DEVNULL).strip()
            info[key] = out
        except Exception:
            info[key] = ""
    _try(["git", "rev-parse", "--short", "HEAD"], "head")
    _try(["git", "status", "--porcelain"], "status_porcelain")
    _try(["git", "branch", "--show-current"], "branch")
    return info

def tool_versions() -> Dict[str, str]:
    def _ver(cmd: List[str]) -> str:
        try:
            return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT).strip()
        except Exception:
            return ""
    return {
        "python": sys.version.split("\n")[0],
        "bun": _ver(["bun", "--version"]) if which("bun") else "",
        "node": _ver(["node", "--version"]) if which("node") else "",
        "git": _ver(["git", "--version"]) if which("git") else "",
        "rg": _ver(["rg", "--version"]).splitlines()[0] if which("rg") else "",
    }

def is_excluded(path: Path, excludes: set[str]) -> bool:
    parts = set(path.parts)
    return any(x in parts for x in excludes)

def iter_text_files(root: Path, excludes: set[str]) -> List[Path]:
    files: List[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if is_excluded(p, excludes):
            continue
        if p.suffix.lower() in TEXT_EXTS:
            files.append(p)
    return files


# ----------------------------
# Parsing: extract issues from logs
# ----------------------------

RE_TS_ERROR = re.compile(r"^(?P<file>[^:\n]+):(?P<line>\d+):(?P<col>\d+)\s*-\s*error\s*(?P<code>TS\d+):\s*(?P<msg>.+)$", re.MULTILINE)
RE_ESLINT_ERROR = re.compile(r"^(?P<file>[^:\n]+)\n\s+(?P<line>\d+):(?P<col>\d+)\s+error\s+(?P<msg>.+?)\s{2,}(?P<rule>[\w-\/]+)\s*$", re.MULTILINE)
RE_STACK_AT = re.compile(r"\s+at\s+.*\((?P<file>[^)]+):(?P<line>\d+):(?P<col>\d+)\)")
RE_SIMPLE_AT = re.compile(r"\s+at\s+(?P<file>[^:\s]+):(?P<line>\d+):(?P<col>\d+)")
RE_TYPEERROR = re.compile(r"TypeError:\s+(?P<msg>.+)")
RE_VITEST_FAIL = re.compile(r"FAIL\s+(?P<file>\S+)")
RE_BUN_TEST_FAIL = re.compile(r"^bun test", re.MULTILINE)

def extract_context_line(root: Path, file_rel: str, line: int, radius: int = 2) -> str:
    p = (root / file_rel).resolve()
    if not p.exists():
        return ""
    txt = read_text_safe(p)
    if not txt:
        return ""
    lines = txt.splitlines()
    idx = max(0, min(len(lines) - 1, line - 1))
    lo = max(0, idx - radius)
    hi = min(len(lines), idx + radius + 1)
    snippet = "\n".join(f"{i+1:>5} | {lines[i]}" for i in range(lo, hi))
    return snippet

def parse_log_for_issues(root: Path, kind: str, log_path: Path) -> List[Issue]:
    text = read_text_safe(log_path, max_bytes=20_000_000)
    if not text:
        return []

    issues: List[Issue] = []

    # 1) TS compiler style errors
    for m in RE_TS_ERROR.finditer(text):
        file_rel = m.group("file").strip()
        line = int(m.group("line"))
        col = int(m.group("col"))
        msg = f"{m.group('code')}: {m.group('msg').strip()}"
        ctx = extract_context_line(root, file_rel, line)
        sig = f"{m.group('code')}@{file_rel}"
        issues.append(Issue(
            issue_id="",
            severity="HIGH",
            kind=kind,
            signature=sig,
            message=msg,
            locations=[{"path": file_rel, "line": line, "col": col, "context": ctx}],
            evidence=msg,
            suggested_fix=[
                "Fix TypeScript type error at the referenced line/column.",
                "If this is a null/undefined issue, enforce explicit guards and tighten types.",
            ],
            related_issue_ids=[],
        ))

    # 2) ESLint errors (common output format)
    for m in RE_ESLINT_ERROR.finditer(text):
        file_rel = m.group("file").strip()
        line = int(m.group("line"))
        col = int(m.group("col"))
        msg = f"{m.group('msg').strip()} ({m.group('rule').strip()})"
        ctx = extract_context_line(root, file_rel, line)
        sig = f"eslint:{m.group('rule')}@{file_rel}"
        issues.append(Issue(
            issue_id="",
            severity="MED",
            kind=kind,
            signature=sig,
            message=msg,
            locations=[{"path": file_rel, "line": line, "col": col, "context": ctx}],
            evidence=msg,
            suggested_fix=[
                "Apply the eslint rule guidance or refactor to satisfy the rule.",
                "Avoid blanket disables; fix root cause where possible.",
            ],
            related_issue_ids=[],
        ))

    # 3) Runtime TypeError stacks
    # Capture message + any stack frame paths
    type_errors = list(RE_TYPEERROR.finditer(text))
    for m in type_errors:
        msg = m.group("msg").strip()
        locs: List[Dict[str, object]] = []
        # look at next ~30 lines for stack frames
        start = m.end()
        tail = text[start:start + 4000]
        for sm in RE_STACK_AT.finditer(tail):
            f = sm.group("file")
            if f.startswith("http://") or f.startswith("https://"):
                # keep URL but still record
                locs.append({"path": f, "line": int(sm.group("line")), "col": int(sm.group("col")), "context": ""})
            else:
                # try to relativize to repo
                try:
                    fp = Path(f)
                    if fp.is_absolute():
                        rel = str(fp.relative_to(root))
                    else:
                        rel = str(fp)
                except Exception:
                    rel = str(f)
                ctx = extract_context_line(root, rel, int(sm.group("line")))
                locs.append({"path": rel, "line": int(sm.group("line")), "col": int(sm.group("col")), "context": ctx})

        sig = f"typeerror:{msg.split(' ')[0:6]}"
        suggested = [
            "Add guardrails where the value can be undefined/null before dereferencing.",
            "If this occurs only in prod build, enable source maps and reproduce in dev to map to TS/TSX source.",
        ]
        if "reading 'value'" in msg or "reading \"value\"" in msg:
            suggested.insert(0, "Search for .value access on possibly-undefined refs/options/state; add defensive checks and defaults.")
        issues.append(Issue(
            issue_id="",
            severity="HIGH",
            kind="RUNTIME",
            signature=str(sig),
            message=f"TypeError: {msg}",
            locations=locs[:10],
            evidence=f"TypeError: {msg}",
            suggested_fix=suggested,
            related_issue_ids=[],
        ))

    # 4) Generic stack frames (non-TypeError)
    # Useful when bun/test/build prints "at path:line:col"
    stack_locs: List[Dict[str, object]] = []
    for sm in RE_SIMPLE_AT.finditer(text):
        f = sm.group("file")
        if f.startswith("http://") or f.startswith("https://"):
            continue
        try:
            fp = Path(f)
            rel = str(fp.relative_to(root)) if fp.is_absolute() else str(fp)
        except Exception:
            rel = str(f)
        line = int(sm.group("line"))
        col = int(sm.group("col"))
        ctx = extract_context_line(root, rel, line)
        stack_locs.append({"path": rel, "line": line, "col": col, "context": ctx})

    # If there are stack locs but no explicit issues yet for this log, add a generic one.
    if stack_locs and not issues:
        issues.append(Issue(
            issue_id="",
            severity="MED",
            kind=kind,
            signature=f"stacktrace@{Path(log_path).name}",
            message="Stacktrace detected; inspect evidence and first frames.",
            locations=stack_locs[:10],
            evidence="\n".join(text.splitlines()[:200])[:4000],
            suggested_fix=[
                "Use the first relevant stack frame within repo files to locate the failing code.",
                "Fix the root exception and re-run this doctor script.",
            ],
            related_issue_ids=[],
        ))

    # 5) Vitest/bun test FAIL summary lines
    for m in RE_VITEST_FAIL.finditer(text):
        f = m.group("file").strip()
        sig = f"testfail@{f}"
        issues.append(Issue(
            issue_id="",
            severity="HIGH",
            kind="TEST",
            signature=sig,
            message=f"Test failure: {f}",
            locations=[{"path": f, "line": 0, "col": 0, "context": ""}],
            evidence=f"FAIL {f}",
            suggested_fix=[
                "Open the failing test file and inspect the first failing assertion in the log.",
                "If async timing is involved, fix the production flow (await/observable) rather than adding arbitrary sleeps.",
            ],
            related_issue_ids=[],
        ))

    return issues


# ----------------------------
# Static scan: backend/UI/TUI/API/SSE hotspots
# ----------------------------

@dataclasses.dataclass
class StaticFinding:
    name: str
    description: str
    matches: List[Dict[str, object]]  # {path,line,text}

def rg_search(root: Path, pattern: str, globs: Optional[List[str]] = None, excludes: Optional[List[str]] = None, max_hits: int = 300) -> List[Dict[str, object]]:
    """
    Use ripgrep if available, else fallback to python scan (slower).
    Returns list of {path,line,text}.
    """
    results: List[Dict[str, object]] = []
    rg = which("rg")
    if rg:
        cmd = [rg, "-n", "--no-heading", "--color", "never", pattern, str(root)]
        if globs:
            for g in globs:
                cmd.extend(["-g", g])
        if excludes:
            for e in excludes:
                cmd.extend(["-g", f"!{e}/**"])
        try:
            out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
            for line in out.splitlines():
                # format: path:line:text
                parts = line.split(":", 2)
                if len(parts) != 3:
                    continue
                p, ln, txt = parts
                try:
                    lni = int(ln)
                except Exception:
                    lni = 0
                results.append({"path": p, "line": lni, "text": txt})
                if len(results) >= max_hits:
                    break
        except subprocess.CalledProcessError:
            pass
        except Exception:
            pass
        return results

    # Fallback: python scan
    files = iter_text_files(root, DEFAULT_EXCLUDES)
    rx = re.compile(pattern)
    for fp in files:
        rel = str(fp.relative_to(root))
        txt = read_text_safe(fp)
        if not txt:
            continue
        for i, line in enumerate(txt.splitlines(), start=1):
            if rx.search(line):
                results.append({"path": rel, "line": i, "text": line.strip()})
                if len(results) >= max_hits:
                    return results
    return results

def static_findings(root: Path) -> List[StaticFinding]:
    excludes = list(DEFAULT_EXCLUDES)

    patterns: List[Tuple[str, str]] = [
        # SSE and streaming plumbing
        ("SSE headers", r"text/event-stream"),
        ("EventSource usage (UI)", r"\bEventSource\b"),
        ("SSE route names", r"\/(stream|events|sse)\b"),
        ("ReadableStream usage", r"\bReadableStream\b"),
        ("streamSSE helper", r"\bstreamSSE\b"),

        # API / server frameworks (common in OpenHei)
        ("Hono usage", r"\bhono\b"),
        ("app.get/app.post routes", r"\b(app|router)\.(get|post|put|delete|patch)\("),

        # Error boundary / crash hotspots
        ("Non-null assertions", r"!\.|\bas\s+any\b"),
        ("Unsafe .value access", r"\.value\b"),

        # Known recurring failures seen in this repo’s history
        ("next() called multiple times pattern", r"next\(\)"),
        ("serveStatic middleware", r"\bserveStatic\b"),

        # TODO/FIXME
        ("TODO", r"\bTODO\b"),
        ("FIXME", r"\bFIXME\b"),

        # Console spam / missing indicators
        ("console.error", r"\bconsole\.error\b"),
        ("console.warn", r"\bconsole\.warn\b"),
    ]

    findings: List[StaticFinding] = []
    for name, pat in patterns:
        matches = rg_search(root, pat, excludes=excludes, max_hits=200)
        if matches:
            findings.append(StaticFinding(
                name=name,
                description=f"Static scan matches for pattern: {pat}",
                matches=matches,
            ))

    return findings


# ----------------------------
# Suggestion rules: map signatures/messages to fix intent
# ----------------------------

def suggest_fix_for_signature(sig: str, msg: str) -> List[str]:
    s = f"{sig} {msg}".lower()

    if "next() called multiple times" in s or "dispatch" in s and "compose.js" in s:
        return [
            "Find the Hono middleware that calls next() more than once or calls next() after sending a response.",
            "Ensure each middleware either: (a) returns the Response, or (b) awaits next() exactly once and then returns.",
            "If serveStatic is involved, verify route ordering: static handler must not fallthrough into another handler that also calls next().",
        ]

    if "cannot read properties of undefined" in s and "reading 'value'" in s:
        return [
            "Identify which state/ref/option can be undefined; add a default value and a guard before .value dereference.",
            "If this is a UI select/input: ensure controlled components always receive defined 'value' and 'onChange' paths.",
            "If this is build-only: enable sourcemaps and reproduce in dev to locate the real TS/TSX source line.",
        ]

    if "eventsource" in s or "text/event-stream" in s or "sse" in s:
        return [
            "Verify backend sets headers: Content-Type: text/event-stream; Cache-Control: no-cache; Connection: keep-alive.",
            "Ensure SSE handler flushes periodically and does not buffer indefinitely; verify heartbeat or initial event.",
            "On client, ensure reconnect/backoff is implemented and does not spam; Stop must close EventSource cleanly.",
        ]

    if "ts" in s or "typecheck" in s:
        return [
            "Fix the reported TypeScript error at the exact file:line:col.",
            "Prefer narrowing types and explicit guards over casting to any.",
        ]

    if "eslint" in s or "lint" in s:
        return [
            "Fix lint errors at the referenced file:line:col; avoid disabling rules unless absolutely necessary.",
        ]

    if "testfail" in s or "vitest" in s or "bun test" in s:
        return [
            "Open the failing test output and fix the production code path first (async ordering, state updates, cleanup).",
            "Avoid adding arbitrary sleeps; use deterministic hooks/awaits and proper teardown.",
        ]

    return [
        "Follow the first repo-local stack frame to identify the failing function.",
        "Fix root cause, then re-run this doctor script to confirm the issue is gone.",
    ]


# ----------------------------
# Report generation
# ----------------------------

def dedupe_and_assign_ids(issues: List[Issue]) -> List[Issue]:
    # Dedupe by (signature + first location path+line + message)
    seen = {}
    out: List[Issue] = []
    for it in issues:
        loc0 = it.locations[0] if it.locations else {}
        key = (it.signature, it.message, loc0.get("path", ""), loc0.get("line", 0))
        if key in seen:
            continue
        seen[key] = True
        out.append(it)

    # Assign IDs
    for i, it in enumerate(out, start=1):
        it.issue_id = f"ISSUE-{i:03d}"
    return out

def compute_related(issues: List[Issue]) -> None:
    # Related if same file OR same signature prefix OR same kind
    file_map: Dict[str, List[str]] = {}
    sig_map: Dict[str, List[str]] = {}

    for it in issues:
        for loc in it.locations:
            p = str(loc.get("path", ""))
            if p:
                file_map.setdefault(p, []).append(it.issue_id)
        sig_map.setdefault(it.signature, []).append(it.issue_id)

    for it in issues:
        related = set()
        for loc in it.locations:
            p = str(loc.get("path", ""))
            for rid in file_map.get(p, []):
                if rid != it.issue_id:
                    related.add(rid)
        for rid in sig_map.get(it.signature, []):
            if rid != it.issue_id:
                related.add(rid)

        it.related_issue_ids = sorted(related)[:12]

def render_markdown_report(
    root: Path,
    out_dir: Path,
    git: Dict[str, str],
    versions: Dict[str, str],
    results: List[CommandResult],
    issues: List[Issue],
    findings: List[StaticFinding],
) -> str:
    lines: List[str] = []

    lines.append(f"# OpenHei Repo Doctor Report\n")
    lines.append(f"- Generated: `{_dt.datetime.now().isoformat(timespec='seconds')}`")
    lines.append(f"- Repo root: `{root}`")
    lines.append(f"- Git: branch `{git.get('branch','')}` head `{git.get('head','')}`")
    if git.get("status_porcelain","").strip():
        lines.append(f"- Working tree: **DIRTY** ({len(git.get('status_porcelain','').splitlines())} changes)")
    else:
        lines.append(f"- Working tree: clean")
    lines.append("")

    lines.append("## Tool Versions\n")
    for k, v in versions.items():
        if v:
            lines.append(f"- {k}: `{v}`")
    lines.append("")

    lines.append("## Command Run Summary\n")
    lines.append("| Stage | Exit | Seconds | Log |")
    lines.append("|---|---:|---:|---|")
    for r in results:
        rel_log = os.path.relpath(r.log_path, start=str(root))
        lines.append(f"| `{r.name}` | `{r.exit_code}` | `{r.seconds:.1f}` | `{rel_log}` |")
    lines.append("")

    # Issue summary counts
    sev_counts = {"HIGH": 0, "MED": 0, "LOW": 0}
    kind_counts: Dict[str, int] = {}
    for it in issues:
        sev_counts[it.severity] = sev_counts.get(it.severity, 0) + 1
        kind_counts[it.kind] = kind_counts.get(it.kind, 0) + 1

    lines.append("## Issues Summary\n")
    lines.append(f"- HIGH: **{sev_counts['HIGH']}**  |  MED: **{sev_counts['MED']}**  |  LOW: **{sev_counts['LOW']}**")
    if kind_counts:
        lines.append("- By kind: " + ", ".join(f"`{k}`={v}" for k, v in sorted(kind_counts.items(), key=lambda x: (-x[1], x[0]))))
    lines.append("")

    # Detailed issues
    lines.append("## Issues (Fix-Oriented)\n")
    if not issues:
        lines.append("No issues parsed from tool logs. If you still see runtime crashes (like the screenshot), run with a reproducible command and pipe logs into this doctor output folder.")
        lines.append("")
    else:
        for it in issues:
            lines.append(f"### {it.issue_id} — {it.severity} — {it.kind}\n")
            lines.append(f"- Signature: `{it.signature}`")
            lines.append(f"- Message: {it.message}")
            if it.related_issue_ids:
                lines.append(f"- Related: {', '.join(f'`{x}`' for x in it.related_issue_ids)}")
            lines.append("")
            if it.locations:
                lines.append("**Locations**")
                for loc in it.locations[:6]:
                    p = str(loc.get("path",""))
                    ln = int(loc.get("line", 0) or 0)
                    col = int(loc.get("col", 0) or 0)
                    lines.append(f"- `{p}:{ln}:{col}`")
                    ctx = str(loc.get("context","")).strip()
                    if ctx:
                        lines.append("")
                        lines.append("```")
                        lines.append(ctx)
                        lines.append("```")
                lines.append("")
            if it.evidence.strip():
                lines.append("**Evidence (excerpt)**")
                lines.append("")
                lines.append("```")
                lines.append(it.evidence.strip()[:1800])
                lines.append("```")
                lines.append("")
            lines.append("**Suggested Fix (intent)**")
            for s in it.suggested_fix:
                lines.append(f"- {s}")
            lines.append("")

    # Static findings
    lines.append("## Static Scan Findings (hotspots)\n")
    if not findings:
        lines.append("No static findings (unexpected).")
        lines.append("")
    else:
        for f in findings:
            lines.append(f"### {f.name}\n")
            lines.append(f"{f.description}")
            lines.append("")
            # Show first N matches
            for m in f.matches[:25]:
                lines.append(f"- `{m['path']}:{m['line']}` — {m['text']}")
            if len(f.matches) > 25:
                lines.append(f"- … plus {len(f.matches) - 25} more")
            lines.append("")

    lines.append("## Next Actions\n")
    lines.append("- Fix HIGH issues first (they block runtime or CI).")
    lines.append("- Re-run this script; confirm issue count drops to zero.")
    lines.append("- If the crash is build-only (minified assets), enable source maps and reproduce in dev to get real TS/TSX locations.")
    lines.append("")

    return "\n".join(lines)


# ----------------------------
# Main
# ----------------------------

def main() -> int:
    ap = argparse.ArgumentParser(
        prog="openhei_doctor.py",
        formatter_class=argparse.RawTextHelpFormatter,
        description="Run full OpenHei repo checks and generate a fix-oriented report.",
    )
    ap.add_argument("--repo", default=".", help="Repo path (default: .)")
    ap.add_argument("--out", default="", help="Output folder (default: <repo>/_doctor/<timestamp>)")
    ap.add_argument("--timeout", type=int, default=45*60, help="Per-command timeout seconds (default: 2700)")
    ap.add_argument("--skip-install", action="store_true", help="Skip bun install")
    ap.add_argument("--skip-tests", action="store_true", help="Skip tests")
    ap.add_argument("--skip-build", action="store_true", help="Skip build")
    ap.add_argument("--skip-static-scan", action="store_true", help="Skip static scanning (faster)")

    args = ap.parse_args()
    start = Path(args.repo).resolve()
    root = repo_root_from(start)

    out_dir = Path(args.out).resolve() if args.out else (root / "_doctor" / now_stamp())
    out_dir.mkdir(parents=True, exist_ok=True)

    git = git_info(root)
    versions = tool_versions()

    # env: inherit, but force non-interactive / stable output where possible
    env = dict(os.environ)
    env.setdefault("CI", "1")
    env.setdefault("FORCE_COLOR", "0")

    # Command plan (best-effort defaults for OpenHei monorepo)
    # If your repo uses different scripts, the logs will show "missing script" clearly.
    commands: List[Tuple[str, List[str]]] = []

    if not args.skip_install:
        commands.append(("install", ["bun", "install", "--frozen-lockfile"]))

    commands.append(("lint", ["bun", "run", "turbo", "run", "lint"]))
    commands.append(("typecheck", ["bun", "run", "turbo", "run", "typecheck"]))

    if not args.skip_tests:
        commands.append(("test", ["bun", "run", "turbo", "run", "test"]))

    if not args.skip_build:
        commands.append(("build", ["bun", "run", "turbo", "run", "build"]))

    results: List[CommandResult] = []
    all_issues: List[Issue] = []

    # Run commands, keep going
    for name, cmd in commands:
        log_path = out_dir / f"{name}.log"
        res = run_cmd(name, cmd, cwd=root, log_path=log_path, env=env, timeout_sec=args.timeout)
        results.append(res)

        # Parse issues from log
        kind = name.upper()
        parsed = parse_log_for_issues(root, kind=kind, log_path=log_path)

        # Improve suggestions using rule engine
        for it in parsed:
            it.suggested_fix = suggest_fix_for_signature(it.signature, it.message)

        all_issues.extend(parsed)

    # Static scan
    findings: List[StaticFinding] = []
    if not args.skip_static_scan:
        findings = static_findings(root)

        # Convert some static findings into low/med issues (actionable hygiene)
        # Example: excessive non-null assertions or TODO density in critical directories
        todo_hits = next((f for f in findings if f.name == "TODO"), None)
        if todo_hits and len(todo_hits.matches) >= 40:
            all_issues.append(Issue(
                issue_id="",
                severity="LOW",
                kind="STATIC",
                signature="todo-density",
                message=f"High TODO density: {len(todo_hits.matches)} matches",
                locations=[todo_hits.matches[0]],
                evidence="TODO hotspots detected; review and prune or convert to tracked issues.",
                suggested_fix=[
                    "For core runtime paths (SSE, session sync, backend handlers), remove TODOs or convert to explicit tracked work items.",
                    "Avoid leaving TODOs in production-critical paths without a follow-up issue reference.",
                ],
                related_issue_ids=[],
            ))

    # Finalize issues: dedupe + IDs + related links
    issues = dedupe_and_assign_ids(all_issues)
    compute_related(issues)

    # Write JSON report
    json_path = out_dir / "report.json"
    payload = {
        "meta": {
            "generated_at": _dt.datetime.now().isoformat(timespec="seconds"),
            "repo_root": str(root),
            "git": git,
            "versions": versions,
        },
        "commands": [dataclasses.asdict(r) for r in results],
        "issues": [dataclasses.asdict(i) for i in issues],
        "static_findings": [
            {"name": f.name, "description": f.description, "matches": f.matches[:200]}
            for f in findings
        ],
    }
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # Write Markdown report
    md_path = out_dir / "report.md"
    md = render_markdown_report(root, out_dir, git, versions, results, issues, findings)
    md_path.write_text(md, encoding="utf-8")

    # Console summary
    hi = sum(1 for x in issues if x.severity == "HIGH")
    mi = sum(1 for x in issues if x.severity == "MED")
    li = sum(1 for x in issues if x.severity == "LOW")
    print(f"[doctor] report: {md_path}")
    print(f"[doctor] json:    {json_path}")
    print(f"[doctor] issues:  HIGH={hi} MED={mi} LOW={li}")

    # Exit non-zero if any HIGH or command failed
    any_fail = any(r.exit_code != 0 for r in results)
    if any_fail or hi > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
