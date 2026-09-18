#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_PATH="${IOS_ARCHIVE_PATH:-$ROOT_DIR/build/ios/archive/dwar.xcarchive}"
EXPORT_PATH="${IOS_EXPORT_PATH:-$ROOT_DIR/build/ios/ipa}"
EXPORT_OPTIONS_PLIST="${IOS_EXPORT_OPTIONS_PLIST:-$ROOT_DIR/ios/ExportOptions.plist}"
ALLOW_PROVISIONING_UPDATES="${IOS_ALLOW_PROVISIONING_UPDATES:-0}"

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "logs.error [ios] missing archive at $ARCHIVE_PATH; run npm run ios:archive first"
  exit 1
fi

if [ ! -f "$EXPORT_OPTIONS_PLIST" ]; then
  echo "logs.error [ios] missing export options plist at $EXPORT_OPTIONS_PLIST"
  echo "logs.error [ios] export once from Xcode Organizer and save ExportOptions.plist, or set IOS_EXPORT_OPTIONS_PLIST"
  exit 1
fi

mkdir -p "$EXPORT_PATH"

XCODEBUILD_ARGS=(
  -exportArchive
  -archivePath "$ARCHIVE_PATH"
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST"
  -exportPath "$EXPORT_PATH"
)

if [ "$ALLOW_PROVISIONING_UPDATES" = "1" ]; then
  XCODEBUILD_ARGS+=(-allowProvisioningUpdates)
fi

echo "logs.info [ios] exporting IPA to $EXPORT_PATH"
xcodebuild "${XCODEBUILD_ARGS[@]}" || { echo "logs.error [ios] IPA export failed"; exit 1; }

echo "logs.info [ios] IPA export completed"
