import Foundation
import UserNotifications
import WatchConnectivity
import WatchKit

/// GET /api/watch: only what the watch shows.
struct WatchData: Decodable {
    var now: Double?
    var claude: Claude?
    var payit: Pay?
    var focus: Focus?

    struct Claude: Decodable {
        var chats: [Chat]?
        var online: Bool?
        var listening: Bool?
        var syncedAt: Double?
    }

    struct Chat: Decodable, Identifiable, Equatable {
        enum Kind: Int, Comparable {
            case needs, new, running, read
            static func < (a: Kind, b: Kind) -> Bool { a.rawValue < b.rawValue }
        }
        var id: String
        var title: String
        var project: String?
        var state: String
        var detail: String?
        var preview: String?
        var since: Double
        var unread: Bool?

        var kind: Kind {
            switch state {
            case "needs": return .needs
            case "running": return .running
            default: return unread == true ? .new : .read
            }
        }
    }

    struct Pay: Decodable {
        var grossCents: Double?
        var count: Int?
        var declined: Int?
        var yesterdaySameTimeCents: Double?
        var profitCents: Double?
        var down: Int?
        var degraded: Int?
    }

    struct Focus: Decodable {
        var todayMinutes: Double?
        var todaySessions: Int?
        var focusMinutes: Int?
        var shortBreak: Int?
        var desk: Desk?
    }

    struct Desk: Decodable {
        var online: Bool?
        var timer: DeskTimer?
    }

    struct DeskTimer: Decodable {
        var phase: String?
        var running: Bool?
        var endsAt: Double?
        var remaining: Double?
        var label: String?
    }

    /// Waiting on you, then finished and not opened yet, then working.
    var live: [Chat] {
        guard claude?.online == true else { return [] }
        return (claude?.chats ?? []).filter { $0.kind != .read }.sorted { ($0.kind, -$0.since) < ($1.kind, -$1.since) }
    }
}

/// A study (focus) session or break running on the watch.
struct StudySession: Codable, Equatable {
    var isBreak: Bool
    var minutes: Int
    var startedAt: Date
    var endsAt: Date
    /// Set while paused: how much was left.
    var pausedLeft: TimeInterval?
    /// Also running on the desk screen's Focus.
    var onDesk: Bool
}

/// Talks to the hub, straight from the watch when it can (with the address and sign-in the phone
/// handed over), and through the phone when it can't.
@MainActor
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var data: WatchData?
    @Published private(set) var updatedAt: Date?
    @Published private(set) var problem: String?
    @Published private(set) var study: StudySession? = WatchStore.loadStudy()

    private var timer: Timer?
    private var seen: [String: String]?

    private var hubAddress: String? { UserDefaults.standard.string(forKey: "hub") }
    private var cookie: String? { UserDefaults.standard.string(forKey: "cookie") }

    func start() {
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
        checkStudy()
        Task { await refresh() }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func refresh() async {
        guard let (body, code) = await hub("GET", "api/watch") else {
            problem = hubAddress == nil ? "Open Desk Hub on your iPhone once, so the watch learns where your hub is." : "Can't reach your hub."
            return
        }
        guard code == 200, let next = try? JSONDecoder().decode(WatchData.self, from: body) else {
            problem = code == 401 ? "Sign in to the hub in Desk Hub on your iPhone." : "The hub answered with an error (\(code))."
            return
        }
        tapIfSomethingHappened(next)
        data = next
        updatedAt = Date()
        problem = nil
    }

    // MARK: Claude

    func openOnMac(_ chat: WatchData.Chat) async -> Bool {
        guard let (body, code) = await hub("POST", "api/claude/open", ["id": chat.id]), code == 200 else { return false }
        let delivered = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["delivered"] as? Int ?? 0
        await refresh()
        return delivered > 0
    }

    func markRead(_ chat: WatchData.Chat) async {
        _ = await hub("POST", "api/claude/read", ["ids": [chat.id]])
        await refresh()
    }

    /// A wrist tap when a chat starts waiting on you or finishes, while the app is open.
    private func tapIfSomethingHappened(_ next: WatchData) {
        let chats = next.claude?.online == true ? next.claude?.chats ?? [] : []
        let now = Dictionary(chats.map { ($0.id, "\($0.state)|\($0.since)") }, uniquingKeysWith: { a, _ in a })
        if let seen {
            if chats.contains(where: { $0.kind == .needs && seen[$0.id] != now[$0.id] }) {
                WKInterfaceDevice.current().play(.notification)
            } else if chats.contains(where: { $0.kind == .new && seen[$0.id].map { !$0.hasPrefix("done") } == true }) {
                WKInterfaceDevice.current().play(.success)
            }
        }
        seen = now
    }

    // MARK: Study timer

    func startStudy(minutes: Int, isBreak: Bool, onDesk: Bool) {
        let now = Date()
        study = StudySession(isBreak: isBreak, minutes: minutes, startedAt: now, endsAt: now.addingTimeInterval(Double(minutes) * 60), pausedLeft: nil, onDesk: onDesk && !isBreak)
        saveStudy()
        remind()
        WKInterfaceDevice.current().play(.start)
        if onDesk, !isBreak { Task { _ = await hub("POST", "api/desk/focus", ["minutes": minutes, "label": "Study"]) } }
    }

    func pauseStudy() {
        guard var s = study, s.pausedLeft == nil else { return }
        s.pausedLeft = max(0, s.endsAt.timeIntervalSinceNow)
        study = s
        saveStudy()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["study"])
        if s.onDesk { Task { _ = await hub("POST", "api/desk/timer", ["action": "pause"]) } }
    }

    func resumeStudy() {
        guard var s = study, let left = s.pausedLeft else { return }
        s.endsAt = Date().addingTimeInterval(left)
        s.pausedLeft = nil
        study = s
        saveStudy()
        remind()
        if s.onDesk { Task { _ = await hub("POST", "api/desk/timer", ["action": "resume"]) } }
    }

    /// Ends the session early (or it ran out): focus time goes into the hub's focus log.
    func endStudy() {
        guard let s = study else { return }
        let elapsed = (s.pausedLeft.map { Double(s.minutes) * 60 - $0 } ?? Date().timeIntervalSince(s.startedAt))
        let minutes = min(s.minutes, Int((elapsed / 60).rounded()))
        study = nil
        saveStudy()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["study"])
        Task {
            if !s.isBreak, minutes >= 1 { _ = await hub("POST", "api/focus", ["minutes": minutes, "label": "Study", "where": "watch"]) }
            if s.onDesk { _ = await hub("POST", "api/desk/timer", ["action": "end"]) }
            await refresh()
        }
    }

    /// Called every second while the timer is on screen, and when the app comes back.
    func checkStudy() {
        guard let s = study, s.pausedLeft == nil, s.endsAt <= Date() else { return }
        WKInterfaceDevice.current().play(.success)
        endStudy()
    }

    func pauseDesk(_ action: String) async {
        _ = await hub("POST", "api/desk/timer", ["action": action])
        await refresh()
    }

    /// The wrist tap when time's up, even if the app isn't open by then.
    private func remind() {
        guard let s = study else { return }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["study"])
        Task {
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
            let content = UNMutableNotificationContent()
            content.title = s.isBreak ? "Break's over" : "Study session done"
            content.body = s.isBreak ? "Back to it when you're ready." : "\(s.minutes) minutes. Nice work."
            content.sound = .default
            let wait = max(1, s.endsAt.timeIntervalSinceNow)
            try? await center.add(UNNotificationRequest(identifier: "study", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)))
        }
    }

    private static func loadStudy() -> StudySession? {
        UserDefaults.standard.data(forKey: "study").flatMap { try? JSONDecoder().decode(StudySession.self, from: $0) }
    }

    private func saveStudy() {
        UserDefaults.standard.set(study.flatMap { try? JSONEncoder().encode($0) }, forKey: "study")
    }

    // MARK: Talking to the hub

    /// Straight to the hub when it answers; otherwise through the phone, which is signed in.
    private func hub(_ method: String, _ path: String, _ body: [String: Any]? = nil) async -> (Data, Int)? {
        let json = body.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        if let direct = await direct(method, path, json), direct.1 != 401 { return direct }
        return await viaPhone(method, path, json)
    }

    private func direct(_ method: String, _ path: String, _ body: Data?) async -> (Data, Int)? {
        guard var text = hubAddress, !text.isEmpty else { return nil }
        if !text.contains("://") { text = "http://" + text }
        guard let base = URL(string: text), let url = URL(string: path, relativeTo: base.appendingPathComponent("/")) else { return nil }
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.httpMethod = method
        if let cookie, !cookie.isEmpty { request.setValue("hub_session=\(cookie)", forHTTPHeaderField: "Cookie") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        guard let (data, response) = try? await URLSession.shared.data(for: request) else { return nil }
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    private func viaPhone(_ method: String, _ path: String, _ body: Data?) async -> (Data, Int)? {
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else { return nil }
        var message: [String: Any] = ["method": method, "path": path]
        if let body { message["body"] = body }
        return await withCheckedContinuation { done in
            session.sendMessage(message, replyHandler: { reply in
                let code = reply["status"] as? Int ?? 0
                done.resume(returning: code == 0 ? nil : (reply["data"] as? Data ?? Data(), code))
            }, errorHandler: { _ in done.resume(returning: nil) })
        }
    }

    // MARK: WCSession

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        Task { @MainActor in self.save(context) }
    }

    /// The phone hands over the hub's address and sign-in whenever they change.
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        Task { @MainActor in
            self.save(context)
            await self.refresh()
        }
    }

    private func save(_ context: [String: Any]) {
        if let hub = context["hub"] as? String, !hub.isEmpty { UserDefaults.standard.set(hub, forKey: "hub") }
        if let cookie = context["cookie"] as? String { UserDefaults.standard.set(cookie, forKey: "cookie") }
    }
}
