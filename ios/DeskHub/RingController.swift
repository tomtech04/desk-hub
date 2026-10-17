import Foundation
import os
import RingKit

/// The ring as the UI sees it, backed by RingKit's sync loop (Core Devices' Bluetooth library).
@MainActor
final class RingController: ObservableObject {
    @Published fileprivate(set) var status = "Starting"
    @Published fileprivate(set) var pairedId: String?
    @Published fileprivate(set) var firmware: String?
    @Published fileprivate(set) var batteryMilliVolts: Int?

    fileprivate let outbox: VoiceOutbox
    fileprivate let log: RingLog
    private var ring: IndexRing?

    init(outbox: VoiceOutbox, log: RingLog) {
        self.outbox = outbox
        self.log = log
        pairedId = UserDefaults.standard.string(forKey: "ring.paired")
    }

    /// Starts listening for the ring's recordings; safe to call again.
    func start() {
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
        ring?.setPairedRing(id: id)
        pairedId = id
        log.add("Paired with ring \(id.prefix(8))")
    }

    func forget() {
        ring?.setPairedRing(id: nil)
        pairedId = nil
        firmware = nil
        batteryMilliVolts = nil
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
        Task { @MainActor [weak self] in self?.controller?.outbox.process() }
    }

    func onRingInfo(firmware: String?, batteryMilliVolts: Int32) {
        Task { @MainActor [weak self] in
            if let firmware { self?.controller?.firmware = firmware }
            if batteryMilliVolts > 0 { self?.controller?.batteryMilliVolts = Int(batteryMilliVolts) }
        }
    }

    func onLog(line: String) {
        Task { @MainActor [weak self] in self?.controller?.log.add(line) }
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
