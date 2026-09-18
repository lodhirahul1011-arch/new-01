# iOS Xcode Build Guide

Use the full project root, not only `src`, when moving this app to a Mac:

```sh
cd Final_code
```

Xcode creates an iOS `.ipa` file. `.ipk` is not an iOS package format, so treat `.ipk` as a typo unless you are targeting another platform.

## Requirements

- macOS with the latest stable Xcode and Xcode Command Line Tools selected.
- Node 22.11.0 or newer, matching `package.json`.
- Ruby/Bundler and CocoaPods. This repo includes a `Gemfile` and `.ruby-version`.
- Apple Developer account for physical-device signing, push notifications, and IPA export.
- Firebase iOS config at `ios/dwar/GoogleService-Info.plist` with bundle id `com.dvaari.dvari`.

## First Setup On Mac

```sh
cd Final_code
npm ci
bundle install
cd ios
bundle exec pod install
cd ..
```

Or use the helper:

```sh
npm run ios:pods
```

After Pods are installed, always open:

```sh
open ios/dwar.xcworkspace
```

Do not open `ios/dwar.xcodeproj` for normal React Native work because CocoaPods dependencies are linked through the workspace.

## Run From Xcode

1. Open `ios/dwar.xcworkspace`.
2. Select scheme `dwar`.
3. Select a simulator or connected iPhone.
4. In the `dwar` target, open `Signing & Capabilities`.
5. Set your Apple Team.
6. Keep bundle identifier as `com.dvaari.dvari`, unless you also update Firebase, backend push-token setup, and Apple identifiers.
7. Confirm Push Notifications and Background Modes are enabled.
8. Start Metro in a separate terminal:

```sh
npm start
```

9. Press Run in Xcode.

You can also open the workspace from terminal:

```sh
npm run ios:open
```

## Build IPA From Xcode

1. In Xcode, choose a physical iOS device or `Any iOS Device`.
2. Set build configuration to Release.
3. Choose `Product > Archive`.
4. When Organizer opens, select the archive.
5. Click `Distribute App`.
6. Pick the distribution method:
   - `App Store Connect` for TestFlight/App Store upload.
   - `Release Testing` or ad hoc-style export for registered testers, depending on your Xcode version and account.
7. Let Xcode manage signing unless you have a strict manual-signing setup.
8. Export or upload. The exported file is `.ipa`.

## Build IPA From Terminal

Prepare Pods first:

```sh
npm run ios:pods
```

Archive:

```sh
npm run ios:archive
```

If Xcode needs automatic signing from the command line:

```sh
IOS_DEVELOPMENT_TEAM=YOURTEAMID IOS_ALLOW_PROVISIONING_UPDATES=1 npm run ios:archive
```

Export once from Xcode Organizer and save the generated `ExportOptions.plist` as `ios/ExportOptions.plist`, or point to it with `IOS_EXPORT_OPTIONS_PLIST`.

```sh
npm run ios:export
```

The default output folder is:

```sh
build/ios/ipa
```

## Release Checklist

- Run `npx tsc --noEmit` before archiving.
- Run `npm run ios:pods` after dependency, Podfile, React Native, or Firebase changes.
- Keep `PrivacyInfo.xcprivacy` included in the Xcode target resources.
- Use HTTPS API URLs for release builds. Avoid leaving broad `NSAllowsArbitraryLoads` enabled for App Store builds unless there is a documented exception.
- Test camera, microphone, photo picker, push notifications, and WebRTC calls on a real iPhone before uploading.
- Increment `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` before each App Store/TestFlight build.
- Keep `.xcworkspace`, `Podfile`, `Podfile.lock`, `package-lock.json`, `GoogleService-Info.plist`, and signing settings consistent across local and CI builds.
- Do not commit generated archives or `.ipa` files.
