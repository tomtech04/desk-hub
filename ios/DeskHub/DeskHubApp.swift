import SwiftUI

@main
struct DeskHubApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appDelegate.settings)
                .environmentObject(appDelegate.ring)
                .environmentObject(appDelegate.outbox)
                .environmentObject(appDelegate.log)
                .environmentObject(appDelegate.transcriber)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { appDelegate.outbox.process() }
        }
    }
}

/// Owns everything that has to run without the UI: iOS relaunches the app in the background
/// when the ring has a recording, and that has to be picked up before any view exists.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    let log = RingLog()
    lazy var settings = HubSettings()
    lazy var transcriber = Transcriber(log: log)
    lazy var outbox = VoiceOutbox(settings: settings, transcriber: transcriber, log: log)
    lazy var ring = RingController(outbox: outbox, log: log)

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        if launchOptions?[.bluetoothCentrals] != nil { log.add("Woken in the background by the ring") }
        ring.start()
        outbox.process()
        if ring.pairedId != nil { transcriber.prepareInBackground() }
        return true
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            HubView()
                .tabItem { Label("Hub", systemImage: "square.grid.2x2") }
            RingView()
                .tabItem { Label("Ring", systemImage: "circle.circle") }
        }
        .tint(Color(red: 0.55, green: 0.71, blue: 1.0))
    }
}

extension Color {
    /// The hub's Graphite background, so the app and the page behind it read as one surface.
    static let graphite = Color(red: 12 / 255, green: 14 / 255, blue: 18 / 255)
}
