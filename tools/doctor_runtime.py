#!/usr/bin/env python3
"""
Runtime + deep static checks for OpenHei.

Called by tools/doctor.py to validate:
- backend start/stop/restart
- backend /health + discovered API GET endpoints
- discovered SSE endpoints (probe: connect + read events)
- basic UI runtime reachability (HTTP 200 for app root)
- optional e2e if Playwright config exists (runs bunx playwright test)
- small-issue scans (BiDi chars, TODO/FIXME, console.error/warn, any-casts, non-null assertions)

Outputs (inside the same _doctor/<stamp>/ folder):
- runtime_working.md
- runtime_broken.md
- dev_report.json (minified)
"""

from __future__ import annotations

import dataclasses
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# -----------------------------
# Models
# -----------------------------

@dataclasses.dataclass
class SourceLoc:
    path: str
    line: int
    symbol: str = ""

@dataclasses.dataclass
class CheckResult:
    component: str            # BACKEND | UI | API | SSE | TUI | HYGIENE | E2E
    name: str
    status: str               # PASS | FAIL | SKIP
    severity: str             # HIGH | MED | LOW
    message: str
    evidence: str
    sources: List[SourceLoc]
    suggested_fix: List[str]
    related: List[str]        # related check names

@dataclasses.dataclass
class ProcHandle:
    name: str
    cwd: Path
    cmd: List[str]
    pid: int
    p: subprocess.Popen
    log_path: Path


# -----------------------------
# Helpers
# -----------------------------

DEFAULT_TIMEOUT_S = 180
DEFAULT_BACKEND_PORT = int(os.environ.get("OPENHEI_BACKEND_PORT", "4096"))
DEFAULT_UI_PORT = int(os.environ.get("OPENHEI_UI_PORT", "4444"))

DEFAULT_EXCLUDES = {
    "node_modules", ".git", "dist", "build", ".next", ".turbo", ".cache",
    "coverage", ".venv", "venv", "__pycache__", ".idea", ".vscode",
}

BIDI_CHARS = [
    "\u202A", "\u202B", "\u202D", "\u202E", "\u202C",  # LRE/RLE/LRO/RLO/PDF
    "\u2066", "\u2067", "\u2068", "\u2069",            # LRI/RLI/FSI/PDI
    "\u200E", "\u200F",                                # LRM/RLM
]

def _which(cmd: str) -> Optional[str]:
    from shutil import which
    return which(cmd)

def _run(cmd: List[str], cwd: Path, env: Dict[str, str], timeout_s: int) -> Tuple[int, str]:
    try:
        out = subprocess.check_output(cmd, cwd=str(cwd), env=env, stderr=subprocess.STDOUT, text=True, timeout=timeout_s)
        return 0, out
    except subprocess.CalledProcessError as e:
        return e.returncode, e.output or ""
    except Exception as e:
        return 1, f"[doctor_runtime] exception: {e}"

def _tail(p: Path, max_lines: int = 120) -> str:
    try:
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[-max_lines:])
    except Exception:
        return ""

def _is_excluded(path: Path) -> bool:
    return any(part in DEFAULT_EXCLUDES for part in path.parts)

def _read_text_safe(p: Path, max_bytes: int = 2_000_000) -> str:
    try:
        if p.stat().st_size > max_bytes:
            return ""
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""

def _find_enclosing_symbol(file_text: str, line_1based: int) -> str:
    # best-effort: scan upward for function/const/class definitions
    lines = file_text.splitlines()
    i = min(max(line_1based - 1, 0), len(lines) - 1)
    pat = re.compile(r"^\s*(export\s+)?(async\s+)?(function|class)\s+([A-Za-z0-9_]+)\b|^\s*(export\s+)?const\s+([A-Za-z0-9_]+)\s*=")
    for j in range(i, max(i - 80, -1), -1):
        m = pat.search(lines[j])
        if not m:
            continue
        if m.group(4):
            return m.group(4)
        if m.group(6):
            return m.group(6)
    return ""

def _http_get(url: str, headers: Dict[str, str], timeout_s: int) -> Tuple[int, str]:
    req = Request(url=url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            body = resp.read(4096)
            return resp.status, body.decode("utf-8", errors="replace")
    except HTTPError as e:
        try:
            body = e.read(4096).decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return e.code, body
    except URLError as e:
        return 0, f"URLError: {e}"
    except Exception as e:
        return 0, f"Exception: {e}"

def _wait_port(host: str, port: int, timeout_s: int) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            with socket.create_connection((host, port), timeout=1.0):
                return True
        except Exception:
            time.sleep(0.2)
    return False

def _port_closed(host: str, port: int, timeout_s: int) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            with socket.create_connection((host, port), timeout=1.0):
                time.sleep(0.2)
        except Exception:
            return True
    return False

def _start_proc(name: str, cwd: Path, cmd: List[str], env: Dict[str, str], log_path: Path) -> ProcHandle:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    f = log_path.open("w", encoding="utf-8")
    f.write(f"== {name} ==\n")
    f.write(f"cwd: {cwd}\n")
    f.write(f"cmd: {' '.join(cmd)}\n\n")
    f.flush()

    p = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=f,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,  # allow killpg
    )
    return ProcHandle(name=name, cwd=cwd, cmd=cmd, pid=p.pid, p=p, log_path=log_path)

def _stop_proc(ph: ProcHandle, timeout_s: int = 15) -> Tuple[bool, str]:
    # SIGTERM process group; then SIGKILL if needed
    try:
        os.killpg(ph.pid, signal.SIGTERM)
    except Exception:
        pass
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if ph.p.poll() is not None:
            return True, f"stopped exit={ph.p.returncode}"
        time.sleep(0.2)
    try:
        os.killpg(ph.pid, signal.SIGKILL)
    except Exception:
        pass
    time.sleep(0.5)
    return ph.p.poll() is not None, f"forced-kill exit={ph.p.returncode}"

def _rg(root: Path, pattern: str, max_hits: int = 400) -> List[Tuple[str, int, str]]:
    rg = _which("rg")
    hits: List[Tuple[str, int, str]] = []
    if rg:
        cmd = [rg, "-n", "--no-heading", "--color", "never", pattern, str(root)]
        code, out = _run(cmd, cwd=root, env=dict(os.environ), timeout_s=60)
        if code != 0:
            return []
        for line in out.splitlines():
            parts = line.split(":", 2)
            if len(parts) != 3:
                continue
            p, ln, txt = parts
            if len(hits) >= max_hits:
                break
            try:
                lni = int(ln)
            except Exception:
                lni = 0
            hits.append((p, lni, txt))
        return hits

    # fallback scan
    rx = re.compile(pattern)
    for fp in root.rglob("*"):
        if not fp.is_file():
            continue
        if _is_excluded(fp):
            continue
        if fp.suffix.lower() not in {".ts",".tsx",".js",".jsx",".mjs",".cjs",".css",".json",".md",".yml",".yaml",".py",".sh",".toml"}:
            continue
        txt = _read_text_safe(fp)
        if not txt:
            continue
        rel = str(fp.relative_to(root))
        for i, ln in enumerate(txt.splitlines(), start=1):
            if rx.search(ln):
                hits.append((rel, i, ln.strip()))
                if len(hits) >= max_hits:
                    return hits
    return hits

def _discover_get_routes(root: Path) -> Dict[str, List[SourceLoc]]:
    # best-effort: find .get("/path") / app.get("/path")
    hits = _rg(root, r'\.(get)\(\s*["\']\/[^"\']+["\']')
    routes: Dict[str, List[SourceLoc]] = {}
    rx = re.compile(r'\.get\(\s*["\'](?P<path>\/[^"\']+)["\']')
    for p, ln, txt in hits:
        m = rx.search(txt)
        if not m:
            continue
        path = m.group("path")
        fp = root / p
        sym = ""
        ft = _read_text_safe(fp)
        if ft:
            sym = _find_enclosing_symbol(ft, ln)
        routes.setdefault(path, []).append(SourceLoc(path=p, line=ln, symbol=sym))
    return routes

def _discover_sse_routes(root: Path) -> Dict[str, List[SourceLoc]]:
    # find text/event-stream and try to infer nearby route string on same line
    hits = _rg(root, r"text\/event-stream")
    out: Dict[str, List[SourceLoc]] = {}
    str_rx = re.compile(r'["\'](\/[^"\']+)["\']')
    for p, ln, txt in hits:
        candidates = str_rx.findall(txt)
        path = candidates[0] if candidates else "(unknown)"
        fp = root / p
        sym = ""
        ft = _read_text_safe(fp)
        if ft:
            sym = _find_enclosing_symbol(ft, ln)
        out.setdefault(path, []).append(SourceLoc(path=p, line=ln, symbol=sym))
    return out

def _parse_extra_headers(env: Dict[str, str]) -> Dict[str, str]:
    # supports:
    # OPENHEI_DOCTOR_HEADER="Authorization: Bearer abc"
    # OPENHEI_DOCTOR_HEADERS_JSON='{"Authorization":"Bearer abc","x-foo":"bar"}'
    headers: Dict[str, str] = {}
    h = env.get("OPENHEI_DOCTOR_HEADER", "").strip()
    if h and ":" in h:
        k, v = h.split(":", 1)
        headers[k.strip()] = v.strip()
    hj = env.get("OPENHEI_DOCTOR_HEADERS_JSON", "").strip()
    if hj:
        try:
            obj = json.loads(hj)
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if isinstance(k, str) and isinstance(v, str):
                        headers[k] = v
        except Exception:
            pass
    return headers

def _sse_probe(url: str, headers: Dict[str, str], timeout_s: int) -> Tuple[bool, str, int]:
    """
    Connect to SSE and read up to first few lines.
    PASS if HTTP 200 and we see at least one 'data:' or 'event:' line within timeout.
    """
    req = Request(url=url, headers={**headers, "Accept": "text/event-stream"}, method="GET")
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            status = resp.status
            t0 = time.time()
            buf = []
            while time.time() - t0 < timeout_s:
                line = resp.readline()
                if not line:
                    break
                s = line.decode("utf-8", errors="replace").rstrip("\n")
                buf.append(s)
                if s.startswith("data:") or s.startswith("event:"):
                    return True, "\n".join(buf[-12:]), status
            return False, "\n".join(buf[-12:]) or "no SSE frames within timeout", status
    except HTTPError as e:
        return False, f"HTTPError {e.code}", e.code
    except URLError as e:
        return False, f"URLError: {e}", 0
    except Exception as e:
        return False, f"Exception: {e}", 0


# -----------------------------
# Runtime suite
# -----------------------------

def run_runtime_suite(root: Path, out_dir: Path, timeout_sec: int, base_env: Dict[str, str]) -> Dict[str, object]:
    """
    Returns summary dict. Also writes runtime_working.md / runtime_broken.md / dev_report.json.
    """
    env = dict(base_env)
    extra_headers = _parse_extra_headers(env)

    runtime_log_dir = out_dir / "runtime_logs"
    runtime_log_dir.mkdir(parents=True, exist_ok=True)

    checks: List[CheckResult] = []
    procs: List[ProcHandle] = []

    # Resolve backend + UI working dirs
    backend_dir = root / env.get("OPENHEI_BACKEND_DIR", "packages/openhei")
    ui_dir = None
    if (root / "app" / "package.json").exists():
        ui_dir = root / "app"
    elif (root / "packages/app" / "package.json").exists():
        ui_dir = root / "packages/app"
    else:
        ui_dir = root

    backend_port = int(env.get("OPENHEI_BACKEND_PORT", str(DEFAULT_BACKEND_PORT)))
    ui_port = int(env.get("OPENHEI_UI_PORT", str(DEFAULT_UI_PORT)))

    backend_base = f"http://127.0.0.1:{backend_port}"
    ui_base = f"http://127.0.0.1:{ui_port}"

    def add(component: str, name: str, status: str, severity: str, message: str, evidence: str,
            sources: List[SourceLoc], suggested_fix: List[str], related: List[str] = None):
        checks.append(CheckResult(
            component=component,
            name=name,
            status=status,
            severity=severity,
            message=message,
            evidence=evidence,
            sources=sources,
            suggested_fix=suggested_fix,
            related=related or [],
        ))

    # -------------------------
    # Start backend
    # -------------------------
    if not backend_dir.exists():
        add("BACKEND", "start_backend", "FAIL", "HIGH",
            f"backend dir missing: {backend_dir}", "",
            [], [f"Set OPENHEI_BACKEND_DIR to correct path (expected packages/openhei)."])
        return _write_reports(root, out_dir, checks)

    if not _which("bun"):
        add("BACKEND", "start_backend", "FAIL", "HIGH",
            "bun not found in PATH", "", [], ["Install bun and retry."])
        return _write_reports(root, out_dir, checks)

    backend_pkg = backend_dir / "package.json"
    backend_script = env.get("OPENHEI_BACKEND_SCRIPT", "").strip()
    if not backend_script and backend_pkg.exists():
        try:
            obj = json.loads(_read_text_safe(backend_pkg))
            scripts = (obj.get("scripts") or {})
            # prefer "serve", then "dev", then "start"
            for cand in ["serve", "dev", "start"]:
                if cand in scripts:
                    backend_script = cand
                    break
        except Exception:
            pass
    if not backend_script:
        backend_script = "serve"

    backend_cmd = ["bun", "run", backend_script, "--", "--port", str(backend_port)]
    backend_log = runtime_log_dir / "backend.log"

    try:
        ph = _start_proc("backend", backend_dir, backend_cmd, env, backend_log)
        procs.append(ph)
        ok = _wait_port("127.0.0.1", backend_port, timeout_s=min(30, timeout_sec))
        if not ok:
            add("BACKEND", "start_backend", "FAIL", "HIGH",
                "backend did not open port in time",
                _tail(backend_log), [],
                ["Fix backend startup crash; inspect runtime_logs/backend.log.",
                 "Ensure the chosen script supports '-- --port <n>'. If not, set OPENHEI_BACKEND_SCRIPT and OPENHEI_BACKEND_PORT."])
        else:
            add("BACKEND", "start_backend", "PASS", "HIGH",
                f"backend started pid={ph.pid} port={backend_port}",
                "", [], [])
    except Exception as e:
        add("BACKEND", "start_backend", "FAIL", "HIGH",
            f"backend failed to start: {e}", _tail(backend_log), [],
            ["Inspect runtime_logs/backend.log."])

    # If backend is dead, skip rest but still emit hygiene scan.
    backend_alive = any(c.component == "BACKEND" and c.name == "start_backend" and c.status == "PASS" for c in checks)

    # -------------------------
    # Backend /health probes
    # -------------------------
    if backend_alive:
        health_paths = ["/health", "/api/health", "/_health", "/status"]
        got = False
        for hp in health_paths:
            code, body = _http_get(backend_base + hp, headers=extra_headers, timeout_s=10)
            if code == 200:
                add("API", f"backend_health {hp}", "PASS", "HIGH",
                    f"200 OK {hp}", body[:400], [], [])
                got = True
                break
        if not got:
            add("API", "backend_health", "FAIL", "HIGH",
                "No health endpoint returned 200",
                "\n".join([f"{p} -> {_http_get(backend_base+p, extra_headers, 5)[0]}" for p in health_paths]),
                [], ["Implement or expose a stable /health endpoint returning 200.",
                     "If health requires auth, set OPENHEI_DOCTOR_HEADER / OPENHEI_DOCTOR_HEADERS_JSON."])

    # -------------------------
    # Discover + probe API GET endpoints
    # -------------------------
    route_sources: Dict[str, List[SourceLoc]] = {}
    if backend_alive:
        route_sources = _discover_get_routes(root)
        # test a limited number to keep runtime bounded
        paths = sorted([p for p in route_sources.keys() if p.startswith("/")])
        paths = [p for p in paths if not re.search(r":[A-Za-z]", p)]  # skip parameterized
        max_endpoints = int(env.get("OPENHEI_DOCTOR_MAX_ENDPOINTS", "60"))
        paths = paths[:max_endpoints]

        bad = 0
        for pth in paths:
            code, body = _http_get(backend_base + pth, headers=extra_headers, timeout_s=10)
            srcs = route_sources.get(pth, [])
            if code in (200, 204, 301, 302):
                add("API", f"GET {pth}", "PASS", "MED", f"HTTP {code}", body[:240], srcs, [])
            elif code in (401, 403):
                add("API", f"GET {pth}", "SKIP", "LOW", f"HTTP {code} auth required", body[:240], srcs,
                    ["If this endpoint should be public, fix auth gate.",
                     "If private, set OPENHEI_DOCTOR_HEADER / OPENHEI_DOCTOR_HEADERS_JSON for probing."])
            elif code == 0:
                bad += 1
                add("API", f"GET {pth}", "FAIL", "HIGH", "request failed", body[:400], srcs,
                    ["Backend crashed or request handler threw. Check runtime_logs/backend.log for stack traces.",
                     "Fix handler and add regression test."])
            else:
                bad += 1
                sev = "HIGH" if code >= 500 else "MED"
                add("API", f"GET {pth}", "FAIL", sev, f"HTTP {code}", body[:400], srcs,
                    ["Fix route handler to return correct status and avoid throwing.",
                     "If this is expected, update route or remove from discovery allowlist."])
        if bad == 0 and paths:
            add("API", "api_probe_summary", "PASS", "LOW",
                f"Probed {len(paths)} GET endpoints; no failures", "", [], [])
        elif paths:
            add("API", "api_probe_summary", "FAIL", "MED",
                f"Probed {len(paths)} GET endpoints; failures={bad}", "", [], ["Fix failing endpoints above."])

    # -------------------------
    # Discover + probe SSE endpoints
    # -------------------------
    sse_sources: Dict[str, List[SourceLoc]] = {}
    if backend_alive:
        sse_sources = _discover_sse_routes(root)
        sse_paths = sorted(sse_sources.keys())
        # only try concrete paths
        sse_paths = [p for p in sse_paths if p.startswith("/") and p != "/"]
        sse_paths = list(dict.fromkeys(sse_paths))[:20]

        if not sse_paths:
            add("SSE", "sse_discovery", "SKIP", "LOW",
                "No SSE endpoints discovered via text/event-stream scan", "", [], [
                    "If SSE exists but not detected, add explicit marker or keep handler in a known file and pattern.",
                ])
        else:
            for pth in sse_paths:
                ok, ev, code = _sse_probe(backend_base + pth, headers=extra_headers, timeout_s=10)
                srcs = sse_sources.get(pth, [])
                if ok:
                    add("SSE", f"SSE {pth}", "PASS", "HIGH", f"HTTP {code} SSE frames observed", ev, srcs, [])
                else:
                    sev = "HIGH" if code in (0, 500, 502, 503) else "MED"
                    add("SSE", f"SSE {pth}", "FAIL", sev, f"SSE probe failed (HTTP {code})", ev, srcs, [
                        "Ensure handler sets Content-Type: text/event-stream; Cache-Control: no-cache; Connection: keep-alive.",
                        "Ensure it emits at least one frame quickly (hello/heartbeat) to avoid 'stuck' UI.",
                        "If auth required, set OPENHEI_DOCTOR_HEADER / OPENHEI_DOCTOR_HEADERS_JSON.",
                    ])

    # -------------------------
    # Start UI dev server + basic reachability
    # -------------------------
    ui_started = False
    if (ui_dir / "package.json").exists() and _which("bun"):
        ui_script = env.get("OPENHEI_UI_SCRIPT", "").strip()
        if not ui_script:
            try:
                obj = json.loads(_read_text_safe(ui_dir / "package.json"))
                scripts = (obj.get("scripts") or {})
                for cand in ["dev", "start"]:
                    if cand in scripts:
                        ui_script = cand
                        break
            except Exception:
                pass
        if not ui_script:
            ui_script = "dev"

        ui_cmd = ["bun", "run", ui_script, "--", "--port", str(ui_port)]
        ui_log = runtime_log_dir / "ui.log"
        try:
            ph_ui = _start_proc("ui", ui_dir, ui_cmd, env, ui_log)
            procs.append(ph_ui)
            ok = _wait_port("127.0.0.1", ui_port, timeout_s=min(40, timeout_sec))
            if ok:
                ui_started = True
                add("UI", "start_ui", "PASS", "MED", f"UI started pid={ph_ui.pid} port={ui_port}", "", [], [])
            else:
                add("UI", "start_ui", "FAIL", "MED", "UI did not open port in time", _tail(ui_log), [], [
                    "Fix UI dev server startup; inspect runtime_logs/ui.log.",
                    "If UI does not accept '-- --port', set OPENHEI_UI_SCRIPT and OPENHEI_UI_PORT or remove the port arg.",
                ])
        except Exception as e:
            add("UI", "start_ui", "FAIL", "MED", f"UI failed to start: {e}", _tail(ui_log), [], [
                "Inspect runtime_logs/ui.log.",
            ])
    else:
        add("UI", "start_ui", "SKIP", "LOW", f"UI package.json not found at {ui_dir} or bun missing", "", [], [])

    if ui_started:
        code, body = _http_get(ui_base + "/", headers={}, timeout_s=10)
        if code == 200:
            add("UI", "ui_root_http", "PASS", "MED", "UI root returns 200", body[:240], [], [])
        else:
            add("UI", "ui_root_http", "FAIL", "MED", f"UI root HTTP {code}", body[:400], [], [
                "Fix UI routing/server; ensure dev server serves root page.",
            ])

    # -------------------------
    # Stop/Restart behavior (backend)
    # -------------------------
    if backend_alive:
        backend_ph = next((p for p in procs if p.name == "backend"), None)
        if backend_ph:
            pid_before = backend_ph.pid
            ok, msg = _stop_proc(backend_ph, timeout_s=15)
            closed = _port_closed("127.0.0.1", backend_port, timeout_s=10)
            if ok and closed:
                add("BACKEND", "stop_backend", "PASS", "HIGH",
                    f"Stop ok pid={pid_before} port closed", msg, [], [])
            else:
                add("BACKEND", "stop_backend", "FAIL", "HIGH",
                    f"Stop failed pid={pid_before} port_closed={closed}", msg + "\n" + _tail(backend_ph.log_path), [], [
                        "Fix shutdown handler: ensure SIGTERM exits, closes server, and releases port.",
                        "Stop must never hang; add forced shutdown timeout.",
                    ])

            # restart
            # (start again)
            backend_log2 = runtime_log_dir / "backend_restart.log"
            try:
                ph2 = _start_proc("backend_restart", backend_dir, backend_cmd, env, backend_log2)
                procs.append(ph2)
                ok2 = _wait_port("127.0.0.1", backend_port, timeout_s=min(30, timeout_sec))
                if ok2:
                    add("BACKEND", "restart_backend", "PASS", "HIGH",
                        f"Restart ok pid={ph2.pid}", "", [], [])
                else:
                    add("BACKEND", "restart_backend", "FAIL", "HIGH",
                        "Restart did not open port", _tail(backend_log2), [], [
                            "Fix restart reliability; backend must bind the same port after Stop.",
                        ])
            except Exception as e:
                add("BACKEND", "restart_backend", "FAIL", "HIGH",
                    f"Restart exception: {e}", _tail(backend_log2), [], ["Inspect backend_restart.log."])

    # -------------------------
    # Optional E2E (Playwright) - if config exists
    # -------------------------
    pw_cfg = None
    for cand in [root / "playwright.config.ts", root / "packages/app/playwright.config.ts", root / "app/playwright.config.ts"]:
        if cand.exists():
            pw_cfg = cand
            break
    if pw_cfg and _which("bun"):
        # run existing tests; no brittle custom selectors
        code, out = _run(["bunx", "playwright", "test", "--reporter=line"], cwd=root, env=env, timeout_s=min(900, timeout_sec))
        if code == 0:
            add("E2E", "playwright", "PASS", "MED", "Playwright suite passed", out[-1200:], [SourceLoc(path=str(pw_cfg.relative_to(root)), line=1)], [])
        else:
            add("E2E", "playwright", "FAIL", "MED", "Playwright suite failed", out[-1800:], [SourceLoc(path=str(pw_cfg.relative_to(root)), line=1)], [
                "Fix failing e2e tests or update suite to match current UI.",
                "Prefer stable user-journey smoke tests: load → send → stream → stop → restart → reconnect.",
            ])
    else:
        add("E2E", "playwright", "SKIP", "LOW", "No playwright config detected", "", [], [])

    # -------------------------
    # Hygiene scans (small issues)
    # -------------------------
    _run_hygiene_scans(root, add)

    # cleanup started procs (leave nothing running)
    for ph in reversed(procs):
        try:
            _stop_proc(ph, timeout_s=10)
        except Exception:
            pass

    return _write_reports(root, out_dir, checks)


def _run_hygiene_scans(root: Path, add):
    # BiDi control chars
    bidi_hits: List[SourceLoc] = []
    for fp in root.rglob("*"):
        if not fp.is_file() or _is_excluded(fp):
            continue
        if fp.suffix.lower() not in {".ts",".tsx",".js",".jsx",".md",".json",".yml",".yaml",".css"}:
            continue
        txt = _read_text_safe(fp)
        if not txt:
            continue
        for i, ln in enumerate(txt.splitlines(), start=1):
            if any(ch in ln for ch in BIDI_CHARS):
                bidi_hits.append(SourceLoc(path=str(fp.relative_to(root)), line=i, symbol=""))
                if len(bidi_hits) >= 50:
                    break
        if len(bidi_hits) >= 50:
            break

    if bidi_hits:
        add("HYGIENE", "bidi_chars", "FAIL", "HIGH",
            f"BiDi control chars detected (sample {len(bidi_hits)} locations)",
            "BiDi characters are a supply-chain risk and can hide malicious diffs.",
            bidi_hits[:12],
            ["Remove BiDi chars; add/keep CI guard to block them repository-wide."])
    else:
        add("HYGIENE", "bidi_chars", "PASS", "HIGH", "No BiDi control chars detected (sampled all text files)", "", [], [])

    # TODO/FIXME/console and type-risk patterns (counts)
    patterns = [
        ("todo", r"\bTODO\b", "LOW"),
        ("fixme", r"\bFIXME\b", "LOW"),
        ("console_error", r"\bconsole\.error\b", "LOW"),
        ("console_warn", r"\bconsole\.warn\b", "LOW"),
        ("ts_any", r"\bas\s+any\b", "LOW"),
        ("non_null", r"!\.", "LOW"),
    ]
    for name, pat, sev in patterns:
        hits = _rg(root, pat, max_hits=200)
        if hits:
            srcs = []
            for p, ln, _ in hits[:12]:
                txt = _read_text_safe(root / p)
                sym = _find_enclosing_symbol(txt, ln) if txt else ""
                srcs.append(SourceLoc(path=p, line=ln, symbol=sym))
            add("HYGIENE", name, "FAIL", sev,
                f"{name} matches={len(hits)} (sample shown)",
                "\n".join([f"{p}:{ln}" for p, ln, _ in hits[:20]]),
                srcs,
                ["Triage by directory: runtime paths first (SSE/session sync/backend handlers).",
                 "Convert critical TODOs into tracked issues or remove them."])
        else:
            add("HYGIENE", name, "PASS", sev, f"{name} no matches", "", [], [])


def _write_reports(root: Path, out_dir: Path, checks: List[CheckResult]) -> Dict[str, object]:
    working = [c for c in checks if c.status == "PASS"]
    broken = [c for c in checks if c.status == "FAIL"]
    skipped = [c for c in checks if c.status == "SKIP"]

    # related: by same component
    by_comp: Dict[str, List[str]] = {}
    for c in checks:
        by_comp.setdefault(c.component, []).append(c.name)
    for c in checks:
        c.related = [x for x in by_comp.get(c.component, []) if x != c.name][:8]

    (out_dir / "runtime_working.md").write_text(_render_md("Working functions", working), encoding="utf-8")
    (out_dir / "runtime_broken.md").write_text(_render_md("Broken functions", broken), encoding="utf-8")

    # Dev report: minified JSON, grouped by file (best-effort)
    dev = _render_dev_report_json(broken)
    (out_dir / "dev_report.json").write_text(json.dumps(dev, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

    return {
        "pass_count": len(working),
        "fail_count": len(broken),
        "skip_count": len(skipped),
        "working_report": str((out_dir / "runtime_working.md").relative_to(root)),
        "broken_report": str((out_dir / "runtime_broken.md").relative_to(root)),
        "dev_report": str((out_dir / "dev_report.json").relative_to(root)),
    }


def _render_md(title: str, items: List[CheckResult]) -> str:
    lines: List[str] = []
    lines.append(f"# {title}\n")
    if not items:
        lines.append("No items.\n")
        return "\n".join(lines)

    # Summary table
    lines.append("| Component | Check | Severity | Message | Sources |")
    lines.append("|---|---|---|---|---|")
    for c in items:
        src = ", ".join([f"{s.path}:{s.line}" + (f" ({s.symbol})" if s.symbol else "") for s in c.sources[:3]])
        lines.append(f"| `{c.component}` | `{c.name}` | `{c.severity}` | {c.message.replace('|',' ')} | {src.replace('|',' ')} |")
    lines.append("")

    # Details
    for c in items:
        lines.append(f"## {c.component} — {c.name} — {c.status} ({c.severity})\n")
        lines.append(f"- Message: {c.message}")
        if c.sources:
            lines.append("- Sources:")
            for s in c.sources[:10]:
                if s.symbol:
                    lines.append(f"  - `{s.path}:{s.line}` `{s.symbol}`")
                else:
                    lines.append(f"  - `{s.path}:{s.line}`")
        if c.evidence.strip():
            lines.append("\n**Evidence**")
            lines.append("```")
            lines.append(c.evidence.strip()[:2400])
            lines.append("```")
        if c.suggested_fix:
            lines.append("\n**Suggested fix (intent)**")
            for f in c.suggested_fix:
                lines.append(f"- {f}")
        if c.related:
            lines.append(f"\n**Related checks**: " + ", ".join([f"`{x}`" for x in c.related]))
        lines.append("")
    return "\n".join(lines)


def _render_dev_report_json(broken: List[CheckResult]) -> Dict[str, object]:
    # Group by source file
    by_file: Dict[str, List[CheckResult]] = {}
    for c in broken:
        files = [s.path for s in c.sources] or ["(unknown)"]
        by_file.setdefault(files[0], []).append(c)

    tasks = []
    for fp, items in sorted(by_file.items(), key=lambda x: (-len(x[1]), x[0])):
        task = {
            "title": f"Fix runtime failures in {fp}",
            "files": [fp] if fp != "(unknown)" else [],
            "failures": [{
                "component": c.component,
                "check": c.name,
                "severity": c.severity,
                "message": c.message,
                "evidence": c.evidence[:800],
                "sources": [{"path": s.path, "line": s.line, "symbol": s.symbol} for s in c.sources[:6]],
                "suggested_fix": c.suggested_fix[:6],
            } for c in items],
            "acceptance": [
                "doctor.py passes (including runtime suite): 0 FAIL items in runtime_broken.md",
                "Stop works: backend PID terminates; port closes; restart rebinds same port",
                "SSE endpoints return 200 and emit at least one frame quickly",
                "No request spam on reconnect (backoff observed in logs or e2e)",
            ],
            "evidence_pack": [
                "start commands used",
                "repro steps",
                "short screen recording (UI load → send → stream → Stop → restart → recover)",
                "backend logs",
                "PID proof before/after Stop",
                "network proof of backoff/no spam (browser network tab or e2e logs)"
            ],
        }
        tasks.append(task)

    return {"summary":{"broken_count":len(broken),"task_count":len(tasks)},"tasks":tasks}
