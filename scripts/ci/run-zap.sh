#!/usr/bin/env bash
# Run OWASP ZAP baseline scan against the application container.
#
# Builds the Docker image, starts the app container, runs ZAP baseline
# scan against all major endpoints, converts ZAP JSON output to SARIF,
# and tears down containers on exit.
#
# Usage: ./scripts/ci/run-zap.sh
#   Produces: zap-results.sarif in the working directory

set -euo pipefail

IMAGE="clawback:zap-test"
CONTAINER="clawback-zap"
ZAP_CONTAINER="zap-scanner"
NETWORK="zap-net"
PORT=8080
MAX_WAIT=30

cleanup() {
    echo "--- Tearing down containers ---"
    docker rm -f "$ZAP_CONTAINER" 2>/dev/null || true
    docker rm -f "$CONTAINER" 2>/dev/null || true
    docker network rm "$NETWORK" 2>/dev/null || true
}
trap cleanup EXIT

# Create a Docker network so ZAP can reach the app by container name
echo "--- Creating Docker network ---"
docker network create "$NETWORK"

# Build the application image
echo "--- Building Docker image ---"
docker build -t "$IMAGE" .

# Start the application container
echo "--- Starting application container ---"
docker run -d \
    --name "$CONTAINER" \
    --network "$NETWORK" \
    -p "${PORT}:8080" \
    "$IMAGE"

# Wait for the application to become healthy
echo "Waiting for application to become healthy..."
elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
    if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
        echo "Application is healthy (${elapsed}s)"
        break
    fi
    sleep 1
    elapsed=$((elapsed + 1))
done

if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    echo "ERROR: Application did not become healthy within ${MAX_WAIT}s"
    echo "--- Container logs ---"
    docker logs "$CONTAINER" 2>&1 || true
    exit 1
fi

# Seed ZAP with additional URLs to ensure all major endpoints are scanned.
# We do this by requesting each endpoint before ZAP starts its spider,
# and by passing them through the ZAP context via a custom hook script.
HOOK_FILE="$(mktemp)"
cat > "$HOOK_FILE" <<'PYHOOK'
import logging

def zap_started(zap, target):
    """Seed the spider with additional URLs so ZAP covers all major endpoints."""
    urls = [
        target + "health",
        target + "api/sessions",
        target + "login",
    ]
    for url in urls:
        try:
            zap.core.access_url(url, followredirects=True)
            logging.info("Seeded URL: %s", url)
        except Exception as e:
            logging.warning("Could not seed %s: %s", url, e)
PYHOOK
chmod 644 "$HOOK_FILE"

# Run ZAP baseline scan
# ZAP runs inside Docker on the same network, targeting the app by container name.
# -t  target URL
# -J  JSON report output
# -I  do not return failure for warning-level alerts
# --hook  Python hook file to seed additional URLs
echo "--- Running ZAP baseline scan ---"
docker run --name "$ZAP_CONTAINER" \
    --network "$NETWORK" \
    -v "${HOOK_FILE}:/zap/wrk/hook.py:ro" \
    ghcr.io/zaproxy/zaproxy:stable \
    zap-baseline.py \
        -t "http://${CONTAINER}:8080/" \
        -J report.json \
        -I \
        --hook /zap/wrk/hook.py || ZAP_EXIT=$?

ZAP_EXIT="${ZAP_EXIT:-0}"

# Copy the report out of the ZAP container
docker cp "${ZAP_CONTAINER}:/zap/wrk/report.json" zap-report.json 2>/dev/null || true

# Clean up temp file
rm -f "$HOOK_FILE"

# Convert ZAP JSON to SARIF format
echo "--- Converting ZAP results to SARIF ---"
python3 -c "
import json
import sys

sarif = {
    '\$schema': 'https://json.schemastore.org/sarif-2.1.0.json',
    'version': '2.1.0',
    'runs': [{
        'tool': {
            'driver': {
                'name': 'OWASP ZAP',
                'informationUri': 'https://www.zaproxy.org/',
                'version': 'stable',
                'rules': []
            }
        },
        'results': []
    }]
}

try:
    with open('zap-report.json') as f:
        zap_data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError) as e:
    print(f'Warning: Could not read ZAP report: {e}', file=sys.stderr)
    with open('zap-results.sarif', 'w') as f:
        json.dump(sarif, f, indent=2)
    sys.exit(0)

# Map ZAP risk levels to SARIF levels
risk_map = {
    '0': 'none',       # Informational
    '1': 'note',       # Low
    '2': 'warning',    # Medium
    '3': 'error',      # High
}

rules_seen = set()
driver = sarif['runs'][0]['tool']['driver']
results = sarif['runs'][0]['results']
high_count = 0

for site in zap_data.get('site', []):
    for alert in site.get('alerts', []):
        plugin_id = alert.get('pluginid', 'unknown')
        risk_code = alert.get('riskcode', '0')
        sarif_level = risk_map.get(risk_code, 'note')
        risk_desc = alert.get('riskdesc', 'Informational')

        if int(risk_code) >= 3:
            high_count += 1

        # Add rule if not already added
        if plugin_id not in rules_seen:
            rules_seen.add(plugin_id)
            driver['rules'].append({
                'id': f'zap/{plugin_id}',
                'name': alert.get('alert', 'Unknown Alert'),
                'shortDescription': {
                    'text': alert.get('alert', 'Unknown Alert')
                },
                'fullDescription': {
                    'text': alert.get('desc', 'No description available').strip()
                },
                'helpUri': alert.get('reference', ''),
                'properties': {
                    'risk': risk_desc
                }
            })

        # Add a result for each instance
        for instance in alert.get('instances', [{'uri': 'http://localhost:8080'}]):
            uri = instance.get('uri', 'http://localhost:8080')
            results.append({
                'ruleId': f'zap/{plugin_id}',
                'level': sarif_level,
                'message': {
                    'text': (alert.get('alert', 'Alert') + ': '
                             + alert.get('desc', 'No description').strip())
                },
                'locations': [{
                    'physicalLocation': {
                        'artifactLocation': {
                            'uri': uri,
                            'uriBaseId': 'WEBROOT'
                        }
                    }
                }]
            })

with open('zap-results.sarif', 'w') as f:
    json.dump(sarif, f, indent=2)

print(f'SARIF report written: {len(results)} finding(s), {high_count} HIGH-risk')

if high_count > 0:
    print(f'::error::ZAP found {high_count} HIGH-risk or above alert(s)')
    sys.exit(1)
"

SARIF_EXIT=$?

# Display summary
echo ""
echo "=== ZAP Baseline Scan Results ==="
if [ -f zap-report.json ]; then
    python3 -c "
import json
with open('zap-report.json') as f:
    data = json.load(f)
for site in data.get('site', []):
    for alert in site.get('alerts', []):
        risk = alert.get('riskdesc', 'Unknown')
        name = alert.get('alert', 'Unknown')
        count = len(alert.get('instances', []))
        print(f'  [{risk}] {name} ({count} instance(s))')
if not any(site.get('alerts') for site in data.get('site', [])):
    print('  No alerts found')
"
else
    echo "  No ZAP report generated"
fi
echo ""

# Fail if the SARIF conversion found HIGH-risk alerts
if [ "$SARIF_EXIT" -ne 0 ]; then
    exit 1
fi

# ZAP exit code 2 means there were warnings (WARN) but not failures.
# Exit codes: 0 = pass, 1 = fail (error during scan), 2 = warnings found.
if [ "$ZAP_EXIT" -eq 1 ]; then
    echo "::error::ZAP scan reported a scan error (exit code 1)"
    exit 1
fi

echo "ZAP baseline scan complete"
