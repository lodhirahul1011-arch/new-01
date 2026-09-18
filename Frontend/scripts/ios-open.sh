#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$ROOT_DIR/ios/dwar.xcworkspace"

if [ ! -d "$WORKSPACE" ]; then
  echo "logs.error [ios] missing $WORKSPACE; run npm run ios:pods first"
  exit 1
fi

echo "logs.info [ios] opening Xcode workspace"
open "$WORKSPACE" || { echo "logs.error [ios] failed to open Xcode workspace"; exit 1; }
