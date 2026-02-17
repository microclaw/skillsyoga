#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
"$ROOT_DIR/scripts/bump_version.sh" patch
