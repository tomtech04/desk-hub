import SwiftUI

/// Desk Hub on the Mac: the workstation in its own window, and your Claude chats in the menu bar
/// (with their alerts, and the link that lets the desk and the phone open a chat here).
///
/// At login it starts quietly, as just the menu bar item. Opening it yourself (Dock, Finder,
/// Spotlight, or Open Desk Hub in the menu) shows the window; closing the window puts it back in
/// the menu bar, so the Claude side keeps running.
@main
struct DeskHubApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store = SessionStore()

    var body: some Scene {
        Window("Desk Hub", id: HubWindow.id) {
            HubWindow()
        }
        .defaultSize(width: 1440, height: 900)
        .windowResizability(.contentMinSize)
        .windowToolbarStyle(.unifiedCompact)
        // The window only opens when asked for (see MenuBarLabel), never on its own at login.
        .defaultLaunchBehavior(.suppressed)

        MenuBarExtra {
            PanelView(store: store)
        } label: {
            MenuBarLabel(store: store)
        }
        .menuBarExtraStyle(.window)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    /// macOS marks the launch it does for a login item; that one stays in the menu bar.
    nonisolated(unsafe) static var launchedAtLogin = false

    func applicationWillFinishLaunching(_ notification: Notification) {
        let event = NSAppleEventManager.shared().currentAppleEvent
        Self.launchedAtLogin = event?.eventID == AEEventID(kAEOpenApplication)
            && event?.paramDescriptor(forKeyword: AEKeyword(keyAEPropData))?.enumCodeValue == OSType(keyAELaunchedAsLogInItem)
    }

    /// Clicking the Dock icon (or opening the app again) while it's in the menu bar brings the window back.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { MainActor.assumeIsolated { HubWindow.show() } }
        return true
    }
}

/// The icon in the menu bar. It changes with the most urgent state and shows a count.
struct MenuBarLabel: View {
    let store: SessionStore
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        let alerter = store.alerter
        let needs = store.needsInput.count + (alerter.testActive ? 1 : 0)
        let running = store.running.count
        let fresh = store.done.filter(store.isUnread).count

        HStack(spacing: 3) {
            if needs > 0 {
                // A colored badge instead of a monochrome icon, flashing until you open the panel.
                Image(nsImage: MenuBarBadge.image(count: needs, outlined: alerter.isFlashing && alerter.flashPhase))
                    .renderingMode(.original)
            } else if running > 0 {
                Image(systemName: "ellipsis.bubble.fill")
                Text("\(running)").monospacedDigit()
            } else if fresh > 0 {
                Image(systemName: "checkmark.bubble.fill")
            } else {
                Image(systemName: "bubble.left")
            }
        }
        .accessibilityLabel("Claude: \(needs) need you, \(running) running")
        // The label exists from launch on, so it's where the window gets opened from.
        .task {
            HubWindow.opener = { openWindow(id: HubWindow.id) }
            if !AppDelegate.launchedAtLogin, ProcessInfo.processInfo.environment["CLAUDE_STATUS_SNAPSHOT"] == nil {
                HubWindow.show()
            }
        }
    }
}
