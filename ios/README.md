# Desk Hub for iPhone

A private iPhone app for the hub, and the replacement for the Pebble app.

- **Hub tab:** the hub's phone layout, signed in for good.
- **Ring tab:** talks to the Index 01 directly. Hold the button, speak, let go: the recording comes to the phone over Bluetooth, Parakeet turns it into text on the phone, and the text goes to the hub's `/api/voice`, the same request the Pebble app's webhook made. It works with the app in the background, and if the hub can't be reached the note waits on the phone and is sent later.

Nothing is published anywhere. You build it from this repo and install it on your own phone.

## Install it

You need a Mac. Pick one of these.

**A. Xcode (works with a free Apple ID)**

1. Install Xcode from the Mac App Store, then in Terminal: `brew install xcodegen` and `brew install --cask temurin` (Java, which builds the ring part).
2. From the repo: `bash ios/setup.sh`. The first run takes a few minutes.
3. Open `ios/DeskHub.xcodeproj`. Under **Signing & Capabilities**, set **Team** to your Apple ID (add it in Xcode → Settings → Accounts if it isn't listed). If Xcode says the bundle ID is taken, run `BUNDLE_ID=com.yourname.deskhub bash ios/setup.sh` and reopen.
4. Plug in the iPhone, turn on **Developer Mode** (Settings → Privacy & Security), pick the phone at the top of Xcode and press **Run**.
5. With a free Apple ID, the first launch asks you to trust the app: Settings → General → VPN & Device Management → your Apple ID → Trust.

With a free Apple ID the app stops opening after 7 days; plug in and press Run again. With the $99/year Apple Developer Program it lasts a year, and it can be set up to arrive through TestFlight instead.

**B. No Xcode:** every push that changes `ios/` builds the app on a Mac in GitHub Actions. Open the repo's **Actions** tab → **iPhone app** → the latest run → download **DeskHub-unsigned-ipa**, and install it with [Sideloadly](https://sideloadly.io) or AltStore, which sign it with your Apple ID. Same 7-day limit with a free Apple ID.

## Set it up

1. **Ring tab → Hub:** the hub's address (`http://deskhub.local:8080` at home, or its public address so notes arrive from anywhere) and the voice token (`HUB_VOICE_TOKEN` from the Pi's `.env`). **Send a test to the hub** should put a "Ring connected" card on the hub.
2. **Parakeet** downloads by itself the first time (about 500 MB, so be on Wi-Fi). After that it runs offline on the phone's Neural Engine.
3. **Pair ring**, then click the ring's button once to wake it. Tap it in the list and tap **Pair** when iOS asks. A ring already set up in the Pebble app is already paired with this iPhone, which is fine.
4. Hold the button and speak. The note shows under **Recent notes** and pops up on the hub.
5. Once notes arrive, **delete the Pebble app**. While both are installed, whichever gets to the ring first takes the recording.

## Good to know

- The first time a ring syncs with this app, recordings still on it are cleared, as the Pebble app does when pairing. Sync anything you need in the Pebble app first.
- **Firmware updates** come from Core Devices' servers through the Pebble app; this app doesn't install them. If the ring ever needs one, reinstall the Pebble app for that, then delete it again.
- iOS wakes the app when the ring has something. If you force-quit it (swipe it away), open it once to start listening again.
- **Something not working?** Ring tab → **Ring log** has what the ring and the app did. The share button sends it anywhere.

## How it's built

- `RingKit/` is a small Kotlin library around `io.github.coredevices.haversine`, the ring's Bluetooth library from Core Devices' open-source Pebble app ([coredevices/mobileapp](https://github.com/coredevices/mobileapp)), published on Maven Central under Apache 2.0. Its Bluetooth code ships compiled, so RingKit makes the same calls the Pebble app makes (scan, transfer, decode) rather than reimplementing the protocol. It hands each finished recording to Swift as 16-bit PCM.
- `DeskHub/` is the SwiftUI app. Pairing is CoreBluetooth: writing to the ring's encrypted characteristic makes iOS show its pairing prompt, as the Pebble app does. Speech to text is NVIDIA's Parakeet TDT 0.6B v3 through [FluidAudio](https://github.com/FluidInference/FluidAudio) 0.17.4 (Core ML).
- `project.yml` describes the Xcode project (XcodeGen), so there's no `.xcodeproj` in git; `setup.sh` builds RingKit and generates it.
- `.github/workflows/ios.yml` runs the same build on a GitHub Mac runner. In a private repo those minutes count 10× against the free Actions allowance, so it only runs when `ios/` changes.
