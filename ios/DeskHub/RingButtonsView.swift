import SwiftUI

/// What the ring's button does: holds record a note, and clicks control the music.
struct RingButtonsView: View {
    @EnvironmentObject private var buttons: RingButtons

    var body: some View {
        Form {
            Section {
                Picker("Music app", selection: $buttons.app) {
                    ForEach(MusicApp.allCases) { Text($0.title).tag($0) }
                }
            } header: {
                Text("Music")
            } footer: {
                Text(buttons.app == .appleMusic
                     ? "Controls the Music app's own player. It can only play what the Music app has queued."
                     : "Controls whichever of your devices Spotify is playing on, through Spotify's web API.")
            }

            if buttons.app == .spotify {
                SpotifySetup(spotify: buttons.spotify)
            }

            Section {
                ForEach(RingClick.allCases) { click in
                    Picker(click.title, selection: Binding(
                        get: { buttons.actions[click] ?? .nothing },
                        set: { buttons.setAction($0, for: click) }
                    )) {
                        ForEach(RingAction.allCases) { Text($0.title).tag($0) }
                    }
                }
            } header: {
                Text("Clicks")
            } footer: {
                Text("Hold the button to record a note; that always goes to the hub. A click can take a second to arrive, since the ring waits to see whether another follows.")
            }

            Section {
                Button("Play / pause") { buttons.run(.playPause) }
                Button("Next track") { buttons.run(.nextTrack) }
                Button("Previous track") { buttons.run(.previousTrack) }
            } header: {
                Text("Try it without the ring")
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if buttons.busy { Text("Working…") }
                    if let result = buttons.lastResult { Text("Last result: \(result)") }
                    if let click = buttons.lastClick { Text("Last click from the ring: \(click)") }
                    else { Text("No click from the ring seen yet.") }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .graphitePage()
        .navigationTitle("Ring buttons")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: buttons.app) { _, app in
            if app == .appleMusic { Task { await buttons.prepareAppleMusic() } }
        }
        .task {
            // The permission prompt can only show while the app is open, not during a click that woke it.
            if buttons.app == .appleMusic { await buttons.prepareAppleMusic() }
        }
    }
}

private struct SpotifySetup: View {
    @ObservedObject var spotify: SpotifyRemote

    var body: some View {
        Section {
            if spotify.connected {
                Label("Spotify connected", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                Button("Disconnect", role: .destructive) { spotify.disconnect() }
            } else {
                TextField("Client ID", text: $spotify.clientId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(.body, design: .monospaced))
                Button(spotify.connecting ? "Connecting…" : "Connect Spotify") { Task { await spotify.connect() } }
                    .disabled(spotify.connecting || spotify.clientId.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let problem = spotify.problem {
                Text(problem).font(.footnote).foregroundStyle(.orange)
            }
        } header: {
            Text("Spotify")
        } footer: {
            if !spotify.connected {
                VStack(alignment: .leading, spacing: 6) {
                    Text("One-time setup, about two minutes:")
                    Text("1. Open developer.spotify.com/dashboard, sign in and create an app (choose the Web API).")
                    Text("2. In its settings add this redirect URI exactly: \(SpotifyRemote.redirectURI)")
                    Text("3. Copy the app's Client ID into the box above and tap Connect.")
                    Text("Spotify only lets Premium accounts control playback, and a new app works only for accounts listed under its User Management, so add your own.")
                    Button("Copy the redirect URI") { UIPasteboard.general.string = SpotifyRemote.redirectURI }
                        .font(.footnote)
                }
            }
        }
    }
}
