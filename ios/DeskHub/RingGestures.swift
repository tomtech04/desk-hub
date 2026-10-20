import AuthenticationServices
import Foundation
import MediaPlayer
import UIKit

/// What a click can do. The Pebble app has the same two music actions but leaves them empty on
/// iPhone, since iOS won't let one app press play in another; this goes through Apple Music's own
/// player, or Spotify's web API.
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

enum MusicApp: String, CaseIterable, Identifiable {
    case appleMusic, spotify

    var id: String { rawValue }
    var title: String { self == .appleMusic ? "Apple Music" : "Spotify" }
}

struct RingActionError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// Which click does what, which music app it controls, and the doing of it.
@MainActor
final class RingButtons: ObservableObject {
    @Published var app: MusicApp {
        didSet { UserDefaults.standard.set(app.rawValue, forKey: Key.app) }
    }
    @Published private(set) var actions: [RingClick: RingAction]
    @Published private(set) var lastClick: String?
    @Published private(set) var lastResult: String?
    @Published private(set) var busy = false
    let spotify = SpotifyRemote()
    private let log: RingLog

    private enum Key {
        static let app = "ring.musicApp", actions = "ring.clickActions"
    }

    /// Double click plays and pauses, triple click skips, a single click does nothing so a stray
    /// press can't change the music.
    static let defaults: [RingClick: RingAction] = [.single: .nothing, .double: .playPause, .triple: .nextTrack]

    init(log: RingLog) {
        self.log = log
        let saved = UserDefaults.standard
        app = MusicApp(rawValue: saved.string(forKey: Key.app) ?? "") ?? .spotify
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
        log.add("Ring \(click.title.lowercased()): \(action.title.lowercased()) in \(app.title)")
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
            let result: String
            switch app {
            case .appleMusic: result = try await AppleMusicRemote.perform(action)
            case .spotify: result = try await spotify.perform(action)
            }
            lastResult = result
            log.add("\(app.title): \(result)")
        } catch {
            lastResult = error.localizedDescription
            log.add("\(app.title) failed: \(error.localizedDescription)")
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

/// Spotify through its web API, which can play, pause and skip on whichever of your devices is
/// active, from the background. It needs Spotify Premium and a Spotify developer app (free, made
/// in minutes) whose client ID goes in the app; there's no secret on the phone (PKCE sign-in).
@MainActor
final class SpotifyRemote: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    static let redirectURI = "deskhub://spotify-callback"
    private static let scopes = "user-modify-playback-state user-read-playback-state"

    @Published var clientId: String {
        didSet { UserDefaults.standard.set(clientId.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "spotify.clientId") }
    }
    @Published private(set) var connected: Bool
    @Published private(set) var connecting = false
    @Published private(set) var problem: String?

    private var accessToken: String?
    private var accessExpiry = Date.distantPast
    private var session: ASWebAuthenticationSession?
    private weak var anchor: UIWindow?

    override init() {
        clientId = UserDefaults.standard.string(forKey: "spotify.clientId") ?? ""
        connected = Keychain.get(account: "spotifyRefresh") != nil
        super.init()
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { anchor ?? ASPresentationAnchor() }
    }

    // MARK: Sign-in

    func connect() async {
        let id = clientId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else {
            problem = "Paste your Spotify app's client ID first."
            return
        }
        connecting = true
        problem = nil
        defer { connecting = false }
        do {
            anchor = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
            let verifier = PKCE.makeVerifier()
            let state = PKCE.makeVerifier()
            var parts = URLComponents(string: "https://accounts.spotify.com/authorize")!
            parts.queryItems = [
                URLQueryItem(name: "client_id", value: id),
                URLQueryItem(name: "response_type", value: "code"),
                URLQueryItem(name: "redirect_uri", value: Self.redirectURI),
                URLQueryItem(name: "scope", value: Self.scopes),
                URLQueryItem(name: "code_challenge_method", value: "S256"),
                URLQueryItem(name: "code_challenge", value: PKCE.challenge(for: verifier)),
                URLQueryItem(name: "state", value: state),
            ]
            let callback: URL = try await withCheckedThrowingContinuation { continuation in
                let session = ASWebAuthenticationSession(url: parts.url!, callbackURLScheme: "deskhub") { url, error in
                    if let url { continuation.resume(returning: url) } else {
                        continuation.resume(throwing: error ?? RingActionError("Spotify sign-in didn't finish."))
                    }
                }
                session.presentationContextProvider = self
                self.session = session
                session.start()
            }
            let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            if let denied = items.first(where: { $0.name == "error" })?.value {
                throw RingActionError("Spotify said: \(denied).")
            }
            guard items.first(where: { $0.name == "state" })?.value == state,
                  let code = items.first(where: { $0.name == "code" })?.value else {
                throw RingActionError("Spotify's answer didn't match the request. Try again.")
            }
            try await tokenRequest(["grant_type": "authorization_code", "code": code, "redirect_uri": Self.redirectURI,
                                    "client_id": id, "code_verifier": verifier])
            connected = true
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            problem = nil
        } catch {
            problem = error.localizedDescription
        }
    }

    func disconnect() {
        Keychain.set("", account: "spotifyRefresh")
        accessToken = nil
        accessExpiry = .distantPast
        connected = false
    }

    private struct TokenReply: Decodable {
        var access_token: String
        var expires_in: Int
        var refresh_token: String?
    }

    private func tokenRequest(_ form: [String: String]) async throws {
        var request = URLRequest(url: URL(string: "https://accounts.spotify.com/api/token")!, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        request.httpBody = form.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }
            .joined(separator: "&").data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200, let reply = try? JSONDecoder().decode(TokenReply.self, from: data) else {
            throw RingActionError(Self.message(from: data) ?? "Spotify wouldn't sign in (\(code)). Check the client ID and the redirect URI in its dashboard.")
        }
        accessToken = reply.access_token
        accessExpiry = Date().addingTimeInterval(TimeInterval(reply.expires_in - 60))
        if let refresh = reply.refresh_token { Keychain.set(refresh, account: "spotifyRefresh") }
    }

    private func token() async throws -> String {
        if let accessToken, accessExpiry > Date() { return accessToken }
        guard let refresh = Keychain.get(account: "spotifyRefresh") else {
            connected = false
            throw RingActionError("Connect Spotify first (Ring & voice notes > Ring buttons).")
        }
        try await tokenRequest(["grant_type": "refresh_token", "refresh_token": refresh,
                                "client_id": clientId.trimmingCharacters(in: .whitespacesAndNewlines)])
        guard let accessToken else { throw RingActionError("Spotify didn't give a token.") }
        return accessToken
    }

    // MARK: Playback

    func perform(_ action: RingAction) async throws -> String {
        switch action {
        case .nothing:
            return ""
        case .nextTrack:
            _ = try await send("POST", "me/player/next")
            return "Next track"
        case .previousTrack:
            _ = try await send("POST", "me/player/previous")
            return "Previous track"
        case .playPause:
            let (code, data) = try await call("GET", "me/player")
            if code == 200, let state = try? JSONDecoder().decode(PlayerState.self, from: data) {
                if state.is_playing {
                    _ = try await send("PUT", "me/player/pause")
                    return "Paused"
                }
                _ = try await send("PUT", "me/player/play")
                return "Playing"
            }
            return try await wakeADevice()
        }
    }

    private struct PlayerState: Decodable { var is_playing: Bool }
    private struct Devices: Decodable {
        struct Device: Decodable { var id: String?; var name: String; var type: String }
        var devices: [Device]
    }

    /// Nothing is active, so start playing on the phone (or the first device Spotify knows about).
    private func wakeADevice() async throws -> String {
        let (code, data) = try await call("GET", "me/player/devices")
        guard code == 200, let list = try? JSONDecoder().decode(Devices.self, from: data),
              let device = list.devices.first(where: { $0.type == "Smartphone" && $0.id != nil }) ?? list.devices.first(where: { $0.id != nil }),
              let id = device.id else {
            throw RingActionError("Spotify isn't open on any device. Open it once, then click again.")
        }
        _ = try await send("PUT", "me/player", json: ["device_ids": [id], "play": true])
        return "Playing on \(device.name)"
    }

    private func call(_ method: String, _ path: String, json: [String: Any]? = nil) async throws -> (Int, Data) {
        for attempt in 0..<2 {
            var request = URLRequest(url: URL(string: "https://api.spotify.com/v1/\(path)")!, timeoutInterval: 15)
            request.httpMethod = method
            request.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
            if let json {
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: json)
            } else if method != "GET" {
                request.setValue("0", forHTTPHeaderField: "Content-Length")
            }
            let (data, response) = try await URLSession.shared.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401, attempt == 0 {
                accessToken = nil
                continue
            }
            return (code, data)
        }
        throw RingActionError("Spotify turned the sign-in down. Connect it again.")
    }

    /// A call that has to succeed. Spotify's own explanation is passed on.
    private func send(_ method: String, _ path: String, json: [String: Any]? = nil) async throws -> Data {
        let (code, data) = try await call(method, path, json: json)
        guard (200..<300).contains(code) else {
            switch code {
            case 404: throw RingActionError("Spotify isn't open on any device. Open it once, then click again.")
            case 403: throw RingActionError(Self.message(from: data) ?? "Spotify refused (403). Playback control needs Premium, and your account has to be added under User Management in the Spotify app's dashboard.")
            default: throw RingActionError(Self.message(from: data) ?? "Spotify answered \(code).")
            }
        }
        return data
    }

    /// Spotify explains failures two ways: {"error": {"message": ...}} from the player, and
    /// {"error": "invalid_grant", "error_description": ...} from sign-in.
    private static func message(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let inner = object["error"] as? [String: Any], let message = inner["message"] as? String { return message }
        return object["error_description"] as? String
    }
}
