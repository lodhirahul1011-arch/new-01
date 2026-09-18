#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$ROOT_DIR/ios/dwar.xcworkspace"
SCHEME="${IOS_SCHEME:-dwar}"
CONFIGURATION="${IOS_CONFIGURATION:-Release}"
ARCHIVE_PATH="${IOS_ARCHIVE_PATH:-$ROOT_DIR/build/ios/archive/dwar.xcarchive}"
ALLOW_PROVISIONING_UPDATES="${IOS_ALLOW_PROVISIONING_UPDATES:-0}"

if [ ! -d "$WORKSPACE" ]; then
  echo "logs.error [ios] missing $WORKSPACE; run npm run ios:pods first"
  exit 1
fi

mkdir -p "$(dirname "$ARCHIVE_PATH")"

XCODEBUILD_ARGS=(
  -workspace "$WORKSPACE"
  -scheme "$SCHEME"
  -configuration "$CONFIGURATION"
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE_PATH"
)

if [ -n "${IOS_DEVELOPMENT_TEAM:-}" ]; then
  XCODEBUILD_ARGS+=(DEVELOPMENT_TEAM="$IOS_DEVELOPMENT_TEAM")
fi

if [ "$ALLOW_PROVISIONING_UPDATES" = "1" ]; then
  XCODEBUILD_ARGS+=(-allowProvisioningUpdates)
fi

echo "logs.info [ios] archiving $SCHEME $CONFIGURATION to $ARCHIVE_PATH"
xcodebuild "${XCODEBUILD_ARGS[@]}" clean archive || { echo "logs.error [ios] xcode archive failed"; exit 1; }

echo "logs.info [ios] archive created at $ARCHIVE_PATH"
