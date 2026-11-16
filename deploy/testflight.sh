#!/bin/sh
# Builds the iPhone app for the App Store and uploads it to TestFlight: npm run ios:testflight
# Needs Xcode signed in to the Apple Developer account (Xcode → Settings → Accounts) and the app made in
# App Store Connect first (docs/app-store.md). Each upload gets a new build number: the date and time.
set -e
cd "$(dirname "$0")/.."
BUILD=$(date +%y%m%d%H%M)
OUT=ios/App/build/testflight
rm -rf "$OUT"
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/Sprig.xcarchive" \
  -allowProvisioningUpdates CURRENT_PROJECT_VERSION="$BUILD" archive
xcodebuild -exportArchive -archivePath "$OUT/Sprig.xcarchive" -exportPath "$OUT" \
  -exportOptionsPlist ios/ExportOptions.plist -allowProvisioningUpdates
echo "Uploaded build $BUILD. It shows in App Store Connect → TestFlight once Apple has processed it (about 15 minutes)."
