import AVFoundation
import FluidAudio
import Foundation

/// Speech to text on the iPhone with NVIDIA's Parakeet (TDT 0.6B v3), run on the Neural Engine
/// through FluidAudio. The model downloads once (a few hundred MB) and then works offline.
@MainActor
final class Transcriber: ObservableObject {
    enum ModelState: Equatable {
        case notLoaded, downloading(Double), loading, ready, failed(String)
    }

    @Published private(set) var modelState: ModelState = .notLoaded
    private let log: RingLog
    private var engine: AsrManager?
    private var loading: Task<AsrManager, Error>?

    init(log: RingLog) {
        self.log = log
    }

    /// Gets the model ready ahead of the first recording.
    func prepareInBackground() {
        Task { _ = try? await manager() }
    }

    /// The ring's 16-bit little-endian PCM.
    func transcribe(pcm: Data, sampleRate: Int) async throws -> String {
        let count = pcm.count / 2
        var samples = [Float](repeating: 0, count: count)
        pcm.withUnsafeBytes { raw in
            for i in 0..<count {
                samples[i] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self))) / 32768
            }
        }
        return try await transcribe(samples: samples, sampleRate: Double(sampleRate))
    }

    /// Mono float samples at any rate (the phone's microphone); FluidAudio resamples to 16 kHz.
    func transcribe(samples: [Float], sampleRate: Double) async throws -> String {
        let asr = try await manager()
        let buffer = try Self.buffer(samples: samples, sampleRate: sampleRate)
        let layers = await asr.decoderLayerCount
        var decoderState = TdtDecoderState.make(decoderLayers: layers)
        let result = try await asr.transcribe(buffer, decoderState: &decoderState)
        return result.text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func manager() async throws -> AsrManager {
        if let engine { return engine }
        if let loading { return try await loading.value }
        modelState = .downloading(0)
        let task = Task<AsrManager, Error> {
            let models = try await AsrModels.downloadAndLoad(version: .v3, progressHandler: { [weak self] progress in
                Task { @MainActor in self?.modelState = progress.fractionCompleted < 1 ? .downloading(progress.fractionCompleted) : .loading }
            })
            let asr = AsrManager(config: .default)
            try await asr.loadModels(models)
            return asr
        }
        loading = task
        do {
            let asr = try await task.value
            engine = asr
            loading = nil
            modelState = .ready
            log.add("Speech model ready")
            return asr
        } catch {
            loading = nil
            modelState = .failed(error.localizedDescription)
            log.add("Speech model failed to load: \(error.localizedDescription)")
            throw error
        }
    }

    private static func buffer(samples: [Float], sampleRate: Double) throws -> AVAudioPCMBuffer {
        guard !samples.isEmpty,
              let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let out = buffer.floatChannelData?[0]
        else { throw TranscriberError.badAudio }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { src in
            if let base = src.baseAddress { out.update(from: base, count: samples.count) }
        }
        return buffer
    }
}

enum TranscriberError: LocalizedError {
    case badAudio
    var errorDescription: String? { "The recording's audio couldn't be read." }
}
