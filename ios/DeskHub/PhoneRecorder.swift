import AVFoundation
import Foundation

/// Records from the iPhone's microphone for a journal note. The audio stays on the phone: it's
/// transcribed by Parakeet and only the text goes to the hub.
@MainActor
final class PhoneRecorder: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var startedAt: Date?
    /// 0...1, for the level meter.
    @Published private(set) var level: Float = 0

    private let capture = AudioCapture()

    func start() async throws {
        guard await AVAudioApplication.requestRecordPermission() else { throw RecorderError.denied }
        try capture.start { [weak self] rms in
            Task { @MainActor in self?.level = min(1, rms * 8) }
        }
        isRecording = true
        startedAt = Date()
    }

    /// Stops and hands back what was recorded.
    func stop() -> (samples: [Float], sampleRate: Double) {
        let out = capture.stop()
        isRecording = false
        level = 0
        return out
    }
}

enum RecorderError: LocalizedError {
    case denied
    var errorDescription: String? { "Microphone access is off for Desk Hub. Turn it on in Settings → Desk Hub." }
}

/// The audio engine side, kept off the main actor: the tap runs on a real-time audio thread.
private final class AudioCapture: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private let lock = NSLock()
    private var samples: [Float] = []
    private var sampleRate: Double = 48_000

    func start(onLevel: @escaping @Sendable (Float) -> Void) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default)
        try session.setActive(true)
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        lock.lock()
        samples = []
        sampleRate = format.sampleRate
        lock.unlock()
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self, let channel = buffer.floatChannelData?[0] else { return }
            let chunk = Array(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
            var sum: Float = 0
            for v in chunk { sum += v * v }
            self.lock.lock()
            self.samples.append(contentsOf: chunk)
            self.lock.unlock()
            onLevel(chunk.isEmpty ? 0 : (sum / Float(chunk.count)).squareRoot())
        }
        engine.prepare()
        try engine.start()
    }

    func stop() -> (samples: [Float], sampleRate: Double) {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        lock.lock()
        defer { lock.unlock() }
        let out = (samples, sampleRate)
        samples = []
        return out
    }
}
