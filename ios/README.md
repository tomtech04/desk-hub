# Desk Hub for iPhone

A private iPhone app for the hub: the one place to see what's going on with your day, PayIt and your systems, and the replacement for the Pebble app.

- **Today:** Claude's brief (or the evening recap), the weather, what needs you (alerts, urgent email, overdue tasks, suggestions), what's next on the calendar, today's tasks to tick off, the mail digest, PayIt, your systems (desk screen, Pi, PayIt checks, data feeds, the ring), and the journal.
- **To do:** every task, filtered by tag or due date, with steps, stars, and the tasks Claude suggested from email to keep or dismiss. Add tasks with a tag and due date.
- **Journal:** tap to talk and say how the day is going; it's transcribed on the phone with Parakeet and the hub sorts it into tasks, notes and reflections, the same as a note from the ring. Or type a note. Today's entries, Claude's recap, and every past day, searchable.
- **Mail:** the digest, and each unread email in one line with what to do about it. Open one for the summary, make it a task, mark it done, or read the whole thing. Nothing is sent or marked read.
- **More:** PayIt in detail (by hour, last 7 days, payment methods), the schedule, systems and alerts, the ring, the hub connection, and the full hub page.
- **The ring:** paired straight to the app. Hold the button, speak, let go: the recording comes over Bluetooth, Parakeet turns it into text on the phone, and the text goes to the hub's `/api/voice`, the same request the Pebble app's webhook made. It works with the app in the background, and if the hub can't be reached the note waits on the phone and is sent later.

Nothing is published anywhere. You build it from this repo and install it on your own phone.

<p>
<img src="../mockups/shots/iphone-today.png" width="200" alt="Today">
<img src="../mockups/shots/iphone-today-systems.png" width="200" alt="Today: PayIt, systems, journal">
<img src="../mockups/shots/iphone-tasks.png" width="200" alt="To do">
<img src="../mockups/shots/iphone-journal.png" width="200" alt="Journal">
<img src="../mockups/shots/iphone-mail.png" width="200" alt="Mail">
<img src="../mockups/shots/iphone-payit.png" width="200" alt="PayIt">
</p>

*From the simulator, running against the hub's demo data (`npm run demo`).*

## Install it

You need a Mac. Pick one of these.

**A. Xcode (works with a free Apple ID)**

1. Install Xcode from the Mac App Store, then in Terminal: `brew install xcodegen` and `brew install --cask temurin` (Java, which builds the ring part).
2. From the repo: `bash ios/setup.sh`. The first run takes a few minutes.
3. Open `ios/DeskHub.xcodeproj`. Under **Signing & Capabilities**, set **Team** to your Apple ID (add it in Xcode → Settings → Accounts if it isn't listed). If Xcode says the bundle ID is taken, run `BUNDLE_ID=com.yourname.deskhub bash ios/setup.sh` and reopen.
4. Plug in the iPhone, turn on **Developer Mode** (Settings → Privacy & Security), pick the phone at the top of Xcode and press **Run**.
5. With a free Apple ID, the first launch asks you to trust the app: Settings → General → VPN & Device Management → your Apple ID → Trust.

With a free Apple ID the app stops opening after 7 days; plug in and press Run again. With the $99/year Apple Developer Program it lasts a year, and it can be set up to arrive through TestFlight instead.

**B. No Xcode:** pushes to `main` that change `ios/` (or a manual run of the workflow) build the app on a Mac in GitHub Actions. Open the repo's **Actions** tab → **iPhone app** → the latest run → download **DeskHub-unsigned-ipa**, and install it with [Sideloadly](https://sideloadly.io) or AltStore, which sign it with your Apple ID. Same 7-day limit with a free Apple ID.

## Set it up

1. **More → Hub connection:** the hub's address (`http://deskhub.local:8080` at home, or its public address so it works from anywhere). If the hub has `HUB_PASSWORD` set, sign in there; you stay signed in for 30 days. For the ring, also add the voice token (`HUB_VOICE_TOKEN` from the Pi's `.env`); **Send a test to the hub** should put a "Ring connected" card on the hub.
2. **Parakeet** downloads by itself the first time (about 500 MB, so be on Wi-Fi). After that it runs offline on the phone's Neural Engine.
3. **More → Ring & voice notes → Pair ring**, then click the ring's button once to wake it. Tap it in the list and tap **Pair** when iOS asks. A ring already set up in the Pebble app is already paired with this iPhone, which is fine.
4. Hold the button and speak. The note shows under **Recent notes** and pops up on the hub.
5. Once notes arrive, **delete the Pebble app**. While both are installed, whichever gets to the ring first takes the recording.

## Good to know

- The first time a ring syncs with this app, recordings still on it are cleared, as the Pebble app does when pairing. Sync anything you need in the Pebble app first.
- **Firmware updates** come from Core Devices' servers through the Pebble app; this app doesn't install them. If the ring ever needs one, reinstall the Pebble app for that, then delete it again.
- iOS wakes the app when the ring has something. If you force-quit it (swipe it away), open it once to start listening again.
- **Something not working?** More → Ring & voice notes → **Ring log** has what the ring and the app did. The share button sends it anywhere.

## How it's built

- `RingKit/` is a small Kotlin library around `io.github.coredevices.haversine`, the ring's Bluetooth library from Core Devices' open-source Pebble app ([coredevices/mobileapp](https://github.com/coredevices/mobileapp)), published on Maven Central under Apache 2.0. Its Bluetooth code ships compiled, so RingKit makes the same calls the Pebble app makes (scan, transfer, decode) rather than reimplementing the protocol. It hands each finished recording to Swift as 16-bit PCM.
- `DeskHub/` is the SwiftUI app. Pairing is CoreBluetooth: writing to the ring's encrypted characteristic makes iOS show its pairing prompt, as the Pebble app does. Speech to text is NVIDIA's Parakeet TDT 0.6B v3 through [FluidAudio](https://github.com/FluidInference/FluidAudio) 0.17.4 (Core ML).
- `project.yml` describes the Xcode project (XcodeGen), so there's no `.xcodeproj` in git; `setup.sh` builds RingKit and generates it.
- `DeskHub/` talks to the same JSON API as the hub's own screens (`/api/dashboard`, `/api/todos`, `/api/journal/*`, `/api/mail/*`), with the hub's session cookie when it has a password. Notes spoken into the phone go to `/api/voice` marked as coming from the phone.
- `scripts/screenshots.sh` boots an iPhone simulator, points the app at a hub on the same Mac (`npm run demo`), and screenshots every screen.
- `.github/workflows/ios.yml` does all of that on a GitHub Mac runner: it builds the app, runs it in the simulator against the hub's demo data, and keeps the screenshots under the run's Artifacts. In a private repo those minutes count 10× against the free Actions allowance, so it only runs when `ios/` changes.
