#!/usr/bin/env bash
# Run Bandit Python SAST scanner and output SARIF for GitHub Security tab.
# Fails the build if any HIGH or CRITICAL severity issues are found.
#
# Usage: ./scripts/ci/run-bandit.sh [output-file]
#   output-file  Path for SARIF output (default: bandit-results.sarif)

set -euo pipefail

OUTPUT="${1:-bandit-results.sarif}"

pip install --quiet bandit[sarif]

# Bandit exits non-zero when it finds any issues, so we allow that.
bandit -r app/ -f sarif -o "$OUTPUT" --severity-level medium || true

# Parse the SARIF we already generated to count HIGH/CRITICAL findings.
HIGH_COUNT=$(python3 -c "
import json, sys
data = json.load(open('$OUTPUT'))
results = data.get('runs', [{}])[0].get('results', [])
high = [r for r in results
        if r.get('properties', {}).get('issue_severity', '').upper() in ('HIGH', 'CRITICAL')]
print(len(high))
")

if [ "$HIGH_COUNT" -gt 0 ]; then
    echo "::error::Bandit found $HIGH_COUNT HIGH/CRITICAL severity issues"
    bandit -r app/ --severity-level high
    exit 1
fi

echo "Bandit scan complete — no HIGH/CRITICAL issues found"
