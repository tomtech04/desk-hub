import AppKit

/// Keeps Desk Hub in step with your chats. Sends the chat list on every change and once a minute
/// (so the hub knows the Mac is still there), and listens for what you tap on the desk: open a
/// chat here, or mark chats read. Uses the hub address and token the Mac's mail sync already saved
/// in ~/.deskhub/mail-sync.json; without that file it does nothing.
@MainActor
@Observable
final class HubSync {
    enum Command {
        case open(String)
        case read([String])
        case readAll
    }

    var enabled = Prefs.bool("hub.enabled") {
        didSet {
            Prefs.set(enabled, "hub.enabled")
            // Turning it off clears the desk instead of leaving the last list up.
            send(force: true, items: enabled ? latest : [])
            if enabled { listen() } else { listener?.cancel() }
        }
    }
    private(set) var isConfigured = false
    /// Why the last send failed, or nil when it went through.
    private(set) var problem: String?

    @ObservationIgnored var onCommand: (Command) -> Void = { _ in }

    @ObservationIgnored private var config: Config?
    @ObservationIgnored private var latest: [Item] = []
    @ObservationIgnored private var lastBody: Data?
    @ObservationIgnored private var pending: Task<Void, Never>?
    @ObservationIgnored private var heartbeat: Timer?
    @ObservationIgnored private var listener: Task<Void, Never>?
    @ObservationIgnored private var lastError: String?

    static let configFile = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".deskhub/mail-sync.json")

    private struct Config: Decodable {
        let hub: String
        let token: String
    }

    private struct Item: Encodable {
        let id, title, project, state, detail, preview: String
        let since: Double
        let unread: Bool
    }

    private struct Message: Decodable {
        let type: String
        let id: String?
        let ids: [String]?
    }

    init() {
        // The debug self-check runs a scratch copy; it stays off the desk.
        guard ProcessInfo.processInfo.environment["CLAUDE_STATUS_SNAPSHOT"] == nil else { return }
        loadConfig()
        heartbeat = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.enabled else { return }
                self.loadConfig()
                self.send(force: true, items: self.latest)
            }
        }
        if enabled { listen() }
    }

    func update(_ chats: [Chat], unread: Set<String>) {
        latest = chats.map { Self.item($0, unread: unread.contains($0.id)) }
        guard enabled, heartbeat != nil else { return }
        // Tools can flip a chat's state a few times a second; send once things settle.
        pending?.cancel()
        pending = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled, let self else { return }
            self.send(force: false, items: self.latest)
        }
    }

    private func loadConfig() {
        let data = try? Data(contentsOf: Self.configFile)
        config = data.flatMap { try? JSONDecoder().decode(Config.self, from: $0) }
        isConfigured = config != nil
    }

    private func send(force: Bool, items: [Item]) {
        guard let config, let base = URL(string: config.hub) else { return }
        guard let body = try? JSONEncoder().encode(["chats": items]) else { return }
        if !force, body == lastBody { return }
        lastBody = body

        var request = URLRequest(url: base.appendingPathComponent("api/claude/push"), timeoutInterval: 10)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = body
        Task { [weak self] in
            var problem: String?
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if status != 200 { problem = "HTTP \(status)" }
            } catch {
                problem = error.localizedDescription
            }
            guard let self else { return }
            // The hub is often just out of reach (another network, Pi asleep); log each new problem once.
            if problem != self.lastError {
                NSLog("Claude Status: Desk Hub sync \(problem.map { "failed: \($0)" } ?? "working")")
                self.lastError = problem
            }
            self.problem = problem
            if problem != nil { self.lastBody = nil }
        }
    }

    // MARK: Taps on the desk

    /// Holds a connection to the hub open and handles what it sends. Reconnects on its own,
    /// waiting longer each time the hub can't be reached (up to a minute).
    private func listen() {
        listener?.cancel()
        listener = Task { [weak self] in
            var wait = 2.0
            while !Task.isCancelled {
                guard let self, self.enabled else { return }
                if let config = self.config, let base = URL(string: config.hub) {
                    var request = URLRequest(url: base.appendingPathComponent("api/claude/listen"), timeoutInterval: 90)
                    request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let connected = await Self.stream(request) { [weak self] line in self?.handle(line) }
                    if connected { wait = 2 }
                }
                try? await Task.sleep(for: .seconds(wait))
                wait = min(wait * 2, 60)
            }
        }
    }

    /// Reads server-sent events until the connection drops. True if it got connected at all.
    nonisolated private static func stream(_ request: URLRequest, onData: @escaping @MainActor @Sendable (String) -> Void) async -> Bool {
        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
            for try await line in bytes.lines where line.hasPrefix("data:") {
                await onData(String(line.dropFirst(5)))
            }
            return true
        } catch {
            return false
        }
    }

    private func handle(_ json: String) {
        guard let message = try? JSONDecoder().decode(Message.self, from: Data(json.utf8)) else { return }
        switch message.type {
        case "open": if let id = message.id { onCommand(.open(id)) }
        case "read": onCommand(.read(message.ids ?? []))
        case "readAll": onCommand(.readAll)
        default: break
        }
    }

    /// macOS asks once whether the app may reach devices on the home network; this is where it's changed later.
    func openLocalNetworkSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork") {
            NSWorkspace.shared.open(url)
        }
    }

    private static func item(_ chat: Chat, unread: Bool) -> Item {
        let state: String, detail: String
        switch chat.state {
        case .needsInput(let reason): (state, detail) = ("needs", reason)
        case .running: (state, detail) = ("running", chat.activity ?? (chat.isBackground ? "Working in the background" : "Working"))
        case .done: (state, detail) = ("done", "")
        }
        return Item(id: chat.id, title: chat.title, project: chat.project, state: state, detail: detail,
                    preview: chat.preview ?? "", since: (chat.since.timeIntervalSince1970 * 1000).rounded(),
                    unread: unread)
    }
}
