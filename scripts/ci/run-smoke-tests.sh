#!/usr/bin/env bash
# Run smoke tests against a freshly built Docker container.
#
# Starts two containers:
#   1. Unauthenticated on port 8080 — for general endpoint tests
#   2. Authenticated (CLAWBACK_SECRET=test-secret) on port 8081 — for auth tests
#
# Waits for both containers to become healthy, runs pytest, then tears
# everything down (via trap to ensure cleanup even on failure).
#
# Usage: ./scripts/ci/run-smoke-tests.sh <image>
#   image  Docker image name:tag to test

set -euo pipefail

IMAGE="${1:?Usage: $0 <docker-image>}"

CONTAINER_NOAUTH="clawback-smoke-noauth"
CONTAINER_AUTH="clawback-smoke-auth"
PORT_NOAUTH=8080
PORT_AUTH=8081
MAX_WAIT=30

cleanup() {
    echo "--- Tearing down smoke test containers ---"
    docker rm -f "$CONTAINER_NOAUTH" 2>/dev/null || true
    docker rm -f "$CONTAINER_AUTH" 2>/dev/null || true
}
trap cleanup EXIT

echo "--- Starting unauthenticated container on port $PORT_NOAUTH ---"
docker run -d \
    --name "$CONTAINER_NOAUTH" \
    -p "${PORT_NOAUTH}:8080" \
    "$IMAGE"

echo "--- Starting authenticated container on port $PORT_AUTH ---"
docker run -d \
    --name "$CONTAINER_AUTH" \
    -p "${PORT_AUTH}:8080" \
    -e CLAWBACK_SECRET=test-secret \
    "$IMAGE"

wait_for_health() {
    local port="$1"
    local label="$2"
    local elapsed=0

    echo "Waiting for $label (port $port) to become healthy..."
    while [ "$elapsed" -lt "$MAX_WAIT" ]; do
        if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
            echo "$label is healthy (${elapsed}s)"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo "ERROR: $label did not become healthy within ${MAX_WAIT}s"
    echo "--- Container logs ---"
    docker logs "$3" 2>&1 || true
    return 1
}

wait_for_health "$PORT_NOAUTH" "unauthenticated container" "$CONTAINER_NOAUTH"
wait_for_health "$PORT_AUTH" "authenticated container" "$CONTAINER_AUTH"

echo "--- Running smoke tests ---"
SMOKE_TEST_URL="http://localhost:${PORT_NOAUTH}" \
SMOKE_TEST_AUTH_URL="http://localhost:${PORT_AUTH}" \
    python -m pytest tests/smoke/ -v

echo "--- Smoke tests passed ---"
