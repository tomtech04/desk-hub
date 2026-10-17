import Foundation
import SwiftUI

/// The hub's data on the phone, kept fresh, plus the things the phone can do to it. Talks to the
/// same JSON API the hub's own screens use, signed in with the hub's session cookie.
@MainActor
final class HubStore: ObservableObject {
    enum Status: Equatable {
        case idle, loading, ok
        case signIn(canSignIn: Bool)
        case offline(String)
    }

    @Published private(set) var dashboard: Dashboard?
    @Published private(set) var status: Status = .idle
    @Published private(set) var updatedAt: Date?
    /// A short message about the last action that didn't work, shown as a banner.
    @Published var problem: String?

    private let settings: HubSettings
    private var timer: Timer?

    init(settings: HubSettings) {
        self.settings = settings
    }

    // MARK: Loading

    func startRefreshing() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
        Task { await refresh() }
    }

    func stopRefreshing() {
        timer?.invalidate()
        timer = nil
    }

    func refresh() async {
        guard settings.baseURL != nil else {
            status = .offline("Add your hub's address in More → Hub connection.")
            return
        }
        if dashboard == nil { status = .loading }
        do {
            let (data, code) = try await call("GET", "api/dashboard")
            if code == 401 {
                let hint = try? JSONDecoder().decode(SignInHint.self, from: data)
                status = .signIn(canSignIn: hint?.canSignIn ?? true)
                return
            }
            guard code == 200 else {
                status = .offline("The hub answered with an error (\(code)).")
                return
            }
            let next = try JSONDecoder().decode(Dashboard.self, from: data)
            if let tz = next.tz.flatMap(TimeZone.init(identifier:)) { Fmt.timeZone = tz }
            dashboard = next
            updatedAt = Date()
            status = .ok
        } catch let error as DecodingError {
            status = .offline("The hub sent something this app couldn't read (\(Self.describe(error))).")
        } catch {
            status = .offline(error.localizedDescription)
        }
    }

    // MARK: Sign-in (only when the hub has HUB_PASSWORD set)

    func signIn(password: String) async -> String? {
        do {
            let (data, code) = try await call("POST", "api/login", ["password": password])
            if code == 200 {
                await refresh()
                return nil
            }
            return (try? JSONDecoder().decode(ErrorReply.self, from: data))?.error ?? "Sign-in failed (\(code))."
        } catch {
            return error.localizedDescription
        }
    }

    func signOut() async {
        _ = try? await call("POST", "api/logout")
        await refresh()
    }

    // MARK: Tasks

    func setDone(_ todo: Todo, _ done: Bool) async {
        edit(todo.id) { $0.done = done }
        await act("PATCH", "api/todos/\(todo.id)", ["done": done])
    }

    func setStar(_ todo: Todo, _ star: Bool) async {
        edit(todo.id) { $0.star = star }
        await act("PATCH", "api/todos/\(todo.id)", ["star": star])
    }

    /// Keeps a task Claude suggested from an email.
    func keep(_ todo: Todo) async {
        edit(todo.id) { $0.suggested = false }
        await act("PATCH", "api/todos/\(todo.id)", ["suggested": false])
    }

    func remove(_ todo: Todo) async {
        dashboard?.todos?.removeAll { $0.id == todo.id }
        await act("DELETE", "api/todos/\(todo.id)")
    }

    func setStep(_ todo: Todo, _ step: Subtask, done: Bool) async {
        let steps = (todo.subtasks ?? []).map { s -> [String: Any] in
            ["id": s.id, "text": s.text, "done": s.id == step.id ? done : (s.done ?? false)]
        }
        edit(todo.id) { t in
            t.subtasks = t.subtasks?.map { s in var s = s; if s.id == step.id { s.done = done }; return s }
        }
        await act("PATCH", "api/todos/\(todo.id)", ["subtasks": steps])
    }

    func add(text: String, tag: String?, due: Date?) async {
        var body: [String: Any] = ["text": text]
        if let tag { body["tag"] = tag }
        if let due { body["due"] = Self.startOfDayMs(due) }
        await act("POST", "api/todos", body)
    }

    // MARK: Mail

    func hideMail(_ id: String) async {
        for i in (dashboard?.mail?.data?.accounts ?? []).indices {
            dashboard?.mail?.data?.accounts?[i].messages?.removeAll { $0.id == id }
        }
        await act("POST", "api/mail/hide", ["id": id])
    }

    /// Claude reads the whole email and writes a task from it.
    func makeTask(fromMail id: String) async -> Bool {
        await act("POST", "api/mail/task", ["id": id])
    }

    func readMail(_ id: String) async throws -> MailBody {
        let (data, code) = try await call("POST", "api/mail/read", ["id": id])
        guard code == 200 else { throw HubError("The hub couldn't open that email (\(code)).") }
        return try JSONDecoder().decode(MailBody.self, from: data)
    }

    func runDigest() async {
        await act("POST", "api/digest")
    }

    // MARK: Journal

    /// A typed note for today, kept as written.
    func addNote(_ text: String) async -> Bool {
        await act("POST", "api/journal/daynote", ["text": text])
    }

    /// Something said into the phone: the hub sorts it into tasks, notes and reflections, like
    /// a note from the ring.
    func sendSpoken(_ text: String, recordedAt: Date) async -> Bool {
        let body: [String: Any] = ["text": text, "recordedAt": Int64(recordedAt.timeIntervalSince1970 * 1000)]
        do {
            var (_, code) = try await call("POST", "api/voice", body, headers: ["x-hub-source": "phone"])
            if code == 401, !settings.voiceToken.isEmpty {
                (_, code) = try await call("POST", "api/voice", body, headers: ["Authorization": "Bearer \(settings.voiceToken)"])
            }
            guard (200..<300).contains(code) else {
                problem = code == 401 ? "Sign in to the hub (More → Hub connection) to send notes." : "The hub didn't take the note (\(code))."
                return false
            }
            // Claude takes a few seconds to act on it; pick up the result.
            Task {
                for delay in [2.5, 6.0, 12.0] {
                    try? await Task.sleep(for: .seconds(delay))
                    await refresh()
                }
            }
            return true
        } catch {
            problem = error.localizedDescription
            return false
        }
    }

    func runRecap() async {
        await act("POST", "api/recap")
        Task {
            try? await Task.sleep(for: .seconds(8))
            await refresh()
        }
    }

    func journalDays(search: String) async -> [JournalDay] {
        let q = search.trimmingCharacters(in: .whitespaces).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let reply = try? await call("GET", "api/journal/days" + (q.isEmpty ? "" : "?q=\(q)")), reply.1 == 200 else { return [] }
        return (try? JSONDecoder().decode(JournalDays.self, from: reply.0))?.days ?? []
    }

    // MARK: Health

    /// The day's Apple Health summary and check-ins, as JSON. Uses the signed-in session, or the
    /// voice token when there isn't one, so it works from the background too. Returns a problem, or nil.
    func postHealth(_ json: Data) async -> String? {
        do {
            var (_, code) = try await call("POST", "api/health", raw: json)
            if code == 401, !settings.voiceToken.isEmpty {
                (_, code) = try await call("POST", "api/health", raw: json, headers: ["Authorization": "Bearer \(settings.voiceToken)"])
            }
            if (200..<300).contains(code) { return nil }
            return code == 401 ? "Sign in to the hub or add the voice token (More → Hub connection)." : "The hub answered with an error (\(code))."
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: Alerts

    func dismiss(_ alert: HubAlert) async {
        dashboard?.alerts?.removeAll { $0.id == alert.id }
        await act("POST", "api/alerts/\(alert.id)/dismiss")
    }

    // MARK: Plumbing

    /// Runs an action, reports a failure as `problem`, and refreshes either way.
    @discardableResult
    private func act(_ method: String, _ path: String, _ body: [String: Any]? = nil) async -> Bool {
        var ok = false
        do {
            let (data, code) = try await call(method, path, body)
            ok = (200..<300).contains(code)
            if !ok { problem = (try? JSONDecoder().decode(ErrorReply.self, from: data))?.error ?? "The hub answered with an error (\(code))." }
        } catch {
            problem = error.localizedDescription
        }
        await refresh()
        return ok
    }

    private func edit(_ id: String, _ change: (inout Todo) -> Void) {
        guard let i = dashboard?.todos?.firstIndex(where: { $0.id == id }) else { return }
        change(&dashboard!.todos![i])
    }

    private func call(_ method: String, _ path: String, _ body: [String: Any]? = nil, raw: Data? = nil, headers: [String: String] = [:]) async throws -> (Data, Int) {
        guard let base = settings.baseURL, let url = URL(string: path, relativeTo: base.appendingPathComponent("/")) else {
            throw HubError("Add your hub's address in More → Hub connection.")
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = method
        for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } else if let raw {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = raw
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    /// Due dates are the start of a day in the hub's time zone, in ms.
    private static func startOfDayMs(_ date: Date) -> Double {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = Fmt.timeZone
        return c.startOfDay(for: date).timeIntervalSince1970 * 1000
    }

    private static func describe(_ error: DecodingError) -> String {
        switch error {
        case .keyNotFound(let key, let ctx): return "missing \(path(ctx.codingPath + [key]))"
        case .typeMismatch(_, let ctx), .valueNotFound(_, let ctx): return "unexpected \(path(ctx.codingPath))"
        case .dataCorrupted(let ctx): return "bad data at \(path(ctx.codingPath))"
        @unknown default: return "unknown"
        }
    }

    private static func path(_ keys: [CodingKey]) -> String {
        keys.map { $0.intValue.map(String.init) ?? $0.stringValue }.joined(separator: ".")
    }
}

private struct SignInHint: Decodable { var canSignIn: Bool? }
private struct ErrorReply: Decodable { var error: String? }

struct HubError: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

// MARK: Derived views of the dashboard

extension Dashboard {
    var openTodos: [Todo] { (todos ?? []).filter { !$0.isDone && !$0.isSuggested } }
    var suggestedTodos: [Todo] { (todos ?? []).filter { !$0.isDone && $0.isSuggested } }

    /// Due today or earlier, then starred, soonest first.
    var focusTodos: [Todo] {
        openTodos.filter { t in (t.due.map { Fmt.dayOffset(Fmt.date($0)) <= 0 } ?? false) || t.star == true }
            .sorted { ($0.due ?? .greatestFiniteMagnitude) < ($1.due ?? .greatestFiniteMagnitude) }
    }

    var overdueTodos: [Todo] { openTodos.filter { $0.due.map { Fmt.dayOffset(Fmt.date($0)) < 0 } ?? false } }

    var allMail: [MailMessage] { (mail?.data?.accounts ?? []).flatMap { $0.messages ?? [] } }
    var urgentMail: [MailMessage] { allMail.filter(\.isUrgent) }

    var events: [CalEvent] { (calendar?.data?.events ?? []).sorted { $0.start < $1.start } }

    /// What's still ahead today (or happening now).
    var upNext: [CalEvent] {
        let nowMs = Date().timeIntervalSince1970 * 1000
        return events.filter { $0.endMs >= nowMs && Fmt.dayOffset(Fmt.date($0.start)) <= 0 }
    }

    var payitIssues: [SystemCheck] { (payit?.data?.systems ?? []).filter { !$0.isUp } }

    var todayJournal: [JournalEntry] {
        (journal ?? []).filter { $0.pending != true && Fmt.isToday(Fmt.date($0.at)) }.sorted { $0.at > $1.at }
    }

    /// Feeds that are failing right now.
    var failingFeeds: [FeedIssue] {
        var out: [FeedIssue] = []
        if let e = payit?.error { out.append(FeedIssue(name: "PayIt", error: e)) }
        if let e = mail?.error { out.append(FeedIssue(name: "Mail", error: e)) }
        if let e = calendar?.error { out.append(FeedIssue(name: "Calendar", error: e)) }
        if let e = weather?.error { out.append(FeedIssue(name: "Weather", error: e)) }
        return out
    }
}

struct FeedIssue: Identifiable {
    let name: String
    let error: String
    var id: String { name }
}
