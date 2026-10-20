import Foundation

/// What the app and its home-screen widget share through the App Group: where the hub is, the
/// cookie that signs in to it, and the last PayIt numbers seen. This file is compiled into both.
enum Shared {
    /// "group.<bundle id>", written into both Info.plists by project.yml.
    static let groupId = (Bundle.main.object(forInfoDictionaryKey: "DeskHubAppGroup") as? String) ?? "group.com.tomtech04.deskhub"
    static let defaults = UserDefaults(suiteName: groupId) ?? .standard

    private enum Key {
        static let address = "hubAddress", cookie = "hubCookie", payit = "payit", weather = "weather", wellness = "wellness"
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

    static var weather: WeatherSnapshot? {
        get { defaults.data(forKey: Key.weather).flatMap { try? JSONDecoder().decode(WeatherSnapshot.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: Key.weather) }
    }

    /// Today's stress, written by the app whenever Health or a check-in changes it.
    static var wellness: WellnessSnapshot? {
        get { defaults.data(forKey: Key.wellness).flatMap { try? JSONDecoder().decode(WellnessSnapshot.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: Key.wellness) }
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
    /// What the platform kept in fees today (Stripe application fees, less refunds). Nil when the
    /// hub has no Stripe key.
    var feesCents: Double?
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
            struct Profit: Decodable { var todayCents: Double? }
            struct Day: Decodable { var cents: Double? }
            struct Subs: Decodable { var paying: Int?; var monthCents: Double? }
            struct Check: Decodable { var status: String? }
            var today: Today?
            var profit: Profit?
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
            feesCents: body.profit?.todayCents,
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
        guard let data = try await HubDashboard.fetch() else { return nil }
        return parse(dashboard: data)
    }
}

enum HubDashboard {
    /// The hub's `/api/dashboard` reply, with the shared address and sign-in cookie. Nil when
    /// there's no address; throws when the hub can't be reached.
    static func fetch() async throws -> Data? {
        guard let base = Shared.baseURL(Shared.hubAddress) else { return nil }
        var request = URLRequest(url: base.appendingPathComponent("api/dashboard"), timeoutInterval: 8)
        request.httpShouldHandleCookies = false
        if let cookie = Shared.hubCookie { request.setValue("hub_session=\(cookie)", forHTTPHeaderField: "Cookie") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.userAuthenticationRequired) }
        return data
    }
}

/// The weather the widget shows: now, the day's range, and the next few hours.
struct WeatherSnapshot: Codable, Equatable {
    struct Hour: Codable, Equatable {
        /// 0–23, in the hub's weather time zone.
        var hour: Int
        var temp: Double
        var code: Int
        var rain: Int
    }

    var unit: String
    var temp: Double
    var feels: Double?
    var code: Int
    var isDay: Bool
    var hi: Double?
    var lo: Double?
    var rainChance: Int?
    var hours: [Hour]
    var updatedAt: Date

    func sameNumbers(as other: WeatherSnapshot?) -> Bool {
        guard var copy = other else { return false }
        copy.updatedAt = updatedAt
        return copy == self
    }

    /// SF Symbol for a WMO weather code (the codes Open-Meteo uses).
    static func symbol(_ code: Int?, day: Bool = true) -> String {
        switch code ?? 0 {
        case 0: return day ? "sun.max.fill" : "moon.stars.fill"
        case 1, 2: return day ? "cloud.sun.fill" : "cloud.moon.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51...57: return "cloud.drizzle.fill"
        case 61...67, 80...82: return "cloud.rain.fill"
        case 71...77, 85, 86: return "cloud.snow.fill"
        case 95...99: return "cloud.bolt.rain.fill"
        default: return "cloud.fill"
        }
    }

    static func word(_ code: Int?) -> String {
        switch code ?? 0 {
        case 0: return "Clear"
        case 1: return "Mostly clear"
        case 2: return "Partly cloudy"
        case 3: return "Cloudy"
        case 45, 48: return "Fog"
        case 51...57: return "Drizzle"
        case 61...67: return "Rain"
        case 71...77: return "Snow"
        case 80...82: return "Showers"
        case 95...99: return "Storms"
        default: return "Cloudy"
        }
    }
}

extension WeatherSnapshot {
    private struct Wire: Decodable {
        struct Feed: Decodable { var data: Body? }
        struct Body: Decodable {
            struct Hour: Decodable { var time: String; var temp: Double?; var code: Int?; var rain: Int? }
            var unit: String?
            var temp: Double?
            var feels: Double?
            var code: Int?
            var isDay: Bool?
            var hi: Double?
            var lo: Double?
            var rainChance: Int?
            var hours: [Hour]?
        }
        var weather: Feed?
    }

    /// The weather part of the hub's `/api/dashboard` reply, or nil when the hub has none.
    static func parse(dashboard data: Data, at date: Date = Date()) -> WeatherSnapshot? {
        guard let body = (try? JSONDecoder().decode(Wire.self, from: data))?.weather?.data, let temp = body.temp else { return nil }
        let hours = (body.hours ?? []).prefix(8).compactMap { h -> Hour? in
            // "2026-10-20T14:00": the hour sits after the T.
            guard h.time.count >= 13, let hour = Int(h.time.dropFirst(11).prefix(2)), let t = h.temp else { return nil }
            return Hour(hour: hour, temp: t, code: h.code ?? 0, rain: h.rain ?? 0)
        }
        return WeatherSnapshot(
            unit: body.unit ?? "F", temp: temp, feels: body.feels, code: body.code ?? 0, isDay: body.isDay ?? true,
            hi: body.hi, lo: body.lo, rainChance: body.rainChance, hours: hours, updatedAt: date)
    }
}

/// How the day is going, from the Apple Watch estimate and the latest check-in.
struct WellnessSnapshot: Codable, Equatable {
    /// "yyyy-MM-dd" the numbers are for; the widget ignores them on a later day.
    var day: String
    /// 0–100 against the person's own usual.
    var score: Int?
    /// calm, typical, elevated or high.
    var label: String?
    var learning: Bool
    /// The stress (1–5) from today's latest check-in.
    var checkinStress: Int?
    var headline: String?
    var steps: Double?
    var updatedAt: Date

    func sameNumbers(as other: WellnessSnapshot?) -> Bool {
        guard var copy = other else { return false }
        copy.updatedAt = updatedAt
        return copy == self
    }

    static func dayKey(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    var isToday: Bool { day == Self.dayKey() }
}
