import AppKit
import Observation
import ServiceManagement

/// Reads Claude Code's live session registry plus the hook events, and turns them into chats.
@MainActor
@Observable
final class SessionStore {
    private(set) var chats: [Chat] = []
    /// Finished chats you haven't opened yet. A chat joins when it finishes, and leaves when you open it
    /// (here, from an alert, or by tapping it on Desk Hub), mark it read, or it starts working again.
    private(set) var unread = Set(UserDefaults.standard.stringArray(forKey: "unread") ?? [])
    /// Whether ~/.claude/settings.json runs our hook. Without it, permission prompts read as "Running".
    private(set) var hookInstalled = true
    private(set) var hookError: String?
    var launchAtLogin: Bool {
        didSet { updateLoginItem() }
    }
    let alerter = Alerter()
    let hubSync = HubSync()

    @ObservationIgnored private var hasLoaded = false
    @ObservationIgnored private var watcher: FileWatcher?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var previews: [String: (stamp: Double, text: String?)] = [:]

    static let claudeDir = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".claude")
    static let registryDir = claudeDir.appendingPathComponent("sessions")
    static let eventsDir = claudeDir.appendingPathComponent("claude-status/events")
    static let claudeBundleID = "com.anthropic.claudefordesktop"

    init() {
        launchAtLogin = SMAppService.mainApp.status == .enabled
        // Open at Login starts on. This runs once, so turning it off in the menu sticks.
        // Debug self-check copies are skipped so a scratch build never becomes the login item.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: "loginItemDefaultApplied"),
           ProcessInfo.processInfo.environment["CLAUDE_STATUS_SNAPSHOT"] == nil {
            defaults.set(true, forKey: "loginItemDefaultApplied")
            if !launchAtLogin {
                launchAtLogin = true
                updateLoginItem()
            }
        }
        // Claude Status became Desk Hub (same bundle id, new place): point the login item at this copy, once.
        if !defaults.bool(forKey: "loginItemMovedToDeskHub"), launchAtLogin,
           ProcessInfo.processInfo.environment["CLAUDE_STATUS_SNAPSHOT"] == nil {
            defaults.set(true, forKey: "loginItemMovedToDeskHub")
            try? SMAppService.mainApp.unregister()
            updateLoginItem()
        }
        try? FileManager.default.createDirectory(at: Self.eventsDir, withIntermediateDirectories: true)
        pruneOldEvents()
        alerter.onOpen = { [weak self] chatId in self?.open(chatId: chatId) }
        hubSync.onCommand = { [weak self] command in
            switch command {
            case .open(let id): self?.open(chatId: id)
            case .read(let ids): self?.markRead(ids)
            case .readAll: self?.markAllRead()
            }
        }
        refresh()
        watcher = FileWatcher(paths: [Self.registryDir.path, Self.eventsDir.path]) { [weak self] in
            self?.refresh()
        }
        // Catches chats whose process quit without cleaning up its registry file.
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        }
        #if DEBUG
        SelfCheck.startIfRequested(self)
        #endif
    }

    var needsInput: [Chat] { chats.filter { if case .needsInput = $0.state { true } else { false } } }
    var running: [Chat] { chats.filter { $0.state == .running } }
    var done: [Chat] { chats.filter { $0.state == .done } }

    func isUnread(_ chat: Chat) -> Bool {
        chat.state == .done && unread.contains(chat.id)
    }

    func markRead(_ ids: [String]) {
        setUnread(unread.subtracting(ids))
    }

    func markAllRead() {
        setUnread([])
    }

    private func setUnread(_ next: Set<String>) {
        guard next != unread else { return }
        unread = next
        UserDefaults.standard.set(Array(next), forKey: "unread")
        hubSync.update(chats, unread: unread)
    }

    /// A chat that just finished is unread; one that's working or waiting again, or closed, isn't.
    private func updateUnread(previous: [Chat]?, current: [Chat]) {
        let before = Dictionary((previous ?? []).map { ($0.id, $0.state) }, uniquingKeysWith: { a, _ in a })
        var next = unread.intersection(current.map(\.id))
        for chat in current {
            if chat.state != .done {
                next.remove(chat.id)
            } else if let old = before[chat.id], old != .done {
                next.insert(chat.id)
            }
        }
        setUnread(next)
    }

    // MARK: - Loading

    func refresh() {
        let fm = FileManager.default
        let files = (try? fm.contentsOfDirectory(at: Self.registryDir, includingPropertiesForKeys: nil)) ?? []
        let events = loadEvents()
        var bySession: [String: Chat] = [:]

        for file in files where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file),
                  let entry = try? JSONDecoder().decode(RegistryEntry.self, from: data),
                  entry.spare != true,
                  let sessionId = entry.sessionId,
                  Proc.isAlive(entry.pid, startedAt: entry.startedAt)
            else { continue }
            let chat = makeChat(entry, sessionId: sessionId, event: events[sessionId])
            // A resumed chat can briefly have two processes; keep the most recent.
            if let existing = bySession[sessionId], existing.since >= chat.since { continue }
            bySession[sessionId] = chat
        }

        let sorted = bySession.values.sorted { $0.since > $1.since }
        if sorted != chats || !hasLoaded {
            let previous = hasLoaded ? chats : nil
            chats = sorted
            alerter.process(previous: previous, current: sorted)
            updateUnread(previous: previous, current: sorted)
            hubSync.update(sorted, unread: unread)
        }
        hasLoaded = true

        let settings = (try? String(contentsOf: Self.claudeDir.appendingPathComponent("settings.json"), encoding: .utf8)) ?? ""
        let installed = settings.contains("claude-status/hook.sh")
        if installed != hookInstalled { hookInstalled = installed }
    }

    /// Runs the bundled setup script, which adds the hook to ~/.claude/settings.json.
    func installHook() {
        guard let script = Bundle.main.resourceURL?.appendingPathComponent("scripts/setup-hook.sh") else { return }
        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = [script.path]
        process.standardOutput = output
        process.standardError = output
        process.terminationHandler = { [weak self] finished in
            let status = finished.terminationStatus
            let message = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            Task { @MainActor in
                self?.hookError = status == 0 ? nil : message.nonEmpty ?? "Setup failed (exit \(status))"
                self?.refresh()
            }
        }
        do {
            try process.run()
        } catch {
            hookError = error.localizedDescription
        }
    }

    private func makeChat(_ entry: RegistryEntry, sessionId: String, event: HookEvent?) -> Chat {
        let stamp = entry.statusUpdatedAt ?? entry.updatedAt ?? entry.startedAt ?? 0
        let statusAt = Date(timeIntervalSince1970: stamp / 1000)
        var since = statusAt
        let state: ChatState
        // The tool it used last, if that happened during this turn.
        let activity = event.flatMap { $0.date >= statusAt ? $0.activity : nil }

        switch entry.status {
        case "waiting":
            state = .needsInput(Self.waitingReason(entry))
        case "busy":
            // Permission prompts and plan approvals leave the registry at "busy",
            // so the hook fills in those. An event from before this turn is stale.
            if let event, let reason = event.attentionReason, event.date >= statusAt {
                state = .needsInput(reason)
                since = event.date
            } else {
                state = .running
            }
        default:
            state = .done
        }

        let cwd = entry.cwd ?? ""
        let project = Self.projectName(cwd)
        return Chat(
            id: sessionId,
            pid: entry.pid,
            title: entry.name?.nonEmpty ?? project.nonEmpty ?? "Untitled chat",
            cwd: cwd,
            project: project,
            state: state,
            since: since,
            hostSessionId: entry.hostSessionId,
            isDesktop: entry.entrypoint == "claude-desktop",
            isBackground: entry.kind != nil && entry.kind != "interactive",
            preview: state == .done ? preview(sessionId: sessionId, cwd: cwd, stamp: stamp) : nil,
            activity: state == .running ? activity : nil
        )
    }

    private func loadEvents() -> [String: HookEvent] {
        let urls = (try? FileManager.default.contentsOfDirectory(
            at: Self.eventsDir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        var events: [String: HookEvent] = [:]
        for url in urls where url.pathExtension == "json" {
            guard let data = try? Data(contentsOf: url),
                  var event = try? JSONDecoder().decode(HookEvent.self, from: data),
                  let modified = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            else { continue }
            event.date = modified
            events[url.deletingPathExtension().lastPathComponent] = event
        }
        return events
    }

    private func pruneOldEvents() {
        let fm = FileManager.default
        let cutoff = Date.now.addingTimeInterval(-3 * 86_400)
        let urls = (try? fm.contentsOfDirectory(
            at: Self.eventsDir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        for url in urls {
            let modified = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            if let modified, modified < cutoff { try? fm.removeItem(at: url) }
        }
    }

    /// The last text Claude wrote in the chat, read from the end of its transcript.
    private func preview(sessionId: String, cwd: String, stamp: Double) -> String? {
        if let cached = previews[sessionId], cached.stamp == stamp { return cached.text }
        let folder = String(cwd.map { $0.isASCII && ($0.isLetter || $0.isNumber) ? $0 : "-" })
        let transcript = Self.claudeDir.appendingPathComponent("projects/\(folder)/\(sessionId).jsonl")
        let text = Transcript.lastAssistantText(at: transcript)
        previews[sessionId] = (stamp, text)
        return text
    }

    static func waitingReason(_ entry: RegistryEntry) -> String {
        if let needs = entry.needs?.nonEmpty { return needs.capitalizedFirst }
        switch entry.waitingFor {
        case "input needed": return "Needs your input"
        case "goal proposal": return "Proposed a goal for the chat"
        case "sandbox request": return "A command needs network access"
        case "worker request": return "A worker needs your approval"
        default: return "Waiting on you"
        }
    }

    static func projectName(_ cwd: String) -> String {
        guard !cwd.isEmpty else { return "" }
        if cwd == NSHomeDirectory() { return "Home" }
        // Worktrees live inside the repo they came from; name the repo.
        if let range = cwd.range(of: "/.claude/worktrees/") {
            return URL(fileURLWithPath: String(cwd[..<range.lowerBound])).lastPathComponent
        }
        return URL(fileURLWithPath: cwd).lastPathComponent
    }

    // MARK: - Actions

    func open(_ chat: Chat) {
        markRead([chat.id])
        if chat.isDesktop, let host = chat.hostSessionId,
           var components = URLComponents(string: "claude://code/continue") {
            components.queryItems = [URLQueryItem(name: "session", value: host)]
            if let url = components.url {
                NSWorkspace.shared.open(url)
                return
            }
        }
        // A terminal chat: bring forward the app it runs in (Terminal, iTerm, VS Code...).
        if let app = Proc.hostApp(of: chat.pid) {
            app.activate()
            return
        }
        openClaude()
    }

    func open(chatId: String) {
        if let chat = chats.first(where: { $0.id == chatId }) {
            open(chat)
        } else {
            openClaude()
        }
    }

    func openClaude() {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: Self.claudeBundleID) else { return }
        NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
    }

    func newChat() {
        if let url = URL(string: "claude://code/new") { NSWorkspace.shared.open(url) }
    }

    func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    func revealFolder(_ chat: Chat) {
        guard !chat.cwd.isEmpty else { return }
        NSWorkspace.shared.open(URL(fileURLWithPath: chat.cwd))
    }

    private func updateLoginItem() {
        do {
            if launchAtLogin {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            NSLog("Claude Status: login item status \(SMAppService.mainApp.status.rawValue)")
        } catch {
            NSLog("Claude Status: login item change failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Helpers

enum Transcript {
    static func lastAssistantText(at url: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        let end = (try? handle.seekToEnd()) ?? 0
        try? handle.seek(toOffset: end > 262_144 ? end - 262_144 : 0)
        guard let data = try? handle.readToEnd() else { return nil }

        // The first line may be cut off by the seek; it just fails to parse.
        for line in data.split(separator: UInt8(ascii: "\n")).reversed() {
            guard let record = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any],
                  record["type"] as? String == "assistant",
                  let message = record["message"] as? [String: Any],
                  let content = message["content"] as? [[String: Any]]
            else { continue }
            let text = content
                .compactMap { $0["type"] as? String == "text" ? $0["text"] as? String : nil }
                .joined(separator: " ")
            if let clean = plain(text) { return clean }
        }
        return nil
    }

    /// Flattens markdown to one line of plain text.
    private static func plain(_ text: String) -> String? {
        var out = text.replacingOccurrences(of: #"\[([^\]]*)\]\([^)]*\)"#, with: "$1", options: .regularExpression)
        out = out.replacingOccurrences(of: #"(?m)^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+"#, with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: #"[*`]+"#, with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return out.nonEmpty.map { String($0.prefix(240)) }
    }
}

enum Proc {
    private static func info(_ pid: pid_t) -> kinfo_proc? {
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        guard sysctl(&mib, u_int(mib.count), &info, &size, nil, 0) == 0, size > 0 else { return nil }
        return info
    }

    /// True when the process is running and is the one that wrote the registry entry
    /// (a process that started after the entry was written has reused the pid).
    static func isAlive(_ pid: pid_t, startedAt: Double?) -> Bool {
        guard pid > 0, let info = info(pid) else { return false }
        guard let startedAt else { return true }
        return Double(info.kp_proc.p_starttime.tv_sec) <= startedAt / 1000 + 5
    }

    /// The nearest ancestor of `pid` that is a regular app with a Dock icon.
    static func hostApp(of pid: pid_t) -> NSRunningApplication? {
        var current = pid
        for _ in 0..<16 {
            guard let parent = info(current)?.kp_eproc.e_ppid, parent > 1 else { return nil }
            if let app = NSRunningApplication(processIdentifier: parent), app.activationPolicy == .regular {
                return app
            }
            current = parent
        }
        return nil
    }
}

/// Calls back on the main queue whenever a file under one of the paths changes.
/// The stream is only touched in init and deinit, and events arrive on the main queue.
final class FileWatcher: @unchecked Sendable {
    private var stream: FSEventStreamRef?
    private let onChange: @MainActor @Sendable () -> Void

    init(paths: [String], onChange: @escaping @MainActor @Sendable () -> Void) {
        self.onChange = onChange
        var context = FSEventStreamContext(
            version: 0, info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, _, _, _, _ in
            guard let info else { return }
            let watcher = Unmanaged<FileWatcher>.fromOpaque(info).takeUnretainedValue()
            MainActor.assumeIsolated { watcher.onChange() }
        }
        let flags = FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer)
        stream = FSEventStreamCreate(
            nil, callback, &context, paths as CFArray,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.2, flags)
        guard let stream else { return }
        FSEventStreamSetDispatchQueue(stream, .main)
        FSEventStreamStart(stream)
    }

    deinit {
        guard let stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
    }
}
