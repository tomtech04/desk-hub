import SwiftUI

/// What the ring's button does: holds record a note, and clicks control the music.
struct RingButtonsView: View {
    @EnvironmentObject private var buttons: RingButtons

    var body: some View {
        Form {
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
                Text("Clicks (control the Music app)")
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
        .task {
            // The permission prompt can only show while the app is open, not during a click that woke it.
            await buttons.prepareAppleMusic()
        }
    }
}
