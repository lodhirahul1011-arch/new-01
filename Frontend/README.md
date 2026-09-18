new way to debug

demon target 
step:1
 adb -s RZCY70KVY5M reverse tcp:8081 tcp:8081
 adb -s RZCY70KVY5M reverse tcp:8081 tcp:8081
 adb -s 1d0b961c reverse tcp:8081 tcp:8081
 
adb -s HNQ02JDR reverse tcp:8081 tcp:8081

 npx react-native start --port=8081

step:2
   
./gradlew assembleDebug   
cd android 
./gradlew assembleRelease  

step:3 
adb -s RZCY70KVY5M install -r app/build/outputs/apk/debug/app-debug.apk
adb -s RZCY70KVY5M install -r app/build/outputs/apk/release/app-release.apk
adb -s HNQ02JDR install -r app/build/outputs/apk/releapse/app-release.apk
adb -s HNQ02JDR install -r app/build/outputs/apk/debug/app-debug.apk
adb -s 1d0b961c install -r app/build/outputs/apk/debug/app-debug.apk


tab 
adb -s 52004a9afea764cf install -r app/build/outputs/apk/debug/app-debug.apk


adb -s RZCY70KVY5M shell input keyevent 82
adb -s HNQ02JDR shell input keyevent 82
adb -s 1d0b961c shell input keyevent 82
step:4
  
 adb -s RZCY70KVY5M reverse tcp:8082 tcp:8082
 adb -s RZCY70KVY5M reverse tcp:8082 tcp:8082



npx react-native start --port=8082







## Codemagic iOS build

For local Xcode setup and `.ipa` build steps, see `IOS_XCODE_BUILD.md`.

This repo has `codemagic.yaml` with two iOS workflows:

- `ios-debug-unsigned`: checks that the React Native iOS project compiles without Apple signing.
- `ios-release-signed`: creates a signed `.ipa` for bundle id `com.dvaari.dvari`.

Before running `ios-release-signed`, configure these in Codemagic:

1. Add an App Store Connect API key in Team settings > Developer Portal. Name it `dwaari-app-store-connect`, or update the same value in `codemagic.yaml`.
2. Add or fetch an Apple Distribution certificate.
3. Add or fetch an App Store provisioning profile for `com.dvaari.dvari`.
4. Make sure the Apple Developer app identifier has Push Notifications enabled because `ios/dwar/dwar.entitlements` uses `aps-environment`.
5. If Firebase push is needed on iOS, add `GoogleService-Info.plist` to `ios/dwar/` and include it in the Xcode target before release.

Run `ios-debug-unsigned` first. After it passes, run `ios-release-signed`; the IPA will be available in Codemagic artifacts under `build/ios/ipa/*.ipa`.

D:\nest\Final_code\android\app\build\outputs\bundle\release\app-release.aab
Command to generate it:
cd D:\nest\Final_code\android
cd android 
.\gradlew app:bundleRelease

## Android Delivery Notification Access

The Android app can detect delivery-related SMS notifications through
`NotificationListenerService`. It does not request `READ_SMS`, `RECEIVE_SMS`, or
Accessibility access. Only notifications from allowlisted SMS apps are processed.

Notification title/body text is parsed on-device and is not permanently stored by
the app or backend. The backend receives only structured delivery fields,
including merchant/courier name, order or tracking id, delivery date/time,
status, matched keywords, source package, and a hashed notification id for
deduplication. Local reminders are scheduled only after date and time are known;
uncertain deliveries require user confirmation first.

Notification capture is not guaranteed when Android notification access is
disabled, notification previews are hidden, grouped notifications do not expose
content, or the SMS app suppresses notification text.


Pass:
MyStrongPassword123


nerating 2,048 bit RSA key pair and self-signed certificate (SHA256withRSA) with a validity of 10,000 days
        for: CN=Amit Jain, OU=Development, O=GrahNetra Technologies Pvt. Ltd., L=Gurugram, ST=Haryana, C=IN
[Storing dwaari-release-key.keystore]

Ujjwal@UJJWAL1808 MINGW6
