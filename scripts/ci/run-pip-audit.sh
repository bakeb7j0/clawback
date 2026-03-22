#!/usr/bin/env bash
# Run pip-audit to check Python dependencies for known vulnerabilities.
#
# Usage: ./scripts/ci/run-pip-audit.sh

set -euo pipefail

pip install --quiet pip-audit
pip-audit -r requirements.txt --strict --desc
