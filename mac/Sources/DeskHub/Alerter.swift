import AppKit
import UserNotifications

/// Turns state changes into alerts: the on-screen pop-up, a notification, a sound,
/// a flashing menu bar badge, and reminders while a chat keeps waiting on you.
@MainActor
@Observable
final class Alerter {
    // MARK: Settings

    var showToast = Prefs.bool("alert.toast") { didSet { Prefs.set(showToast, "alert.toast") } }
    var notify = Prefs.bool("alert.notify") {
        didSet {
            Prefs.set(notify, "alert.notify")
            if notify { requestNotificationPermission() }
        }
    }
    var playSound = Prefs.bool("alert.sound") { didSet { Prefs.set(playSound, "alert.sound") } }
    var flashIcon = Prefs.bool("alert.flash") {
        didSet {
            Prefs.set(flashIcon, "alert.flash")
            updateTimers()
        }
    }
    var alertOnDone = Prefs.bool("alert.done") { didSet { Prefs.set(alertOnDone, "alert.done") } }
    /// Minutes between reminders while a chat still needs you. 0 turns reminders off.
    var reminderMinutes = UserDefaults.standard.object(forKey: "alert.reminder") as? Int ?? 5 {
        didSet { UserDefaults.standard.set(reminderMinutes, forKey: "alert.reminder") }
    }

    // MARK: State

    /// Chats waiting on you that you haven't looked at yet. The menu bar badge flashes for these.
    private(set) var unacknowledged: Set<String> = []
    private(set) var flashPhase = false
    private(set) var testActive = false
    private(set) var notificationsDenied = false

    var isFlashing: Bool { flashIcon && (!unacknowledged.isEmpty || testActive) }

    let toasts = ToastCenter()
    @ObservationIgnored var onOpen: (String) -> Void = { _ in }
    /// Silences sounds and notifications without changing the saved settings (used by the debug self-check).
    @ObservationIgnored var muted = ProcessInfo.processInfo.environment["CLAUDE_STATUS_SNAPSHOT"] != nil

    @ObservationIgnored private var current: [Chat] = []
    @ObservationIgnored private var lastAlerted: [String: Date] = [:]
    @ObservationIgnored private var postedNeeds: Set<String> = []
    @ObservationIgnored private var flashTimer: Timer?
    @ObservationIgnored private var reminderTimer: Timer?
    @ObservationIgnored private let notificationDelegate = NotificationDelegate()
    /// UNUserNotificationCenter only works inside an app bundle.
    @ObservationIgnored private let canNotify = Bundle.main.bundleIdentifier != nil

    init() {
        toasts.onOpen = { [weak self] toast in
            guard let self, let chatId = toast.chatId else { return }
            self.unacknowledged.remove(chatId)
            self.updateTimers()
            self.onOpen(chatId)
        }
        toasts.onDismiss = { [weak self] toast in
            guard let self, let chatId = toast.chatId else { return }
            self.unacknowledged.remove(chatId)
            self.updateTimers()
        }
        if canNotify {
            notificationDelegate.onOpen = { [weak self] chatId in self?.onOpen(chatId) }
            UNUserNotificationCenter.current().delegate = notificationDelegate
            if notify { requestNotificationPermission() }
        }
    }

    // MARK: State changes

    /// Called with the previous and new chat lists. `previous` is nil on the first load,
    /// so chats already waiting on you when the app starts still get an alert.
    func process(previous: [Chat]?, current chats: [Chat]) {
        let before = Dictionary((previous ?? []).map { ($0.id, $0.state) }, uniquingKeysWith: { a, _ in a })
        current = chats

        for chat in chats {
            let old = before[chat.id]
            switch chat.state {
            case .needsInput(let reason):
                if case .needsInput(let oldReason) = old {
                    // Still waiting, maybe on something new: refresh the pop-up quietly.
                    if oldReason != reason, toasts.contains("needs-\(chat.id)") {
                        toasts.show(.needs(chat, reason: reason))
                    }
                } else {
                    alertNeedsYou(chat, reason: reason)
                }
            case .done:
                if old == .running || old.isNeedsInput { alertDone(chat) }
            case .running:
                break
            }
        }

        // Clear alerts for chats that moved on.
        let needing = Set(chats.filter(\.state.isNeedsInput).map(\.id))
        let finished = Set(chats.filter { $0.state == .done }.map(\.id))
        unacknowledged.formIntersection(needing)
        toasts.removeAll { toast in
            guard let chatId = toast.chatId else { return false }
            return toast.kind == .needs ? !needing.contains(chatId) : !finished.contains(chatId)
        }
        let stale = postedNeeds.subtracting(needing)
        if !stale.isEmpty, canNotify {
            UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: stale.map { "needs-\($0)" })
        }
        postedNeeds.subtract(stale)
        updateTimers()
    }

    /// You opened the panel, so you've seen what's waiting. Stops the flashing until the next alert.
    func acknowledge() {
        unacknowledged.removeAll()
        updateTimers()
    }

    private func alertNeedsYou(_ chat: Chat, reason: String) {
        let key = "needs-\(chat.id)"
        // A chat can flicker in and out of "needs you" when tools run in parallel; don't ring twice.
        let recentlyAlerted = lastAlerted[key].map { Date.now.timeIntervalSince($0) < 20 } ?? false
        lastAlerted[key] = .now
        unacknowledged.insert(chat.id)
        if showToast { toasts.show(.needs(chat, reason: reason)) }
        guard !recentlyAlerted else { return }
        if playSound, !muted { Sound.needsYou.play() }
        if notify {
            post(id: key, title: "\(chat.title) needs you", body: [reason, chat.project].joined(separator: " · "), chatId: chat.id)
            postedNeeds.insert(chat.id)
        }
    }

    private func alertDone(_ chat: Chat) {
        guard alertOnDone else { return }
        let key = "done-\(chat.id)"
        if let last = lastAlerted[key], Date.now.timeIntervalSince(last) < 20 { return }
        lastAlerted[key] = .now
        if showToast { toasts.show(.done(chat), for: 8) }
        if playSound, !muted { Sound.done.play() }
        if notify { post(id: key, title: "\(chat.title) is done", body: chat.preview ?? "Finished in \(chat.project)", chatId: chat.id) }
    }

    private func remind() {
        guard reminderMinutes > 0 else { return }
        let interval = TimeInterval(reminderMinutes * 60)
        for chat in current {
            guard case .needsInput(let reason) = chat.state,
                  let last = lastAlerted["needs-\(chat.id)"],
                  Date.now.timeIntervalSince(last) >= interval
            else { continue }
            alertNeedsYou(chat, reason: reason)
        }
    }

    func sendTest() {
        testActive = true
        if showToast {
            toasts.show(Toast(id: "test", chatId: nil, kind: .needs, title: "Test chat needs you",
                              detail: "This is what an alert looks like"), for: 10)
        }
        if playSound, !muted { Sound.needsYou.play() }
        if notify { post(id: "test", title: "Test chat needs you", body: "This is what an alert looks like", chatId: nil) }
        updateTimers()
        Task {
            try? await Task.sleep(for: .seconds(10))
            testActive = false
            updateTimers()
        }
    }

    private func updateTimers() {
        if isFlashing, flashTimer == nil {
            flashTimer = Timer.scheduledTimer(withTimeInterval: 0.55, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.flashPhase.toggle() }
            }
        } else if !isFlashing, let timer = flashTimer {
            timer.invalidate()
            flashTimer = nil
            flashPhase = false
        }

        let anyWaiting = current.contains(where: \.state.isNeedsInput)
        if anyWaiting, reminderTimer == nil {
            reminderTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.remind() }
            }
        } else if !anyWaiting, let timer = reminderTimer {
            timer.invalidate()
            reminderTimer = nil
        }
    }

    // MARK: Notifications

    private func requestNotificationPermission() {
        guard canNotify, !muted else { return }
        Task {
            let center = UNUserNotificationCenter.current()
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
            let status = await center.notificationSettings().authorizationStatus
            notificationsDenied = status == .denied
        }
    }

    private func post(id: String, title: String, body: String, chatId: String?) {
        guard canNotify, !muted else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.threadIdentifier = chatId ?? "test"
        content.interruptionLevel = .active
        // The app plays its own sound, so the notification stays silent.
        if let chatId { content.userInfo = ["chat": chatId] }
        // Reusing the id replaces an older banner for the same chat instead of stacking them.
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }

    func openNotificationSettings() {
        let id = Bundle.main.bundleIdentifier ?? "com.tomasnavedo.claude-status"
        if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)") {
            NSWorkspace.shared.open(url)
        }
    }
}

/// Opens the chat when you click a notification.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    @MainActor var onOpen: (String) -> Void = { _ in }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let chatId = response.notification.request.content.userInfo["chat"] as? String else { return }
        await MainActor.run { onOpen(chatId) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }
}

enum Sound {
    case needsYou, done

    @MainActor func play() {
        // Copies so back-to-back alerts each play instead of cutting each other off.
        let name = self == .needsYou ? "Glass" : "Pop"
        (NSSound(named: name)?.copy() as? NSSound)?.play()
    }
}

/// Alert settings default to on.
enum Prefs {
    static func bool(_ key: String) -> Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }

    static func set(_ value: Bool, _ key: String) {
        UserDefaults.standard.set(value, forKey: key)
    }
}

extension ChatState {
    var isNeedsInput: Bool {
        if case .needsInput = self { true } else { false }
    }
}

extension Optional where Wrapped == ChatState {
    var isNeedsInput: Bool { self?.isNeedsInput ?? false }
}
