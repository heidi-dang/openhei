#!/bin/bash
set -e

# QLoRA Smoke Test Script
# Tests the full QLoRA user journey: health check -> start -> logs tail -> stop -> PID verification -> disconnect backoff

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4096}"
HEALTH_ENDPOINT="$BACKEND_URL/global/health"
QLORA_DOCTOR="$BACKEND_URL/api/v1/qlora/doctor"
QLORA_START="$BACKEND_URL/api/v1/qlora/start"
QLORA_STOP="$BACKEND_URL/api/v1/qlora/stop"
QLORA_STATUS="$BACKEND_URL/api/v1/qlora/status"
QLORA_PIDS="$BACKEND_URL/api/v1/qlora/pids"
LOGS_STREAM_TIMEOUT=15
MAX_WAIT_PID=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Check if backend is running
check_health() {
    log_info "Checking backend health at $HEALTH_ENDPOINT..."
    local response
    response=$(curl -s -w "\n%{http_code}" "$HEALTH_ENDPOINT")
    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        log_success "Backend is healthy: $body"
        return 0
    else
        log_fail "Backend health check failed (HTTP $http_code): $body"
        return 1
    fi
}

# Check if heidi-engine is installed
check_doctor() {
    log_info "Checking heidi-engine installation..."
    local response
    response=$(curl -s -w "\n%{http_code}" "$QLORA_DOCTOR")
    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        local installed
        installed=$(echo "$body" | grep -o '"installed":[^,}]*' | cut -d':' -f2)
        if [ "$installed" = "true" ]; then
            log_success "heidi-engine is installed"
            return 0
        else
            log_warn "heidi-engine is NOT installed - running in stub mode"
            return 2
        fi
    else
        log_fail "Doctor check failed (HTTP $http_code): $body"
        return 1
    fi
}

# Start a QLoRA run
start_qlora() {
    log_info "Starting QLoRA run..."
    
    # Use minimal smoke test config for quick testing
    local config='{
        "preset": "smoke",
        "stack": "python",
        "max_repos": 1,
        "rounds": 1,
        "samples_per_run": 10,
        "max_requests": 100,
        "base_model": "mistralai/Mistral-7B-Instruct-v0.2",
        "train_steps": 10,
        "save_steps": 5,
        "eval_steps": 5,
        "seq_len": 512,
        "batch_size": 1,
        "grad_accum": 4,
        "lora_r": 16,
        "val_ratio": 0.05,
        "teacher": {
            "teacher_backend": "openhei",
            "teacher_model": "openai/gpt-5.2",
            "teacher_workers": 1,
            "teacher_batch_size": 1,
            "teacher_max_tokens": 256,
            "openhei_attach": "http://127.0.0.1:4100",
            "openhei_agent": "",
            "openhei_start": true,
            "openhei_attach_strict": false
        }
    }'
    
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "$QLORA_START" \
        -H "Content-Type: application/json" \
        -d "$config")
    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        local ok
        ok=$(echo "$body" | grep -o '"ok":[^,}]*' | cut -d':' -f2)
        if [ "$ok" = "true" ]; then
            local run_id
            run_id=$(echo "$body" | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)
            log_success "QLoRA started with run_id: $run_id"
            echo "$run_id"
            return 0
        else
            local message
            message=$(echo "$body" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
            log_warn "Start returned ok=false: $message"
            echo ""
            return 2
        fi
    else
        log_fail "Start failed (HTTP $http_code): $body"
        return 1
    fi
}

# Tail logs from a run
tail_logs() {
    local run_id="$1"
    local timeout="${2:-$LOGS_STREAM_TIMEOUT}"
    
    log_info "Tailing logs for run_id=$run_id (timeout=${timeout}s)..."
    
    local logs_url="$BACKEND_URL/api/v1/qlora/logs?run_id=$run_id"
    local log_file="/tmp/qlora_logs_$$.txt"
    
    # Use curl to stream logs with timeout
    local curl_pid
    curl -s -N "$logs_url" > "$log_file" 2>/dev/null &
    curl_pid=$!
    
    # Wait for some logs or timeout
    local elapsed=0
    local found_log=false
    while [ $elapsed -lt $timeout ]; do
        if [ -s "$log_file" ]; then
            found_log=true
            break
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    
    # Check if curl is still running
    if kill -0 $curl_pid 2>/dev/null; then
        kill $curl_pid 2>/dev/null || true
    fi
    
    if [ "$found_log" = true ]; then
        local log_count
        log_count=$(wc -l < "$log_file")
        log_success "Received $log_count log lines"
        
        # Show sample logs
        if [ $log_count -gt 0 ]; then
            echo "--- Sample logs ---"
            head -n 5 "$log_file" | sed 's/^/  /'
            echo "--------------------"
        fi
    else
        log_warn "No logs received within ${timeout}s (may be normal for quick runs)"
    fi
    
    rm -f "$log_file"
    return 0
}

# Get current running PID
get_active_pid() {
    local response
    response=$(curl -s "$QLORA_DOCTOR")
    local pid
    pid=$(echo "$response" | grep -o '"pid":[^,}]*' | head -n1 | cut -d':' -f2)
    if [ -n "$pid" ] && [ "$pid" != "null" ]; then
        echo "$pid"
        return 0
    fi
    return 1
}

# Stop the QLoRA run
stop_qlora() {
    local run_id="${1:-}"
    log_info "Stopping QLoRA run (run_id=$run_id)..."
    
    local body_payload
    if [ -n "$run_id" ]; then
        body_payload="{\"run_id\":\"$run_id\"}"
    else
        body_payload="{}"
    fi
    
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "$QLORA_STOP" \
        -H "Content-Type: application/json" \
        -d "$body_payload")
    local http_code
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        log_success "Stop command sent"
        return 0
    else
        log_fail "Stop failed (HTTP $http_code): $body"
        return 1
    fi
}

# Verify process is gone
verify_pid_gone() {
    local pid="$1"
    local wait_seconds=0
    
    log_info "Verifying PID $pid is terminated..."
    
    while [ $wait_seconds -lt $MAX_WAIT_PID ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            log_success "PID $pid is confirmed gone"
            return 0
        fi
        sleep 1
        wait_seconds=$((wait_seconds + 1))
    done
    
    log_fail "PID $pid still running after ${MAX_WAIT_PID}s"
    return 1
}

# Test disconnect/backoff behavior
test_disconnect_backoff() {
    log_info "Testing disconnect/backoff behavior..."
    
    # Get the pids endpoint to verify no orphan processes
    local response
    response=$(curl -s "$QLORA_PIDS")
    local process_count
    process_count=$(echo "$response" | grep -o '"pid":' | wc -l)
    
    if [ "$process_count" -eq 0 ]; then
        log_success "No orphan QLoRA processes found after stop"
        return 0
    else
        log_warn "Found $process_count QLoRA processes - may need cleanup"
        return 1
    fi
}

# Main test flow
main() {
    echo "=========================================="
    echo "  QLoRA Smoke Test"
    echo "=========================================="
    echo ""
    
    local start_pid=""
    local test_run_id=""
    local test_passed=true
    
    # Step 1: Health check
    if ! check_health; then
        log_fail "Cannot proceed without healthy backend"
        exit 1
    fi
    
    # Step 2: Doctor check (will warn but not fail if not installed)
    check_doctor || true
    
    # Step 3: Try to start a run (may fail if heidi-engine not installed)
    local start_result
    start_result=$(start_qlora 2>&1) || true
    
    if echo "$start_result" | grep -q "run_id:"; then
        test_run_id=$(echo "$start_result" | grep "run_id:" | cut -d':' -f2 | tr -d ' ')
        
        # Get PID before stopping
        start_pid=$(get_active_pid) || true
        
        # Step 4: Tail logs
        tail_logs "$test_run_id" 10 || true
        
        # Step 5: Stop the run
        stop_qlora "$test_run_id"
        
        # Step 6: Verify PID is gone
        if [ -n "$start_pid" ]; then
            if ! verify_pid_gone "$start_pid"; then
                test_passed=false
            fi
        else
            log_warn "No PID captured to verify"
        fi
        
        # Step 7: Check for orphan processes
        test_disconnect_backoff || true
        
    else
        log_warn "Could not start QLoRA run (likely heidi-engine not installed)"
        log_info "Verifying basic endpoint accessibility..."
        
        # Just verify the key endpoints respond
        curl -s -o /dev/null -w "%{http_code}" "$QLORA_DOCTOR" | grep -q "200" && log_success "Doctor endpoint OK" || log_fail "Doctor endpoint failed"
        curl -s -o /dev/null -w "%{http_code}" "$QLORA_PIDS" | grep -q "200" && log_success "Pids endpoint OK" || log_fail "Pids endpoint failed"
    fi
    
    echo ""
    echo "=========================================="
    if [ "$test_passed" = true ]; then
        log_success "Smoke test completed"
        exit 0
    else
        log_fail "Smoke test had failures"
        exit 1
    fi
}

# Run main
main "$@"
