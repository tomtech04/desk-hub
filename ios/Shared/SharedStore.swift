import Foundation

/// What the app and its home-screen widget share through the App Group: where the hub is, the
/// cookie that signs in to it, and the last PayIt numbers seen. This file is compiled into both.
enum Shared {
    /// "group.<bundle id>", written into both Info.plists by project.yml.
    static let groupId = (Bundle.main.object(forInfoDictionaryKey: "DeskHubAppGroup") as? String) ?? "group.com.tomtech04.deskhub"
    static let defaults = UserDefaults(suiteName: groupId) ?? .standard

    private enum Key {
        static let address = "hubAddress", cookie = "hubCookie", payit = "payit"
    }

    static var hubAddress: String? {
        get { defaults.string(forKey: Key.address) }
        set { defaults.set(newValue, forKey: Key.address) }
    }

    /// The value of the hub's `hub_session` cookie, when the hub asks for a password.
    static var hubCookie: String? {
        get { defaults.string(forKey: Key.cookie) }
        set { defaults.set(newValue, forKey: Key.cookie) }
    }

    static var payit: PayitSnapshot? {
        get { defaults.data(forKey: Key.payit).flatMap { try? JSONDecoder().decode(PayitSnapshot.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: Key.payit) }
    }

    /// The hub's address as a URL, accepting "deskhub.local:8080" without a scheme.
    static func baseURL(_ address: String?) -> URL? {
        var text = (address ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") { text = "http://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), url.host != nil else { return nil }
        return url
    }
}

/// The PayIt numbers the widget shows.
struct PayitSnapshot: Codable, Equatable {
    var todayCents: Double
    var count: Int
    /// What yesterday had come to by this time of day, to say whether today is ahead.
    var yesterdaySameTimeCents: Double?
    /// The last seven days, oldest first.
    var weekCents: [Double]
    var subsPaying: Int?
    var subsMonthCents: Double?
    /// Systems the hourly check reports as not up.
    var systemIssues: Int
    var updatedAt: Date

    /// Whether the figures match, ignoring when they were read.
    func sameNumbers(as other: PayitSnapshot?) -> Bool {
        guard var copy = other else { return false }
        copy.updatedAt = updatedAt
        return copy == self
    }

    /// Today against yesterday at this time, as a fraction (0.12 is 12% ahead). Nil when there's
    /// nothing to compare.
    var versusYesterday: Double? {
        guard let y = yesterdaySameTimeCents, y > 0 else { return nil }
        return (todayCents - y) / y
    }
}

extension PayitSnapshot {
    private struct Wire: Decodable {
        struct Feed: Decodable { var data: Body? }
        struct Body: Decodable {
            struct Today: Decodable { var grossCents: Double?; var count: Int? }
            struct Day: Decodable { var cents: Double? }
            struct Subs: Decodable { var paying: Int?; var monthCents: Double? }
            struct Check: Decodable { var status: String? }
            var today: Today?
            var yesterdaySameTimeCents: Double?
            var week: [Day]?
            var subscriptions: Subs?
            var systems: [Check]?
        }
        var payit: Feed?
    }

    /// The PayIt part of the hub's `/api/dashboard` reply, or nil when the hub has no PayIt data.
    static func parse(dashboard data: Data, at date: Date = Date()) -> PayitSnapshot? {
        guard let body = (try? JSONDecoder().decode(Wire.self, from: data))?.payit?.data, let today = body.today else { return nil }
        return PayitSnapshot(
            todayCents: today.grossCents ?? 0,
            count: today.count ?? 0,
            yesterdaySameTimeCents: body.yesterdaySameTimeCents,
            weekCents: (body.week ?? []).suffix(7).map { $0.cents ?? 0 },
            subsPaying: body.subscriptions?.paying,
            subsMonthCents: body.subscriptions?.monthCents,
            systemIssues: (body.systems ?? []).filter { $0.status != nil && $0.status != "up" }.count,
            updatedAt: date
        )
    }

    /// Asks the hub directly, with the shared address and sign-in cookie. Nil when there's no
    /// address or the hub has no PayIt numbers; throws when it can't be reached.
    static func fetch() async throws -> PayitSnapshot? {
        guard let base = Shared.baseURL(Shared.hubAddress) else { return nil }
        var request = URLRequest(url: base.appendingPathComponent("api/dashboard"), timeoutInterval: 8)
        request.httpShouldHandleCookies = false
        if let cookie = Shared.hubCookie { request.setValue("hub_session=\(cookie)", forHTTPHeaderField: "Cookie") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.userAuthenticationRequired) }
        return parse(dashboard: data)
    }
}
