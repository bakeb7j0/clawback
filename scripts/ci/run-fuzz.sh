#!/usr/bin/env bash
# Run Hypothesis fuzz tests for API endpoints.
# Used by the DAST CI workflow (.github/workflows/dast.yml).
set -euo pipefail

pip install -r requirements-dev.txt --quiet

echo "--- Running Hypothesis fuzz tests ---"
python3 -m pytest tests/fuzz/ -v --tb=short
echo "--- Fuzz tests complete ---"
