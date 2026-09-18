#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "logs.info [ios] preparing JavaScript dependencies"
if [ ! -d "node_modules" ]; then
  npm ci || { echo "logs.error [ios] npm ci failed"; exit 1; }
else
  echo "logs.info [ios] node_modules exists; skipping npm ci"
fi

echo "logs.info [ios] installing Ruby gems"
bundle install || { echo "logs.error [ios] bundle install failed"; exit 1; }

echo "logs.info [ios] installing CocoaPods"
cd ios
bundle exec pod install || { echo "logs.error [ios] pod install failed"; exit 1; }

echo "logs.info [ios] Xcode workspace ready at ios/dwar.xcworkspace"
