import Foundation
import Network
import UIKit

struct VoiceClip: Codable, Identifiable, Equatable {
    enum State: String, Codable {
        case waiting, transcribing, sending, sent, empty, failed
    }

    let id: String
    let recordedAt: Date
    let sampleRate: Int
    let seconds: Double
    let file: String
    var transcript: String?
    var state: State
    var problem: String?
}

/// Every recording from the ring, on its way to the hub: saved to disk the moment it arrives,
/// transcribed on the phone, then posted to the hub's /api/voice. Anything that fails (no model
/// yet, hub out of reach) waits here and is retried when the network or the app comes back.
@MainActor
final class VoiceOutbox: ObservableObject {
    @Published private(set) var clips: [VoiceClip] = []

    nonisolated static let folder: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Outbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private let settings: HubSettings
    private let transcriber: Transcriber
    private let log: RingLog
    private let monitor = NWPathMonitor()
    private var running = false
    private var again = false
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var index: URL { Self.folder.appendingPathComponent("clips.json") }

    init(settings: HubSettings, transcriber: Transcriber, log: RingLog) {
        self.settings = settings
        self.transcriber = transcriber
        self.log = log
        load()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in self?.process() }
        }
        monitor.start(queue: .global(qos: .utility))
    }

    /// Saves a recording as it arrives. Safe from any thread; the clip's details ride in the file
    /// name so a recording saved just before the app was killed is still picked up.
    nonisolated static func store(clipId: String, pcm: Data, sampleRate: Int, recordedAt: Date) {
        let safeId = String(clipId.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" })
        let url = folder.appendingPathComponent("\(safeId)__\(sampleRate)__\(Int64(recordedAt.timeIntervalSince1970 * 1000)).pcm")
        guard !FileManager.default.fileExists(atPath: url.path) else { return }
        try? pcm.write(to: url, options: .atomic)
    }

    var unsentCount: Int { clips.filter { $0.state != .sent && $0.state != .empty }.count }

    /// Works through everything not yet on the hub. Calling it while it runs queues another pass.
    func process() {
        adoptNewRecordings()
        if running {
            again = true
            return
        }
        guard unsentCount > 0 else { return }
        running = true
        // A recording usually arrives while the app is in the background; ask for time to finish.
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Send voice notes") { [weak self] in
            MainActor.assumeIsolated { self?.endBackgroundTask() }
        }
        Task {
            repeat {
                again = false
                await runPass()
            } while again
            running = false
            endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    func retry(_ id: String) {
        update(id) { $0.state = .waiting; $0.problem = nil }
        process()
    }

    func remove(_ id: String) {
        deleteAudio(id)
        clips.removeAll { $0.id == id }
        save()
    }

    private func runPass() async {
        let pending = clips.filter { $0.state != .sent && $0.state != .empty }.sorted { $0.recordedAt < $1.recordedAt }
        for clip in pending {
            var text = clip.transcript
            if text == nil {
                update(clip.id) { $0.state = .transcribing; $0.problem = nil }
                guard let pcm = try? Data(contentsOf: Self.folder.appendingPathComponent(clip.file)) else {
                    update(clip.id) { $0.state = .failed; $0.problem = "The audio file is missing." }
                    continue
                }
                do {
                    let heard = try await transcriber.transcribe(pcm: pcm, sampleRate: clip.sampleRate)
                    if heard.isEmpty {
                        update(clip.id) { $0.state = .empty; $0.transcript = "" }
                        deleteAudio(clip.id)
                        log.add("Heard nothing in a \(Int(clip.seconds))s recording")
                        continue
                    }
                    update(clip.id) { $0.transcript = heard }
                    text = heard
                } catch {
                    update(clip.id) { $0.state = .failed; $0.problem = "Couldn't transcribe: \(error.localizedDescription)" }
                    continue
                }
            }
            update(clip.id) { $0.state = .sending; $0.problem = nil }
            do {
                try await HubClient.sendNote(text: text ?? "", recordedAt: clip.recordedAt, settings: settings)
                update(clip.id) { $0.state = .sent }
                deleteAudio(clip.id)
                log.add("Sent to the hub: \((text ?? "").prefix(60))")
            } catch {
                update(clip.id) { $0.state = .failed; $0.problem = error.localizedDescription }
                log.add("Couldn't send to the hub: \(error.localizedDescription)")
                return // the hub is out of reach; the rest wait for the next try
            }
        }
    }

    /// Picks up recordings written by `store` that aren't tracked yet.
    private func adoptNewRecordings() {
        let files = (try? FileManager.default.contentsOfDirectory(at: Self.folder, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        var changed = false
        for url in files where url.pathExtension == "pcm" {
            let parts = url.deletingPathExtension().lastPathComponent.components(separatedBy: "__")
            guard parts.count == 3, let rate = Int(parts[1]), rate > 0, let ms = Double(parts[2]) else { continue }
            if let known = clips.first(where: { $0.id == parts[0] }) {
                // The ring sent something already delivered; drop the copy.
                if known.state == .sent || known.state == .empty { try? FileManager.default.removeItem(at: url) }
                continue
            }
            let bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            clips.append(VoiceClip(id: parts[0], recordedAt: Date(timeIntervalSince1970: ms / 1000), sampleRate: rate,
                                   seconds: Double(bytes / 2) / Double(rate), file: url.lastPathComponent, state: .waiting))
            changed = true
        }
        if changed {
            clips.sort { $0.recordedAt > $1.recordedAt }
            save()
        }
    }

    private func update(_ id: String, _ change: (inout VoiceClip) -> Void) {
        guard let i = clips.firstIndex(where: { $0.id == id }) else { return }
        change(&clips[i])
        save()
    }

    private func deleteAudio(_ id: String) {
        guard let clip = clips.first(where: { $0.id == id }) else { return }
        try? FileManager.default.removeItem(at: Self.folder.appendingPathComponent(clip.file))
    }

    private func load() {
        guard let data = try? Data(contentsOf: index), let saved = try? JSONDecoder().decode([VoiceClip].self, from: data) else { return }
        // Anything caught mid-step when the app last stopped starts that step again.
        clips = saved.map { clip in
            var clip = clip
            if clip.state == .transcribing || clip.state == .sending { clip.state = .waiting }
            return clip
        }
    }

    private func save() {
        // Keep everything unsent, and the latest 50 delivered notes for the list.
        let done = clips.filter { $0.state == .sent || $0.state == .empty }
        if done.count > 50 {
            let drop = Set(done.sorted { $0.recordedAt > $1.recordedAt }.dropFirst(50).map(\.id))
            clips.removeAll { drop.contains($0.id) }
        }
        if let data = try? JSONEncoder().encode(clips) { try? data.write(to: index, options: .atomic) }
    }
}

/// Posts to the hub's voice webhook, signed in with the voice token, exactly like the Pebble
/// app's webhook did.
enum HubClient {
    struct HubError: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    @MainActor
    static func sendNote(text: String, recordedAt: Date, settings: HubSettings) async throws {
        try await post(["text": text, "recordedAt": Int64(recordedAt.timeIntervalSince1970 * 1000), "client": "Desk Hub for iPhone"], settings: settings)
    }

    /// Shows a "Ring connected" toast on the hub without adding anything.
    @MainActor
    static func sendTest(settings: HubSettings) async throws {
        try await post(["test": true], settings: settings)
    }

    @MainActor
    private static func post(_ body: [String: Any], settings: HubSettings) async throws {
        guard let base = settings.baseURL else { throw HubError("Add your hub's address on the Ring tab.") }
        let token = settings.voiceToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { throw HubError("Add the hub's voice token on the Ring tab.") }
        var request = URLRequest(url: base.appendingPathComponent("api/voice"), timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        switch code {
        case 200..<300: return
        case 401: throw HubError("The hub turned down the voice token. It has to match HUB_VOICE_TOKEN in the hub's .env.")
        default: throw HubError("The hub answered with an error (\(code)).")
        }
    }
}
