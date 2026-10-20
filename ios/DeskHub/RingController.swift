import Foundation
import os
import RingKit

/// The ring as the UI sees it, backed by RingKit's sync loop (Core Devices' Bluetooth library).
@MainActor
final class RingController: ObservableObject {
    @Published fileprivate(set) var status = "Starting"
    @Published fileprivate(set) var pairedId: String?
    @Published fileprivate(set) var firmware: String?
    @Published fileprivate(set) var batteryMilliVolts: Int? {
        didSet { UserDefaults.standard.set(batteryMilliVolts, forKey: Key.battery) }
    }
    /// Recordings the ring has made in its life, including any made with the Pebble app.
    @Published fileprivate(set) var lifetimeRecordings: Int? {
        didSet { UserDefaults.standard.set(lifetimeRecordings, forKey: Key.lifetime) }
    }

    fileprivate let outbox: VoiceOutbox
    fileprivate let log: RingLog
    fileprivate let buttons: RingButtons
    private var ring: IndexRing?

    /// `-ringDemo YES` on launch: a paired ring with a battery reading and no Bluetooth (the simulator screenshots).
    static let demo = UserDefaults.standard.bool(forKey: "ringDemo")

    fileprivate enum Key {
        static let battery = "ring.batteryMilliVolts", lifetime = "ring.lifetimeRecordings"
        static let clipSeconds = "ring.clipSeconds", clipCount = "ring.clipCount"
    }

    init(outbox: VoiceOutbox, log: RingLog, buttons: RingButtons) {
        self.outbox = outbox
        self.log = log
        self.buttons = buttons
        let saved = UserDefaults.standard
        pairedId = saved.string(forKey: "ring.paired")
        batteryMilliVolts = saved.object(forKey: Key.battery) as? Int
        lifetimeRecordings = saved.object(forKey: Key.lifetime) as? Int
        if Self.demo {
            pairedId = "demo"
            status = "Listening for your ring"
            firmware = "3.64.0"
            batteryMilliVolts = 3080
            lifetimeRecordings = 1200
        }
    }

    /// Battery left, as a percentage. The ring's silver-oxide battery can't be charged and the
    /// ring only reports its voltage, which stays almost flat until the battery is nearly done, so
    /// this takes the lower of two estimates: the voltage, and the recording time used so far
    /// against the 12 to 15 hours Pebble rates the ring for.
    var batteryPercent: Int? {
        var estimates: [Double] = []
        if let mv = batteryMilliVolts { estimates.append(Self.percent(milliVolts: mv)) }
        if let count = lifetimeRecordings, count > 0 {
            let saved = UserDefaults.standard
            let clips = saved.double(forKey: Key.clipCount)
            let average = clips > 0 ? saved.double(forKey: Key.clipSeconds) / clips : 5
            estimates.append(100 * (1 - Double(count) * average / (13.5 * 3600)))
        }
        return estimates.min().map { Int(min(100, max(0, $0)).rounded()) }
    }

    /// A silver-oxide cell's discharge curve (two cells in series if the reading is over 2.2 V).
    private static func percent(milliVolts mv: Int) -> Double {
        let cell = Double(mv > 2200 ? mv / 2 : mv) / 1000
        let curve: [(volts: Double, percent: Double)] = [(1.20, 0), (1.30, 3), (1.40, 10), (1.45, 20), (1.50, 60), (1.53, 85), (1.55, 100)]
        guard let upper = curve.firstIndex(where: { $0.volts >= cell }) else { return 100 }
        guard upper > 0 else { return 0 }
        let a = curve[upper - 1], b = curve[upper]
        return a.percent + (cell - a.volts) / (b.volts - a.volts) * (b.percent - a.percent)
    }

    /// Keeps the average length of the ring's clips, for the battery estimate.
    nonisolated fileprivate static func noteClip(seconds: Double) {
        let saved = UserDefaults.standard
        saved.set(saved.double(forKey: Key.clipSeconds) + seconds, forKey: Key.clipSeconds)
        saved.set(saved.double(forKey: Key.clipCount) + 1, forKey: Key.clipCount)
    }

    /// Starts listening for the ring's recordings; safe to call again.
    func start() {
        guard !Self.demo else { return }
        if ring == nil {
            let made = IndexRing(listener: Listener(controller: self))
            ring = made
            pairedId = made.pairedRingId
        }
        ring?.start()
    }

    /// Called once iOS has bonded with the ring.
    func paired(id: String) {
        start()
        ring?.setPairedRing(ringId: id)
        pairedId = ring?.pairedRingId ?? id
        log.add("Paired with ring \(id.prefix(8))")
    }

    /// The library's "restart pre-emptive transfer": unsticks syncing if the ring stops delivering notes.
    func restartSync() {
        start()
        ring?.restartSync()
    }

    func forget() {
        ring?.setPairedRing(ringId: nil)
        pairedId = nil
        firmware = nil
        batteryMilliVolts = nil
        lifetimeRecordings = nil
        UserDefaults.standard.removeObject(forKey: Key.clipSeconds)
        UserDefaults.standard.removeObject(forKey: Key.clipCount)
        log.add("Forgot the ring")
    }
}

/// Receives RingKit's callbacks (on a background thread) and hands them to the main actor.
private final class Listener: NSObject, IndexRingListener {
    weak var controller: RingController?

    init(controller: RingController) {
        self.controller = controller
    }

    func onStatus(text: String) {
        Task { @MainActor [weak self] in self?.controller?.status = text }
    }

    func onRecording(clipId: String, pcm: Data, sampleRate: Int32, recordedAtMs: Int64) {
        // Onto disk before anything else, so nothing is lost if iOS suspends the app right after.
        VoiceOutbox.store(clipId: clipId, pcm: pcm, sampleRate: Int(sampleRate), recordedAt: Date(timeIntervalSince1970: Double(recordedAtMs) / 1000))
        if sampleRate > 0 { RingController.noteClip(seconds: Double(pcm.count / 2) / Double(sampleRate)) }
        Task { @MainActor [weak self] in self?.controller?.outbox.process() }
    }

    func onRingInfo(firmware: String?, batteryMilliVolts: Int32, lifetimeRecordings: Int32) {
        Task { @MainActor [weak self] in
            if let firmware { self?.controller?.firmware = firmware }
            if batteryMilliVolts > 0 { self?.controller?.batteryMilliVolts = Int(batteryMilliVolts) }
            if lifetimeRecordings > 0 { self?.controller?.lifetimeRecordings = Int(lifetimeRecordings) }
        }
    }

    func onLog(line: String) {
        Task { @MainActor [weak self] in self?.controller?.log.add(line) }
    }

    func onButtonGesture(sequence: String) {
        Task { @MainActor [weak self] in self?.controller?.buttons.handle(sequence: sequence) }
    }
}

/// Diagnostic lines from the ring and the outbox, kept on disk so a problem that happened in the
/// background can still be read (and shared) later.
@MainActor
final class RingLog: ObservableObject {
    @Published private(set) var lines: [String] = []
    private let file = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("ring-log.txt")
    private let logger = Logger(subsystem: "deskhub", category: "ring")
    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d HH:mm:ss"
        return f
    }()

    init() {
        if let text = try? String(contentsOf: file, encoding: .utf8) {
            lines = Array(text.split(separator: "\n").map(String.init).suffix(300))
        }
    }

    func add(_ line: String) {
        logger.info("\(line, privacy: .public)")
        lines.append("\(Self.stamp.string(from: Date()))  \(line)")
        if lines.count > 300 { lines.removeFirst(lines.count - 300) }
        try? lines.joined(separator: "\n").write(to: file, atomically: true, encoding: .utf8)
    }
}
