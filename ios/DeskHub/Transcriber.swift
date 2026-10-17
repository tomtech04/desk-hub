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

    func transcribe(pcm: Data, sampleRate: Int) async throws -> String {
        let asr = try await manager()
        let buffer = try Self.buffer(pcm: pcm, sampleRate: sampleRate)
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

    /// The ring's 16-bit little-endian PCM as a float buffer; FluidAudio resamples it to 16 kHz.
    private static func buffer(pcm: Data, sampleRate: Int) throws -> AVAudioPCMBuffer {
        let count = pcm.count / 2
        guard count > 0,
              let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(sampleRate), channels: 1, interleaved: false),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)),
              let out = buffer.floatChannelData?[0]
        else { throw TranscriberError.badAudio }
        buffer.frameLength = AVAudioFrameCount(count)
        pcm.withUnsafeBytes { raw in
            for i in 0..<count {
                let sample = Int16(littleEndian: raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self))
                out[i] = Float(sample) / 32768
            }
        }
        return buffer
    }
}

enum TranscriberError: LocalizedError {
    case badAudio
    var errorDescription: String? { "The recording's audio couldn't be read." }
}
