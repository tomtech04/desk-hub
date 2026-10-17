import Foundation

// A day as the phone sees it in Apple Health, and as it's sent to the hub's /api/health.
// Only these daily figures leave the phone, never raw samples.

struct HealthDay: Codable, Equatable {
    var day: String
    /// The day in plain words ("More stressed than usual" and a few sentences), for Today and the hub.
    var headline: String?
    var summary: String?
    var stress: StressEstimate?
    var hrv: HRVStat?
    var restingHR: RestingStat?
    var heartRate: HeartStat?
    var steps: Double?
    var activeKcal: Double?
    var exerciseMin: Double?
    var standHours: Double?
    var daylightMin: Double?
    var mindfulMin: Double?
    var moments: [StressMoment] = []
    var workouts: [WorkoutStat] = []
    var checkins: [CheckIn] = []

    mutating func retell() {
        headline = HealthStory.headline(self)
        summary = HealthStory.summary(self)
    }
}

/// The day told in a few sentences rather than numbers; the numbers stay on the Health page.
enum HealthStory {
    static func headline(_ day: HealthDay) -> String {
        guard let stress = day.stress else { return day.checkins.isEmpty ? "No watch data yet" : "You checked in" }
        switch stress.label {
        case "calm": return "A calm day"
        case "elevated": return "More stressed than usual"
        case "high": return "A stressful day"
        default: return "A normal day for you"
        }
    }

    static func summary(_ day: HealthDay) -> String {
        guard day.stress != nil || !day.checkins.isEmpty else { return "Wear your Apple Watch and this fills in through the day." }
        var out: [String] = []
        if !day.moments.isEmpty {
            out.append("Your heart rate was up while you were sitting still around \(list(day.moments.prefix(3).map { Fmt.time($0.date) })).")
        } else if let label = day.stress?.label, label == "elevated" || label == "high" {
            out.append("Your body showed more strain than usual.")
        }
        if let c = day.checkins.last { out.append(checkin(c)) }
        if let move = moving(day) { out.append(move) }
        if day.stress?.learning == true { out.append("It's still learning what's normal for you.") }
        return out.joined(separator: " ")
    }

    private static func checkin(_ c: CheckIn) -> String {
        let mood = CheckIn.moods.indices.contains(c.mood) ? CheckIn.moods[c.mood].lowercased() : "okay"
        var s = "At \(Fmt.time(c.date)) you said you felt \(c.feelings.isEmpty ? mood : list(c.feelings.map { $0.lowercased() }))"
        if !c.about.isEmpty { s += ", mostly about \(list(c.about.map { $0 == "PayIt" ? $0 : $0.lowercased() }))" }
        if c.energy <= 2 { s += ", and low on energy" }
        return s + "."
    }

    private static func moving(_ day: HealthDay) -> String? {
        let names = ["Walking": "walk", "Running": "run", "Cycling": "ride", "Hiking": "hike", "Swimming": "swim", "Yoga": "yoga session",
                     "Dance": "dance session", "Strength": "strength workout", "HIIT": "HIIT workout"]
        if !day.workouts.isEmpty {
            let done = day.workouts.prefix(3).map { w -> String in
                let kind = names[w.type] ?? "workout"
                return "\(article(w.minutes)) \(w.minutes)-minute \(kind)"
            }
            return "You got in \(list(done))."
        }
        guard let steps = day.steps else { return nil }
        if steps >= 10_000 { return "Plenty of moving today." }
        if steps < 2_500, Calendar.current.component(.hour, from: Date()) >= 17 { return "Not much moving today." }
        return nil
    }

    /// "an 8-minute walk", "a 32-minute walk".
    private static func article(_ n: Int) -> String {
        String(n).hasPrefix("8") || n == 11 || n == 18 ? "an" : "a"
    }

    private static func list(_ items: [String]) -> String {
        guard let last = items.last, items.count > 1 else { return items.first ?? "" }
        return items.dropLast().joined(separator: ", ") + " and " + last
    }
}

/// 0–100 against the person's own usual: lower heart-rate variability, a higher resting heart
/// rate, and time with a raised heart rate while still all push it up. An estimate, not a diagnosis.
struct StressEstimate: Codable, Equatable {
    var score: Int
    var label: String
    var basis: String
    var learning: Bool
}

struct HRVStat: Codable, Equatable {
    var avg: Double
    var usual: Double?
    var samples: Int
}

struct RestingStat: Codable, Equatable {
    var today: Double?
    var usual: Double?
}

struct HeartStat: Codable, Equatable {
    var avg: Double
    var max: Double
}

/// A stretch where heart rate stayed well above resting while not moving.
struct StressMoment: Codable, Equatable, Identifiable {
    var start: Double
    var minutes: Int
    var bpm: Int
    var id: Double { start }
    var date: Date { Date(timeIntervalSince1970: start / 1000) }
}

struct WorkoutStat: Codable, Equatable, Identifiable {
    var type: String
    var start: Double
    var minutes: Int
    var kcal: Int?
    var id: Double { start }
}

/// How the person said they felt. Mood is Apple's State of Mind scale (1 very unpleasant … 7 very
/// pleasant); stress and energy are 1–5.
struct CheckIn: Codable, Equatable, Identifiable {
    var at: Double
    var mood: Int
    var stress: Int
    var energy: Int
    var feelings: [String]
    var about: [String]
    var note: String
    var id: Double { at }
    var date: Date { Date(timeIntervalSince1970: at / 1000) }

    static let moods = ["", "Very unpleasant", "Unpleasant", "Slightly unpleasant", "Neutral", "Slightly pleasant", "Pleasant", "Very pleasant"]
    static let stressWords = ["", "None", "Low", "Some", "High", "Very high"]
    static let energyWords = ["", "Empty", "Low", "Okay", "Good", "Great"]
    static let feelingChoices = ["Calm", "Content", "Happy", "Grateful", "Excited", "Proud", "Stressed", "Anxious", "Overwhelmed", "Frustrated", "Drained", "Sad"]
    static let aboutChoices = ["Work", "School", "PayIt", "Family", "Friends", "Partner", "Health", "Fitness", "Money", "Self care"]
}

/// One hour of the day for the charts: average heart rate and steps.
struct HourPoint: Identifiable, Equatable {
    var hour: Int
    var bpm: Double?
    var steps: Double
    var id: Int { hour }
}
