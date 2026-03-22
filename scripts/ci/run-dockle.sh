#!/usr/bin/env bash
# Run Dockle CIS Docker Benchmark checks against a built Docker image.
# Fails the build on FATAL-level findings only; WARN and INFO are acceptable.
#
# Usage: ./scripts/ci/run-dockle.sh [image-name]
#   image-name  Docker image to scan (default: clawback:security-scan)

set -euo pipefail

IMAGE="${1:-clawback:security-scan}"
DOCKLE_VERSION="0.4.15"

# Install Dockle if not already available
if ! command -v dockle &>/dev/null; then
    echo "Installing Dockle v${DOCKLE_VERSION}..."
    curl -sSL "https://github.com/goodwithtech/dockle/releases/download/v${DOCKLE_VERSION}/dockle_${DOCKLE_VERSION}_Linux-64bit.tar.gz" \
        | tar -xz -C /usr/local/bin dockle
fi

echo "Scanning image: ${IMAGE}"

# Ignore checks for findings inherited from the base image (python:3.12-slim)
# that we cannot fix in our own Dockerfile:
#   DKL-DI-0005: apt-get cache not cleared — occurs in base image layers
IGNORE_CHECKS="DKL-DI-0005"

# Run Dockle with JSON output, capturing results
RESULTS_FILE="dockle-results.json"
dockle -f json -o "$RESULTS_FILE" -i "$IGNORE_CHECKS" "$IMAGE" || true

# Parse JSON results to count FATAL findings
FATAL_COUNT=$(python3 -c "
import json, sys
with open('$RESULTS_FILE') as f:
    data = json.load(f)
details = data.get('details', [])
fatal = [d for d in details if d.get('level') == 'FATAL']
print(len(fatal))
")

# Display summary
echo ""
echo "=== Dockle CIS Docker Benchmark Results ==="
python3 -c "
import json
with open('$RESULTS_FILE') as f:
    data = json.load(f)
details = data.get('details', [])
counts = {}
for d in details:
    level = d.get('level', 'UNKNOWN')
    counts[level] = counts.get(level, 0) + 1
for level in ('FATAL', 'WARN', 'INFO', 'SKIP', 'PASS'):
    if level in counts:
        print(f'  {level}: {counts[level]}')
if not details:
    print('  No issues found')
"
echo ""

if [ "$FATAL_COUNT" -gt 0 ]; then
    echo "::error::Dockle found $FATAL_COUNT FATAL CIS Docker Benchmark violations"
    echo ""
    echo "FATAL findings:"
    python3 -c "
import json
with open('$RESULTS_FILE') as f:
    data = json.load(f)
details = data.get('details', [])
for d in details:
    if d.get('level') == 'FATAL':
        code = d.get('code', 'N/A')
        title = d.get('title', 'N/A')
        alerts = d.get('alerts', [])
        print(f'  [{code}] {title}')
        for alert in alerts:
            print(f'    - {alert}')
"
    exit 1
fi

echo "Dockle scan complete — no FATAL issues found"
