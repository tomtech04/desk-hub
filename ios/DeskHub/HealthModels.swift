import Foundation

// A day as the phone sees it in Apple Health, and as it's sent to the hub's /api/health.
// Only these daily figures leave the phone, never raw samples.

struct HealthDay: Codable, Equatable {
    var day: String
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
