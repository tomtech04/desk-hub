import Foundation
import WatchConnectivity

/// The phone's side of the Apple Watch app. It hands the watch the hub's address and the sign-in
/// cookie, so the watch can ask the hub itself, and it fetches for the watch when the watch can't
/// reach the hub on its own (away from home Wi-Fi, say). iOS wakes the app for that.
@MainActor
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()

    weak var hub: HubStore?
    private var sent: [String: String] = [:]
    private var pending: [String: String]?

    /// The only hub calls the watch can ask the phone to make for it.
    private static let allowed: Set<String> = ["api/watch", "api/claude/open", "api/claude/read", "api/focus", "api/desk/focus", "api/desk/timer"]

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func share(address: String, cookie: String?) {
        let context = ["hub": address, "cookie": cookie ?? ""]
        guard context != sent else { return }
        pending = context
        send()
    }

    private func send() {
        let session = WCSession.default
        guard let context = pending, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        do {
            try session.updateApplicationContext(context)
            sent = context
            pending = nil
        } catch {}
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.send() }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        // The watch app was just installed: give it the hub straight away.
        Task { @MainActor in
            if self.pending == nil, !self.sent.isEmpty { self.pending = self.sent; self.sent = [:] }
            self.send()
        }
    }

    /// The watch asks the phone to call the hub for it: ["method", "path", "body" (JSON Data)].
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        let method = message["method"] as? String ?? "GET"
        let path = message["path"] as? String ?? ""
        let body = message["body"] as? Data
        Task { @MainActor in
            guard Self.allowed.contains(path), let hub = self.hub,
                  let (data, code) = await hub.relay(method, path, body: body) else {
                replyHandler(["status": 0])
                return
            }
            replyHandler(["status": code, "data": data])
        }
    }
}
