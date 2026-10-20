import Foundation
import HealthKit
import UIKit
import UserNotifications

/// Watches the day through Apple Health (what the Apple Watch records), estimates stress against
/// the person's own usual, keeps their check-ins, and sends the day to the hub. iOS wakes the app
/// when the watch syncs new heart data, so this keeps going in the background.
@MainActor
final class HealthMonitor: ObservableObject {
    enum Status: Equatable {
        case off, connecting, ready, unavailable, demo
        case failed(String)
    }

    @Published private(set) var status: Status = .off
    @Published private(set) var today: HealthDay?
    @Published private(set) var hours: [HourPoint] = []
    @Published private(set) var sentAt: Date?
    @Published private(set) var sendProblem: String?
    @Published var checkinOn: Bool {
        didSet { defaults.set(checkinOn, forKey: Key.checkinOn); scheduleCheckin() }
    }
    /// Minutes after midnight for the evening check-in.
    @Published var checkinMinutes: Int {
        didSet { defaults.set(checkinMinutes, forKey: Key.checkinMinutes); scheduleCheckin() }
    }
    /// True when notifications are switched off for the app, so no reminder can show up.
    @Published private(set) var notificationsOff = false
    @Published var nudges: Bool {
        didSet { defaults.set(nudges, forKey: Key.nudges) }
    }

    /// `-healthDemo YES` on launch: sample data, no Health access (the simulator screenshots).
    static let demo = UserDefaults.standard.bool(forKey: "healthDemo")

    private enum Key {
        static let enabled = "health.enabled", checkinOn = "health.checkinOn", checkinMinutes = "health.checkinMinutes"
        static let nudges = "health.nudges", checkins = "health.checkins", nudged = "health.nudged"
    }

    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private let hub: HubStore
    private let log: RingLog
    private var observing = false
    private var refreshing = false
    private var lastSent: HealthDay?

    init(hub: HubStore, log: RingLog) {
        self.hub = hub
        self.log = log
        let saved = UserDefaults.standard
        checkinOn = saved.object(forKey: Key.checkinOn) as? Bool ?? true
        checkinMinutes = saved.object(forKey: Key.checkinMinutes) as? Int ?? 18 * 60
        nudges = saved.object(forKey: Key.nudges) as? Bool ?? true
        if Self.demo {
            status = .demo
            today = HealthDemo.day()
            hours = HealthDemo.hours()
        }
    }

    var connected: Bool { status == .ready || status == .demo }

    // MARK: Connecting

    /// At launch, including when iOS wakes the app for new Health data.
    func start() {
        guard !Self.demo else { return }
        let key = HealthReader.dayKey(Date())
        if !checkins(on: key).isEmpty {
            var day = HealthDay(day: key)
            day.checkins = checkins(on: key)
            day.retell()
            today = day
        }
        ensureReminder()
        guard defaults.bool(forKey: Key.enabled) else { return }
        guard HKHealthStore.isHealthDataAvailable() else { status = .unavailable; return }
        status = .ready
        observe()
        Task { await refresh() }
    }

    func connect() async {
        guard !Self.demo else { return }
        guard HKHealthStore.isHealthDataAvailable() else { status = .unavailable; return }
        status = .connecting
        do {
            try await store.requestAuthorization(toShare: Self.shareTypes, read: Self.readTypes)
            defaults.set(true, forKey: Key.enabled)
            status = .ready
            log.add("Connected to Apple Health")
            observe()
            ensureReminder()
            await refresh(force: true)
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    func disconnect() {
        defaults.set(false, forKey: Key.enabled)
        status = .off
        today = nil
        hours = []
        store.disableAllBackgroundDelivery { _, _ in }
        log.add("Disconnected from Apple Health")
    }

    private static var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKQuantityType(.heartRate), HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned), HKQuantityType(.appleExerciseTime),
            HKQuantityType(.timeInDaylight), HKCategoryType(.appleStandHour), HKCategoryType(.mindfulSession),
            HKObjectType.workoutType(),
        ]
        if #available(iOS 18.0, *) { types.insert(HKObjectType.stateOfMindType()) }
        return types
    }

    /// Check-ins are also saved to Health as State of Mind (iOS 18 and later).
    private static var shareTypes: Set<HKSampleType> {
        if #available(iOS 18.0, *) { return [HKSampleType.stateOfMindType()] }
        return []
    }

    /// New heart data from the watch wakes the app (HRV right away; heart rate and steps hourly at most).
    private func observe() {
        guard !observing else { return }
        observing = true
        let watched: [(HKQuantityTypeIdentifier, HKUpdateFrequency)] = [(.heartRateVariabilitySDNN, .immediate), (.heartRate, .hourly), (.stepCount, .hourly)]
        for (id, frequency) in watched {
            let type = HKQuantityType(id)
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, done, error in
                guard error == nil else { done(); return }
                Task { @MainActor in
                    await self?.refresh(nudge: true)
                    done()
                }
            }
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: frequency) { _, _ in }
        }
    }

    // MARK: Reading the day

    func refresh(force: Bool = false, nudge: Bool = false) async {
        guard status == .ready, !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            let (read, hourly) = try await HealthReader(store: store).read(start: Calendar.current.startOfDay(for: Date()), now: Date())
            var day = read
            day.checkins = checkins(on: day.day)
            day.retell()
            today = day
            hours = hourly
            if nudge, nudges { nudgeIfStressed(day) }
            await send(day, force: force)
        } catch {
            log.add("Couldn't read Apple Health: \(error.localizedDescription)")
        }
    }

    /// Sends the day if it changed, at most every 10 minutes unless forced (a check-in).
    private func send(_ day: HealthDay, force: Bool) async {
        if !force, day == lastSent { return }
        if !force, let sentAt, Date().timeIntervalSince(sentAt) < 600 { return }
        guard let json = try? JSONEncoder().encode(day) else { return }
        sendProblem = await hub.postHealth(json)
        if sendProblem == nil {
            sentAt = Date()
            lastSent = day
        } else {
            log.add("Couldn't send health to the hub: \(sendProblem ?? "")")
        }
    }

    // MARK: Check-ins

    func checkins(on day: String) -> [CheckIn] {
        let all = (try? JSONDecoder().decode([String: [CheckIn]].self, from: defaults.data(forKey: Key.checkins) ?? Data())) ?? [:]
        return all[day] ?? []
    }

    /// Saves a check-in on the phone, in Health as State of Mind, and on the hub (its note is filed
    /// like a voice note there).
    func add(_ checkin: CheckIn, evening: Bool) async {
        let key = HealthReader.dayKey(Date())
        var all = (try? JSONDecoder().decode([String: [CheckIn]].self, from: defaults.data(forKey: Key.checkins) ?? Data())) ?? [:]
        all[key, default: []].append(checkin)
        for k in all.keys.sorted().dropLast(14) { all.removeValue(forKey: k) }
        defaults.set(try? JSONEncoder().encode(all), forKey: Key.checkins)

        var day = today ?? HealthDay(day: key)
        if day.day != key { day = HealthDay(day: key) }
        day.checkins = all[key] ?? []
        day.retell()
        today = day
        if status == .ready { await saveStateOfMind(checkin, evening: evening) }
        guard !Self.demo else { return }
        await send(day, force: true)
    }

    private func saveStateOfMind(_ c: CheckIn, evening: Bool) async {
        guard #available(iOS 18.0, *) else { return }
        let labels: [String: HKStateOfMind.Label] = [
            "Calm": .calm, "Content": .content, "Happy": .happy, "Grateful": .grateful, "Excited": .excited, "Proud": .proud,
            "Stressed": .stressed, "Anxious": .anxious, "Overwhelmed": .overwhelmed, "Frustrated": .frustrated, "Drained": .drained, "Sad": .sad,
        ]
        let about: [String: HKStateOfMind.Association] = [
            "Work": .work, "School": .education, "PayIt": .work, "Family": .family, "Friends": .friends, "Partner": .partner,
            "Health": .health, "Fitness": .fitness, "Money": .money, "Self care": .selfCare,
        ]
        let sample = HKStateOfMind(
            date: c.date, kind: evening ? .dailyMood : .momentaryEmotion, valence: Double(c.mood - 4) / 3,
            labels: c.feelings.compactMap { labels[$0] }, associations: Array(Set(c.about.compactMap { about[$0] })), metadata: nil)
        do { try await store.save(sample) } catch { log.add("Couldn't save the check-in to Health: \(error.localizedDescription)") }
    }

    // MARK: Notifications

    /// Makes sure the evening reminder is set up, asking for notification permission the first time
    /// the app is open. It doesn't need Apple Health: a check-in works without it.
    func ensureReminder() {
        guard !Self.demo else { return }
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined, checkinOn, UIApplication.shared.applicationState == .active {
                _ = try? await center.requestAuthorization(options: [.alert, .sound])
            }
            let now = await center.notificationSettings().authorizationStatus
            notificationsOff = now == .denied
            if notificationsOff, checkinOn { log.add("Notifications are off for Desk Hub, so there's no evening reminder") }
            scheduleCheckin()
        }
    }

    /// The evening check-in reminder, every day at the chosen time (6 PM unless changed).
    func scheduleCheckin() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["checkin"])
        guard checkinOn, !Self.demo else { return }
        let content = UNMutableNotificationContent()
        content.title = "How was today?"
        content.body = "Tap to say how it went, or tap it in. Takes a minute."
        content.sound = .default
        var when = DateComponents()
        when.hour = checkinMinutes / 60
        when.minute = checkinMinutes % 60
        center.add(UNNotificationRequest(identifier: "checkin", content: content, trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: true)))
        let at = Calendar.current.date(from: when).map { $0.formatted(date: .omitted, time: .shortened) } ?? "the chosen time"
        log.add("Evening check-in reminder set for \(at) every day")
    }

    /// A gentle question when a stretch of raised heart rate while still has just ended:
    /// at most twice a day, three hours apart, and once per stretch.
    private func nudgeIfStressed(_ day: HealthDay) {
        guard let moment = day.moments.last else { return }
        let end = moment.date.addingTimeInterval(Double(moment.minutes) * 60)
        guard Date().timeIntervalSince(end) < 30 * 60 else { return }
        var sent = (defaults.array(forKey: Key.nudged) as? [Double]) ?? []
        sent = sent.filter { Date().timeIntervalSince1970 * 1000 - $0 < 86_400_000 }
        guard !sent.contains(moment.start), sent.count < 2,
              (sent.max().map { moment.start - $0 > 3 * 3_600_000 } ?? true) else { return }
        defaults.set(sent + [moment.start], forKey: Key.nudged)
        let content = UNMutableNotificationContent()
        content.title = "How are you doing?"
        content.body = "Your heart rate was up for \(moment.minutes) minutes while you were sitting still. Want to check in?"
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "nudge-\(Int(moment.start))", content: content, trigger: nil))
        log.add("Asked for a check-in after \(moment.minutes) min of raised heart rate")
    }
}

// MARK: - Reading Apple Health

struct HealthReader {
    let store: HKHealthStore

    private static let bpm = HKUnit.count().unitDivided(by: .minute())
    private static let ms = HKUnit.secondUnit(with: .milli)

    static func dayKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    func read(start: Date, now: Date) async throws -> (HealthDay, [HourPoint]) {
        let today = HKQuery.predicateForSamples(withStart: start, end: now)
        let past = HKQuery.predicateForSamples(withStart: start.addingTimeInterval(-30 * 86_400), end: start)

        async let steps = sum(.stepCount, .count(), today)
        async let kcal = sum(.activeEnergyBurned, .kilocalorie(), today)
        async let exercise = sum(.appleExerciseTime, .minute(), today)
        async let daylight = sum(.timeInDaylight, .minute(), today)
        async let heart = samples(.heartRate, today)
        async let hrv = samples(.heartRateVariabilitySDNN, today)
        async let resting = samples(.restingHeartRate, today)
        async let stepSamples = samples(.stepCount, today)
        async let hrvPast = samples(.heartRateVariabilitySDNN, past)
        async let restingPast = samples(.restingHeartRate, past)
        async let workouts = workouts(today)
        async let stand = categories(.appleStandHour, today)
        async let mindful = categories(.mindfulSession, today)

        let heartPoints = try await heart.map { (date: $0.startDate, bpm: $0.quantity.doubleValue(for: Self.bpm)) }
        let hrvToday = try await hrv.map { $0.quantity.doubleValue(for: Self.ms) }
        let hrvUsual = try await hrvPast.map { $0.quantity.doubleValue(for: Self.ms) }
        let restingToday = try await resting.last?.quantity.doubleValue(for: Self.bpm)
        let restingUsual = try await restingPast.map { $0.quantity.doubleValue(for: Self.bpm) }
        let moving = try await stepSamples.map { (start: $0.startDate, end: $0.endDate, steps: $0.quantity.doubleValue(for: .count())) }
        let sessions = try await workouts

        let (stress, moments) = StressModel.estimate(
            hrvToday: hrvToday, hrvPast: hrvUsual, restingToday: restingToday, restingPast: restingUsual,
            heart: heartPoints, steps: moving, workouts: sessions.map { ($0.startDate, $0.endDate) })

        var day = HealthDay(day: Self.dayKey(start))
        day.stress = stress
        day.moments = moments
        if !hrvToday.isEmpty {
            day.hrv = HRVStat(avg: StressModel.mean(hrvToday), usual: hrvUsual.count >= 5 ? StressModel.median(hrvUsual) : nil, samples: hrvToday.count)
        }
        if restingToday != nil || !restingUsual.isEmpty {
            day.restingHR = RestingStat(today: restingToday, usual: restingUsual.count >= 5 ? StressModel.median(restingUsual) : nil)
        }
        if !heartPoints.isEmpty {
            day.heartRate = HeartStat(avg: StressModel.mean(heartPoints.map(\.bpm)), max: heartPoints.map(\.bpm).max() ?? 0)
        }
        day.steps = try await steps
        day.activeKcal = try await kcal
        day.exerciseMin = try await exercise
        day.daylightMin = try await daylight
        let stoodHours = try await stand.filter { $0.value == HKCategoryValueAppleStandHour.stood.rawValue }.count
        day.standHours = Double(stoodHours)
        let mindfulMinutes: Double = try await mindful.reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) / 60 }
        day.mindfulMin = mindfulMinutes
        day.workouts = sessions.map { w in
            WorkoutStat(type: Self.name(w.workoutActivityType), start: w.startDate.timeIntervalSince1970 * 1000, minutes: Int(w.duration / 60),
                        kcal: w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity().map { Int($0.doubleValue(for: .kilocalorie())) })
        }

        // Average heart rate and steps per hour, for the charts.
        let calendar = Calendar.current
        var hourly: [HourPoint] = (0...calendar.component(.hour, from: now)).map { HourPoint(hour: $0, bpm: nil, steps: 0) }
        for h in hourly.indices {
            let inHour = heartPoints.filter { calendar.component(.hour, from: $0.date) == h }.map(\.bpm)
            if !inHour.isEmpty { hourly[h].bpm = StressModel.mean(inHour) }
            hourly[h].steps = moving.filter { calendar.component(.hour, from: $0.start) == h }.reduce(0) { $0 + $1.steps }
        }
        return (day, hourly)
    }

    private func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ predicate: NSPredicate) async throws -> Double? {
        let query = HKStatisticsQueryDescriptor(predicate: .quantitySample(type: HKQuantityType(id), predicate: predicate), options: .cumulativeSum)
        return try await query.result(for: store)?.sumQuantity()?.doubleValue(for: unit)
    }

    private func samples(_ id: HKQuantityTypeIdentifier, _ predicate: NSPredicate) async throws -> [HKQuantitySample] {
        let query = HKSampleQueryDescriptor(predicates: [.quantitySample(type: HKQuantityType(id), predicate: predicate)], sortDescriptors: [SortDescriptor(\.startDate)])
        return try await query.result(for: store)
    }

    private func categories(_ id: HKCategoryTypeIdentifier, _ predicate: NSPredicate) async throws -> [HKCategorySample] {
        let query = HKSampleQueryDescriptor(predicates: [.categorySample(type: HKCategoryType(id), predicate: predicate)], sortDescriptors: [SortDescriptor(\.startDate)])
        return try await query.result(for: store)
    }

    private func workouts(_ predicate: NSPredicate) async throws -> [HKWorkout] {
        let query = HKSampleQueryDescriptor(predicates: [.workout(predicate)], sortDescriptors: [SortDescriptor(\.startDate)])
        return try await query.result(for: store)
    }

    private static func name(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .walking: return "Walking"
        case .running: return "Running"
        case .cycling: return "Cycling"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "Strength"
        case .highIntensityIntervalTraining: return "HIIT"
        case .yoga: return "Yoga"
        case .swimming: return "Swimming"
        case .hiking: return "Hiking"
        case .elliptical: return "Elliptical"
        case .soccer: return "Soccer"
        case .basketball: return "Basketball"
        case .tennis: return "Tennis"
        case .socialDance, .cardioDance: return "Dance"
        default: return "Workout"
        }
    }
}

// MARK: - The estimate

/// A simple, explainable stress estimate. Apple doesn't give apps a stress number, so this compares
/// today with the last 30 days: heart-rate variability (HRV) tends to drop under stress, resting
/// heart rate tends to rise, and a heart rate well above resting while sitting still is a sign too.
enum StressModel {
    static func estimate(hrvToday: [Double], hrvPast: [Double], restingToday: Double?, restingPast: [Double],
                         heart: [(date: Date, bpm: Double)], steps: [(start: Date, end: Date, steps: Double)],
                         workouts: [(Date, Date)]) -> (StressEstimate?, [StressMoment]) {
        let resting = restingToday ?? (restingPast.count >= 5 ? median(restingPast) : nil) ?? 62
        let moments = raisedWhileStill(heart: heart, resting: resting, steps: steps, workouts: workouts)
        let raisedMinutes = moments.reduce(0) { $0 + $1.minutes }
        guard !hrvToday.isEmpty || !heart.isEmpty else { return (nil, moments) }

        var score = 50.0
        var why: [String] = []
        let learning = hrvPast.count < 5
        if !hrvToday.isEmpty {
            let now = mean(hrvToday)
            if !learning {
                let usual = median(hrvPast)
                score += 12 * clamp((usual - now) / max(spread(hrvPast), 5), -2, 2)
                why.append("HRV \(Int(now.rounded())) ms vs your usual \(Int(usual.rounded()))")
            } else {
                why.append("HRV \(Int(now.rounded())) ms (still learning your usual)")
            }
        }
        if let today = restingToday, restingPast.count >= 5 {
            let usual = median(restingPast)
            score += 8 * clamp((today - usual) / 4, -2, 2)
            why.append("resting heart rate \(Int(today.rounded())) vs \(Int(usual.rounded()))")
        }
        score += 10 * min(Double(raisedMinutes) / 45, 2)
        why.append(raisedMinutes > 0 ? "\(raisedMinutes) min of raised heart rate while still" : "no stretches of raised heart rate while still")
        let value = Int(clamp(score, 0, 100).rounded())
        let label = value >= 75 ? "high" : value >= 60 ? "elevated" : value < 35 ? "calm" : "typical"
        let basis = why.joined(separator: ", ")
        return (StressEstimate(score: value, label: label, basis: basis.prefix(1).uppercased() + basis.dropFirst(), learning: learning), moments)
    }

    /// Heart rate at least 25 bpm over resting for 10+ minutes, with almost no steps and no workout.
    static func raisedWhileStill(heart: [(date: Date, bpm: Double)], resting: Double, steps: [(start: Date, end: Date, steps: Double)],
                                 workouts: [(Date, Date)]) -> [StressMoment] {
        func still(_ t: Date) -> Bool {
            if workouts.contains(where: { $0.0 <= t && t <= $0.1 }) { return false }
            let near = steps.filter { $0.end >= t.addingTimeInterval(-300) && $0.start <= t.addingTimeInterval(300) }.reduce(0) { $0 + $1.steps }
            return near < 80
        }
        var out: [StressMoment] = []
        var run: [(date: Date, bpm: Double)] = []
        func close() {
            if let first = run.first, let last = run.last {
                let minutes = Int(last.date.timeIntervalSince(first.date) / 60) + 5
                if run.count >= 2, minutes >= 10 {
                    out.append(StressMoment(start: first.date.timeIntervalSince1970 * 1000, minutes: minutes, bpm: Int(mean(run.map(\.bpm)).rounded())))
                }
            }
            run = []
        }
        for point in heart {
            if point.bpm >= resting + 25, still(point.date) {
                if let last = run.last, point.date.timeIntervalSince(last.date) > 12 * 60 { close() }
                run.append(point)
            } else {
                close()
            }
        }
        close()
        return out
    }

    static func mean(_ xs: [Double]) -> Double { xs.isEmpty ? 0 : xs.reduce(0, +) / Double(xs.count) }

    static func median(_ xs: [Double]) -> Double {
        let s = xs.sorted()
        guard !s.isEmpty else { return 0 }
        return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2
    }

    /// How much this person's values usually vary (interquartile range as a standard deviation).
    static func spread(_ xs: [Double]) -> Double {
        let s = xs.sorted()
        guard s.count >= 4 else { return 10 }
        return (s[s.count * 3 / 4] - s[s.count / 4]) / 1.35
    }

    static func clamp(_ x: Double, _ lo: Double, _ hi: Double) -> Double { min(hi, max(lo, x)) }
}

// MARK: - Demo data (simulator screenshots)

enum HealthDemo {
    static func at(_ hour: Int, _ minute: Int = 0) -> Double {
        (Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()).timeIntervalSince1970 * 1000
    }

    static func day() -> HealthDay {
        var d = HealthDay(day: HealthReader.dayKey(Date()))
        d.stress = StressEstimate(score: 62, label: "elevated", basis: "HRV 38 ms vs your usual 52, resting heart rate 64 vs 60, 40 min of raised heart rate while still", learning: false)
        d.hrv = HRVStat(avg: 38, usual: 52, samples: 5)
        d.restingHR = RestingStat(today: 64, usual: 60)
        d.heartRate = HeartStat(avg: 78, max: 141)
        d.steps = 8423
        d.activeKcal = 512
        d.exerciseMin = 34
        d.standHours = 9
        d.daylightMin = 46
        d.mindfulMin = 5
        d.moments = [StressMoment(start: at(14, 10), minutes: 25, bpm: 98), StressMoment(start: at(16, 40), minutes: 15, bpm: 94)]
        d.workouts = [WorkoutStat(type: "Walking", start: at(12, 5), minutes: 32, kcal: 160)]
        d.checkins = [CheckIn(at: at(17, 30), mood: 3, stress: 4, energy: 2, feelings: ["Stressed", "Drained"], about: ["School", "PayIt"], note: "")]
        d.retell()
        return d
    }

    static func hours() -> [HourPoint] {
        let bpm: [Double] = [0, 0, 0, 0, 0, 0, 0, 66, 72, 74, 70, 76, 104, 82, 97, 79, 92, 84, 76, 72, 70, 68, 66, 64]
        let steps: [Double] = [0, 0, 0, 0, 0, 0, 0, 420, 900, 310, 260, 540, 2900, 380, 120, 260, 90, 610, 450, 380, 260, 120, 60, 20]
        let now = Calendar.current.component(.hour, from: Date())
        return (0...now).map { HourPoint(hour: $0, bpm: bpm[$0] > 0 ? bpm[$0] : nil, steps: steps[$0]) }
    }
}
