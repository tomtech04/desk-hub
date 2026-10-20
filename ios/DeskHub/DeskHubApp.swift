import SwiftUI
import UserNotifications

@main
struct DeskHubApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appDelegate.settings)
                .environmentObject(appDelegate.hub)
                .environmentObject(appDelegate.nav)
                .environmentObject(appDelegate.ring)
                .environmentObject(appDelegate.buttons)
                .environmentObject(appDelegate.outbox)
                .environmentObject(appDelegate.log)
                .environmentObject(appDelegate.transcriber)
                .environmentObject(appDelegate.health)
                .preferredColorScheme(.dark)
                .onOpenURL { appDelegate.nav.open($0) }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                appDelegate.hub.startRefreshing()
                appDelegate.outbox.process()
                Task { await appDelegate.health.refresh() }
                appDelegate.health.ensureReminder()
            case .background:
                appDelegate.hub.stopRefreshing()
            default:
                break
            }
        }
    }
}

/// Owns everything that has to run without the UI: iOS relaunches the app in the background
/// when the ring has a recording or the watch syncs new heart data, and that has to be picked up
/// before any view exists.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let log = RingLog()
    let nav = AppNav()
    lazy var settings = HubSettings()
    lazy var hub = HubStore(settings: settings)
    lazy var transcriber = Transcriber(log: log)
    lazy var outbox = VoiceOutbox(settings: settings, transcriber: transcriber, log: log)
    lazy var buttons = RingButtons(log: log)
    lazy var ring = RingController(outbox: outbox, log: log, buttons: buttons)
    lazy var health = HealthMonitor(hub: hub, log: log)

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        if launchOptions?[.bluetoothCentrals] != nil { log.add("Woken in the background by the ring") }
        // Bluetooth starts only once a ring is paired, so there's no Bluetooth prompt before then.
        if ring.pairedId != nil, !RingController.demo {
            ring.start()
            transcriber.prepareInBackground()
        }
        outbox.process()
        UNUserNotificationCenter.current().delegate = self
        health.start()
        styleBars()
        return true
    }

    /// Tapping the evening reminder or a "how are you doing?" nudge opens the check-in.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let id = response.notification.request.identifier
        guard id == "checkin" || id.hasPrefix("nudge-") else { return }
        await MainActor.run { nav.checkIn() }
    }

    /// Shows them while the app is open too.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    /// The graphite tab bar. Navigation bars are left to the system, which draws them clear over
    /// the page and blurs them as content scrolls beneath.
    private func styleBars() {
        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor(Color(hex: 0x0F1115))
        tab.shadowColor = UIColor(Color(hex: 0x1F232A))
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
    }
}

/// Which tab is showing, and requests that cross tabs ("record a note" from Today).
@MainActor
final class AppNav: ObservableObject {
    enum Tab: String {
        case today, tasks, journal, mail, more
    }

    // `-startTab mail` etc. on launch (used by the simulator screenshots).
    @Published var tab = Tab(rawValue: UserDefaults.standard.string(forKey: "startTab") ?? "") ?? .today
    /// A page of the More tab to open, e.g. from the widget ("payit").
    @Published var morePage: String?
    @Published var wantsRecording = false
    @Published var wantsNote = false
    // `-openCheckin YES` on launch opens the check-in (the simulator screenshots).
    @Published var wantsCheckIn = UserDefaults.standard.bool(forKey: "openCheckin")

    func record() {
        wantsRecording = true
        tab = .journal
    }

    func write() {
        wantsNote = true
        tab = .journal
    }

    func checkIn() {
        wantsCheckIn = true
    }

    /// `deskhub://payit` from the widget.
    func open(_ url: URL) {
        guard url.scheme == "deskhub" else { return }
        switch url.host {
        case "payit":
            morePage = "payit"
            tab = .more
        case "checkin":
            checkIn()
        default:
            break
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var nav: AppNav

    var body: some View {
        TabView(selection: $nav.tab) {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.max") }
                .tag(AppNav.Tab.today)
            TasksView()
                .tabItem { Label("To do", systemImage: "checklist") }
                .tag(AppNav.Tab.tasks)
            JournalView()
                .tabItem { Label("Journal", systemImage: "mic") }
                .tag(AppNav.Tab.journal)
            MailView()
                .tabItem { Label("Mail", systemImage: "envelope") }
                .tag(AppNav.Tab.mail)
            MoreView()
                .tabItem { Label("More", systemImage: "square.grid.2x2") }
                .tag(AppNav.Tab.more)
        }
        .tint(G.text)
        .sheet(isPresented: $nav.wantsCheckIn) { CheckInSheet() }
    }
}
