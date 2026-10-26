import SwiftUI

// The hub's GET /api/dashboard, decoded leniently: every field is optional so a hub that
// adds, drops or renames something still loads.

struct Dashboard: Decodable {
    var now: Double?
    var tz: String?
    var demo: Bool?
    var mode: String?
    var phase: String?
    var todos: [Todo]?
    var focus: FocusInfo?
    var payit: Feed<PayItData>?
    var mail: Feed<MailData>?
    var calendar: Feed<CalendarData>?
    var weather: Feed<WeatherData>?
    var system: SystemInfo?
    var digest: Digest?
    var recap: Recap?
    var journal: [JournalEntry]?
    var alerts: [HubAlert]?
    var settings: HubConfig?
    var desk: DeskInfo?
    var signedIn: Bool?
    /// The hub has a voice token set, so the Pebble app's webhook can post ring notes to it.
    var voiceReady: Bool?
    /// Claude chats on the Mac, as the Desk Hub Mac app reports them.
    var claude: ClaudeInfo?
}

struct ClaudeInfo: Decodable {
    var chats: [ClaudeChat]?
    var syncedAt: Double?
    /// The Mac has reported in the last 3 minutes.
    var online: Bool?
    /// The Mac is connected, so tapping a chat can open it there.
    var listening: Bool?
}

struct ClaudeChat: Decodable, Identifiable, Equatable {
    enum Kind: Int, Comparable {
        case needs, new, running, read
        static func < (a: Kind, b: Kind) -> Bool { a.rawValue < b.rawValue }
    }

    var id: String
    var title: String
    var project: String?
    /// "needs", "running" or "done".
    var state: String
    /// What it's waiting for, or what it's doing.
    var detail: String?
    /// The last thing Claude said, for finished chats.
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

/// One data source on the hub (PayIt, mail, calendar, weather) and how its last fetch went.
struct Feed<T: Decodable>: Decodable {
    var data: T?
    var error: String?
    var failures: Int?
    var updatedAt: Double?
}

struct Todo: Decodable, Identifiable, Equatable {
    var id: String
    var text: String
    var tag: String?
    var due: Double?
    var star: Bool?
    var done: Bool?
    var suggested: Bool?
    var subtasks: [Subtask]?
    var notes: String?
    var source: TodoSource?

    var isDone: Bool { done == true }
    var isSuggested: Bool { suggested == true }
}

struct Subtask: Decodable, Identifiable, Equatable {
    var id: String
    var text: String
    var done: Bool?
}

struct TodoSource: Decodable, Equatable {
    var from: String?
    var subject: String?
    var why: String?
    var emailId: String?
}

struct FocusInfo: Decodable {
    var todayMinutes: Double?
    var todaySessions: Int?
}

struct PayItData: Decodable {
    var today: PayToday?
    var yesterdaySameTimeCents: Double?
    var profit: Profit?
    var hourly: [Double]?
    var week: [PayDay]?
    var systems: [SystemCheck]?
    var recent: [PayTxn]?
    var subscriptions: SubTotals?
    var subscriptionsError: String?
}

/// PayIt Plus through the App Store: merchants paying now, and what was paid this month
/// (store prices, before Apple's cut).
struct SubTotals: Decodable {
    var paying: Int?
    var paidThisMonth: Int?
    var monthCents: Double?
    var inTrial: Int?
    var billingIssues: Int?
}

/// One of the latest payments: amount, method, status and time (never who paid).
struct PayTxn: Decodable, Identifiable {
    var cents: Double
    var provider: String?
    var status: String?
    var at: String
    var id: String { "\(at)-\(cents)" }
    var when: Date? { Fmt.isoDate(at) }
    var completed: Bool { status == nil || status == "completed" }
}

struct PayToday: Decodable {
    var grossCents: Double?
    var count: Int?
    var declined: Int?
    var refunded: Int?
    var activeMerchants: Int?
    var byProvider: [String: Double]?
    var newBusinesses: Int?
    var avgTicketCents: Double?
}

struct Profit: Decodable {
    var todayCents: Double?
    var weekCents: Double?
}

struct PayDay: Decodable, Identifiable {
    var date: String
    var cents: Double?
    var count: Int?
    var id: String { date }
}

struct SystemCheck: Decodable, Identifiable {
    var system: String
    var status: String
    var detail: String?
    var id: String { system }
    var isUp: Bool { status == "up" }
}

struct MailData: Decodable {
    var aiEnabled: Bool?
    var accounts: [MailAccount]?
}

struct MailAccount: Decodable, Identifiable {
    var id: String
    var name: String
    var unread: Int?
    var error: String?
    var messages: [MailMessage]?
}

struct MailMessage: Decodable, Identifiable, Equatable {
    var id: String
    var from: String?
    var subject: String?
    var date: String?
    var summary: String?
    var priority: String?
    /// customer, person, school, business, automated or marketing: who it's from.
    var kind: String?
    var action: String?

    var isUrgent: Bool { priority == "urgent" }
    var isCustomer: Bool { kind == "customer" }
    var when: Date? { date.flatMap(Fmt.isoDate) }
}

/// GET via POST /api/mail/read: the whole email.
struct MailBody: Decodable {
    var id: String?
    var from: String?
    var fromAddress: String?
    var subject: String?
    var date: String?
    var html: String?
    var text: String?
}

struct CalendarData: Decodable {
    var events: [CalEvent]?
}

struct CalEvent: Decodable, Identifiable {
    var id: String
    var calendar: String?
    var title: String?
    var start: Double
    var end: Double?
    var allDay: Bool?
    var location: String?
    var description: String?
    var organizer: String?
    var myReply: String?

    var endMs: Double { end ?? start }
}

struct WeatherData: Decodable {
    var unit: String?
    var temp: Double?
    var feels: Double?
    var code: Int?
    var isDay: Bool?
    var hi: Double?
    var lo: Double?
    var rainChance: Int?
    var hours: [WeatherHour]?
}

struct WeatherHour: Decodable, Identifiable {
    var time: String
    var temp: Double?
    var code: Int?
    var rain: Int?
    var id: String { time }
}

struct SystemInfo: Decodable {
    var tempC: Double?
    var load: Double?
    var memUsedPct: Double?
    var uptimeH: Double?
    var host: String?
}

struct Digest: Decodable {
    var day: String?
    var headline: String?
    var highlights: [String]?
    var emailCount: Int?
    var taskCount: Int?
}

struct Recap: Decodable {
    var day: String?
    var headline: String?
    var bullets: [String]?
    var tomorrow: [String]?
}

struct JournalEntry: Decodable, Identifiable {
    var id: String
    var at: Double
    var text: String?
    var note: String?
    var kind: String?
    var tasks: [String]?
    var completed: [String]?
    var actions: [JournalAction]?
    var trigger: String?
    var pending: Bool?

    var shown: String { [note, text].compactMap { $0 }.first { !$0.isEmpty } ?? "" }
}

struct JournalAction: Decodable {
    var kind: String?
    var text: String?
}

struct HubAlert: Decodable, Identifiable {
    var id: String
    var level: String?
    var source: String?
    var title: String?
    var body: String?
}

struct HubConfig: Decodable {
    var tags: [String]?
}

struct DeskInfo: Decodable {
    var online: Bool?
    var view: String?
}

/// GET /api/journal/days
struct JournalDays: Decodable {
    var days: [JournalDay]
}

struct JournalDay: Decodable, Identifiable {
    var date: String
    var label: String?
    var summary: String?
    var note: String?
    var focusMinutes: Double?
    var tasksDone: Int?
    var entries: [DayEntry]?
    var id: String { date }
}

struct DayEntry: Decodable, Identifiable {
    var at: Double
    var kind: String?
    var text: String?
    var action: String?
    var id: Double { at }
}

/// Formatting in the hub's time zone, so "today" and "overdue" mean what they mean on the desk.
enum Fmt {
    static var timeZone = TimeZone.current

    private static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        return c
    }

    static func date(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }

    static func isoDate(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    static func time(_ date: Date) -> String {
        let f = DateFormatter()
        f.timeZone = timeZone
        f.dateFormat = "h:mm a"
        return f.string(from: date)
    }

    static func day(_ date: Date, _ format: String = "EEEE, MMMM d") -> String {
        let f = DateFormatter()
        f.timeZone = timeZone
        f.dateFormat = format
        return f.string(from: date)
    }

    static func hour(_ date: Date = Date()) -> Int { calendar.component(.hour, from: date) }

    static func isToday(_ date: Date) -> Bool { calendar.isDate(date, inSameDayAs: Date()) }

    static func dayOffset(_ date: Date) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: Date()), to: calendar.startOfDay(for: date)).day ?? 0
    }

    /// "Overdue" (coral), "Today" (amber), "Tomorrow", or a short date.
    static func due(_ ms: Double?) -> (text: String, color: Color)? {
        guard let ms else { return nil }
        let d = date(ms), offset = dayOffset(d)
        if offset < 0 { return ("Overdue", G.coral) }
        if offset == 0 { return ("Today", G.amber) }
        if offset == 1 { return ("Tomorrow", G.text2) }
        return (day(d, offset < 7 ? "EEE" : "MMM d"), G.text2)
    }

    static func money(_ cents: Double?, exact: Bool = false) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = exact ? 2 : 0
        f.minimumFractionDigits = exact ? 2 : 0
        return f.string(from: NSNumber(value: (cents ?? 0) / 100)) ?? "$0"
    }

    static func provider(_ name: String?) -> String {
        switch name {
        case "stripe": return "Card"
        case "cash": return "Cash"
        case "ath_movil": return "ATH Móvil"
        default: return (name ?? "Payment").replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func ago(_ date: Date) -> String {
        let s = Int(Date().timeIntervalSince(date))
        if s < 60 { return "just now" }
        if s < 3600 { return "\(s / 60)m ago" }
        if s < 86400 { return "\(s / 3600)h ago" }
        return "\(s / 86400)d ago"
    }

    /// SF Symbol for a WMO weather code (the codes Open-Meteo uses).
    static func weatherIcon(_ code: Int?, day: Bool = true) -> String { WeatherSnapshot.symbol(code, day: day) }

    static func weatherWord(_ code: Int?) -> String { WeatherSnapshot.word(code) }
}
