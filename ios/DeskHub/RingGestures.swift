import Foundation
import MediaPlayer
import UIKit

/// What a click can do. The Pebble app has the same two music actions but leaves them empty on
/// iPhone, since iOS won't let one app press play in another; this goes through Apple Music's own
/// player. Only used when the ring is connected to this app (More > Ring & voice notes).
enum RingAction: String, CaseIterable, Identifiable {
    case nothing, playPause, nextTrack, previousTrack

    var id: String { rawValue }

    var title: String {
        switch self {
        case .nothing: "Nothing"
        case .playPause: "Play / pause"
        case .nextTrack: "Next track"
        case .previousTrack: "Previous track"
        }
    }
}

struct RingActionError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// Which click does what, and the doing of it.
@MainActor
final class RingButtons: ObservableObject {
    @Published private(set) var actions: [RingClick: RingAction]
    @Published private(set) var lastClick: String?
    @Published private(set) var lastResult: String?
    @Published private(set) var busy = false
    private let log: RingLog

    private enum Key {
        static let actions = "ring.clickActions"
    }

    /// Double click plays and pauses, triple click skips, a single click does nothing so a stray
    /// press can't change the music.
    static let defaults: [RingClick: RingAction] = [.single: .nothing, .double: .playPause, .triple: .nextTrack]

    init(log: RingLog) {
        self.log = log
        let saved = UserDefaults.standard
        var map = Self.defaults
        for (click, name) in (saved.dictionary(forKey: Key.actions) as? [String: String]) ?? [:] {
            if let click = RingClick(rawValue: click), let action = RingAction(rawValue: name) { map[click] = action }
        }
        actions = map
    }

    func setAction(_ action: RingAction, for click: RingClick) {
        actions[click] = action
        UserDefaults.standard.set(Dictionary(uniqueKeysWithValues: actions.map { ($0.key.rawValue, $0.value.rawValue) }), forKey: Key.actions)
    }

    /// A gesture from the ring. Holds are recordings and never get here as clicks.
    func handle(sequence: String) {
        guard let click = RingClick(sequence: sequence) else { return }
        let action = actions[click] ?? .nothing
        lastClick = "\(click.title) at \(Date().formatted(date: .omitted, time: .standard))"
        guard action != .nothing else {
            log.add("Ring \(click.title.lowercased()): no action set")
            return
        }
        log.add("Ring \(click.title.lowercased()): \(action.title.lowercased()) in Apple Music")
        run(action)
    }

    /// Runs an action now, also from a click that woke the app in the background.
    func run(_ action: RingAction) {
        let task = UIApplication.shared.beginBackgroundTask(withName: "ring-button") {}
        Task {
            await perform(action)
            UIApplication.shared.endBackgroundTask(task)
        }
    }

    func perform(_ action: RingAction) async {
        busy = true
        defer { busy = false }
        do {
            let result = try await AppleMusicRemote.perform(action)
            lastResult = result
            log.add("Apple Music: \(result)")
        } catch {
            lastResult = error.localizedDescription
            log.add("Apple Music failed: \(error.localizedDescription)")
        }
    }

    /// Asks for Apple Music access the first time it's chosen.
    func prepareAppleMusic() async {
        _ = await AppleMusicRemote.authorize()
    }
}

/// The Music app's own player: it plays, pauses and skips whatever the Music app has queued.
@MainActor
enum AppleMusicRemote {
    static func authorize() async -> Bool {
        switch MPMediaLibrary.authorizationStatus() {
        case .authorized: return true
        case .notDetermined:
            // iOS can't show the prompt from the background, where a ring click may be handled.
            guard UIApplication.shared.applicationState == .active else { return false }
            return await MPMediaLibrary.requestAuthorization() == .authorized
        default: return false
        }
    }

    static func perform(_ action: RingAction) async throws -> String {
        guard await authorize() else {
            throw RingActionError("Allow Desk Hub to use Media & Apple Music in Settings > Desk Hub.")
        }
        let player = MPMusicPlayerController.systemMusicPlayer
        switch action {
        case .nothing:
            return ""
        case .playPause:
            if player.playbackState == .playing {
                player.pause()
                return "Paused"
            }
            player.play()
            try? await Task.sleep(for: .seconds(1))
            guard player.playbackState == .playing else {
                throw RingActionError("The Music app had nothing to play. Start something in it first.")
            }
            return "Playing"
        case .nextTrack:
            player.skipToNextItem()
            return "Next track"
        case .previousTrack:
            player.skipToPreviousItem()
            return "Previous track"
        }
    }
}
