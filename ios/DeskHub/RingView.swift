import SwiftUI

/// The ring, the speech model, and the ring's notes on their way to the hub.
struct RingSettingsView: View {
    @EnvironmentObject private var ring: RingController
    @EnvironmentObject private var outbox: VoiceOutbox
    @EnvironmentObject private var settings: HubSettings
    @EnvironmentObject private var transcriber: Transcriber
    @State private var pairing = false
    @State private var confirmForget = false

    var body: some View {
        Form {
            Section {
                if ring.pairedId != nil {
                    LabeledContent("Status", value: ring.status)
                    if let firmware = ring.firmware { LabeledContent("Firmware", value: firmware) }
                    if let battery = ring.batteryPercent { LabeledContent("Battery", value: "\(battery)%") }
                    NavigationLink("Ring buttons") { RingButtonsView() }
                    Button("Restart ring sync") { ring.restartSync() }
                    Button("Forget this ring", role: .destructive) { confirmForget = true }
                } else {
                    Text("Pair your Index 01 and its voice notes come straight here, get transcribed on this iPhone, and go to the hub. No Pebble app needed.")
                        .foregroundStyle(.secondary)
                    Button("Pair ring") { pairing = true }
                }
            } header: {
                Text("Ring")
            } footer: {
                if ring.pairedId != nil {
                    VStack(alignment: .leading, spacing: 6) {
                        if ring.batteryPercent != nil {
                            Text("Battery is an estimate. It can't be charged; Pebble rates it for 12 to 15 hours of recording, about two years of short notes.")
                        }
                        Text("Ring firmware updates come from Core Devices' server, which only answers to a signed-in Pebble account, so they still go through the Pebble app. Install it when an update is due, then delete it again.")
                    }
                }
            }

            Section {
                modelRow
            } header: {
                Text("Speech to text")
            } footer: {
                Text("Parakeet runs on this iPhone's Neural Engine. Audio never leaves the phone; only the text goes to the hub.")
            }

            Section {
                if outbox.clips.isEmpty {
                    Text("Hold the ring's button, speak, and let go. Each note shows up here and on the hub.")
                        .foregroundStyle(.secondary)
                }
                ForEach(outbox.clips) { clip in
                    ClipRow(clip: clip)
                        .swipeActions {
                            Button("Delete", role: .destructive) { outbox.remove(clip.id) }
                            if clip.state == .failed { Button("Retry") { outbox.retry(clip.id) }.tint(.blue) }
                        }
                }
            } header: {
                Text("Recent notes")
            }

            Section {
                NavigationLink("Ring log") { LogView() }
            }
        }
        .scrollContentBackground(.hidden)
        .graphitePage()
        .navigationTitle("Ring & voice notes")
        .refreshable { outbox.process() }
        .sheet(isPresented: $pairing) { PairSheet() }
        .confirmationDialog("Forget this ring?", isPresented: $confirmForget, titleVisibility: .visible) {
            Button("Forget", role: .destructive) { ring.forget() }
        } message: {
            Text("Recordings stop coming to this app. To pair it with another phone, also forget it in Settings > Bluetooth.")
        }
    }

    @ViewBuilder private var modelRow: some View {
        switch transcriber.modelState {
        case .notLoaded:
            Button("Download Parakeet (once, about 500 MB)") { transcriber.prepareInBackground() }
        case .downloading(let fraction):
            ProgressView(value: fraction) { Text("Downloading Parakeet") }
        case .loading:
            HStack { ProgressView(); Text("Getting Parakeet ready") }
        case .ready:
            Label("Parakeet ready", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 6) {
                Text("Couldn't load Parakeet: \(message)").font(.footnote)
                Button("Try again") { transcriber.prepareInBackground() }
            }
        }
    }
}

private struct ClipRow: View {
    let clip: VoiceClip

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(text)
                .foregroundStyle(clip.transcript?.isEmpty == false ? Color.primary : Color.secondary)
                .lineLimit(4)
            HStack(spacing: 6) {
                Image(systemName: icon).foregroundStyle(tint)
                Text("\(clip.recordedAt.formatted(date: .abbreviated, time: .shortened)) · \(Int(clip.seconds.rounded()))s")
                if let problem = clip.problem { Text("· \(problem)").lineLimit(2) }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private var text: String {
        if let transcript = clip.transcript, !transcript.isEmpty { return transcript }
        switch clip.state {
        case .waiting: return "Waiting to be transcribed"
        case .transcribing: return "Transcribing…"
        case .empty: return "Nothing heard"
        default: return "Not transcribed yet"
        }
    }

    private var icon: String {
        switch clip.state {
        case .sent: return "checkmark.circle.fill"
        case .failed: return "exclamationmark.triangle.fill"
        case .empty: return "speaker.slash"
        default: return "clock"
        }
    }

    private var tint: Color {
        switch clip.state {
        case .sent: return .green
        case .failed: return .orange
        default: return .secondary
        }
    }
}

private struct PairSheet: View {
    @EnvironmentObject private var ring: RingController
    @EnvironmentObject private var transcriber: Transcriber
    @StateObject private var pairer = RingPairer()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Click the ring's button once to wake it. It shows up below within a few seconds. iOS will then ask to pair; tap Pair.")
                    Text("Set up in the Pebble app before? That's fine: it stays paired with this iPhone. Once notes arrive here, delete the Pebble app so the two don't both collect recordings.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section("Nearby") {
                    if pairer.rings.isEmpty {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text(pairer.phase == .waitingForBluetooth ? "Waiting for Bluetooth" : "Looking for your ring")
                        }
                    }
                    ForEach(pairer.rings) { found in
                        Button { pairer.pair(found) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(found.name)
                                    Text(found.pairable ? "Signal \(found.rssi) dBm" : "In recovery mode: the Pebble app has to restore its firmware first")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if pairer.pairingName == found.name { ProgressView() }
                            }
                        }
                        .disabled(!found.pairable || pairer.isBusy)
                    }
                }
                if let message = pairer.failure {
                    Section {
                        Text(message).foregroundStyle(.orange)
                        Button("Look again") { pairer.startScan() }
                    }
                } else if pairer.phase == .idle {
                    Section { Button("Look again") { pairer.startScan() } }
                }
            }
            .navigationTitle("Pair ring")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .onAppear {
                pairer.onPaired = { id in
                    ring.paired(id: id)
                    transcriber.prepareInBackground()
                    dismiss()
                }
                pairer.startScan()
            }
            .onDisappear { pairer.stopScan() }
        }
    }
}

private struct LogView: View {
    @EnvironmentObject private var log: RingLog

    var body: some View {
        ScrollView {
            Text(log.lines.isEmpty ? "Nothing yet." : log.lines.joined(separator: "\n"))
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
        }
        .navigationTitle("Ring log")
        .toolbar { ShareLink(item: log.lines.joined(separator: "\n")) }
    }
}
