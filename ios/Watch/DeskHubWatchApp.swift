import SwiftUI
import WatchKit

/// Desk Hub on the wrist: Claude, PayIt today, and a study timer. Turn the Digital Crown to move
/// between them.
@main
struct DeskHubWatchApp: App {
    @StateObject private var store = WatchStore()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            TabView {
                ClaudePage()
                PayItPage()
                StudyPage()
            }
            .tabViewStyle(.verticalPage)
            .environmentObject(store)
            .onChange(of: phase) { _, now in
                if now == .active { store.start() } else if now == .background { store.stop() }
            }
            .onAppear { store.start() }
        }
    }
}

enum W {
    static let amber = Color(red: 1, green: 0.71, blue: 0.28)
    static let mint = Color(red: 0.43, green: 0.94, blue: 0.71)
    static let blue = Color(red: 0.54, green: 0.71, blue: 1)
    static let coral = Color(red: 1, green: 0.48, blue: 0.48)
    static let violet = Color(red: 0.77, green: 0.61, blue: 1)

    /// Each project keeps its colour, the same as on the desk, the phone and the Mac.
    static func project(_ name: String?) -> Color {
        let palette: [(Double, Double, Double)] = [(0.54, 0.71, 1), (0.43, 0.94, 0.71), (0.77, 0.61, 1), (1, 0.71, 0.28),
                                                   (1, 0.62, 0.69), (0.37, 0.90, 0.90), (1, 0.58, 0.33), (0.73, 0.90, 0.43)]
        var h: UInt32 = 7
        for unit in (name ?? "").utf16 { h = h &* 31 &+ UInt32(unit) }
        let c = palette[Int(h % UInt32(palette.count))]
        return Color(red: c.0, green: c.1, blue: c.2)
    }

    static func tint(_ kind: WatchData.Chat.Kind) -> Color {
        switch kind {
        case .needs: return amber
        case .new: return mint
        case .running: return blue
        case .read: return .secondary
        }
    }

    static func money(_ cents: Double?) -> String {
        let value = (cents ?? 0) / 100
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = value < 100 ? 2 : 0
        return f.string(from: NSNumber(value: value)) ?? "$0"
    }

    static func ago(_ ms: Double) -> String {
        let m = Int((Date().timeIntervalSince1970 * 1000 - ms) / 60_000)
        return m < 1 ? "now" : m < 60 ? "\(m)m" : m < 1440 ? "\(m / 60)h" : "\(m / 1440)d"
    }
}

// MARK: - Claude

struct ClaudePage: View {
    @EnvironmentObject private var store: WatchStore

    var body: some View {
        let live = store.data?.live ?? []
        NavigationStack {
            List {
                if let problem = store.problem, store.data == nil {
                    Text(problem).font(.footnote).foregroundStyle(.secondary)
                } else if store.data == nil {
                    ProgressView()
                } else if store.data?.claude?.online != true {
                    Text("Your Mac isn't reporting right now.").font(.footnote).foregroundStyle(.secondary)
                } else if live.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("All quiet").font(.headline)
                        Text("Nothing is running on your Mac.").font(.footnote).foregroundStyle(.secondary)
                    }
                } else {
                    ForEach(live) { chat in
                        NavigationLink { ChatDetail(chat: chat) } label: { ChatRow(chat: chat) }
                            .listItemTint(chat.kind == .needs ? W.amber.opacity(0.25) : nil)
                    }
                }
            }
            .navigationTitle("Claude")
        }
        .containerBackground(LinearGradient(colors: [W.violet.opacity(0.45), .clear], startPoint: .top, endPoint: .bottom), for: .tabView)
    }
}

struct ChatRow: View {
    let chat: WatchData.Chat

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Image(systemName: chat.kind == .needs ? "hand.raised.fill" : chat.kind == .new ? "checkmark" : "ellipsis")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(W.tint(chat.kind))
                    .symbolEffect(.pulse, options: .repeating, isActive: chat.kind != .new)
                Text(chat.project ?? "Claude").font(.system(size: 11, design: .monospaced)).foregroundStyle(W.project(chat.project)).lineLimit(1)
                Spacer(minLength: 2)
                Text(chat.kind == .new ? "New" : W.ago(chat.since)).font(.system(size: 11, design: .monospaced)).foregroundStyle(chat.kind == .new ? W.mint : .secondary)
            }
            Text(chat.title).font(.system(size: 15, weight: .semibold)).lineLimit(2)
            Text(chat.kind == .needs ? chat.detail ?? "Needs you" : chat.kind == .running ? chat.detail ?? "Working" : chat.preview ?? "Finished")
                .font(.system(size: 13))
                .foregroundStyle(chat.kind == .needs ? W.amber : .secondary)
                .lineLimit(2)
        }
        .padding(.vertical, 2)
    }
}

struct ChatDetail: View {
    @EnvironmentObject private var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    let chat: WatchData.Chat
    @State private var result: String?
    @State private var working = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text((chat.project ?? "Claude").uppercased()).font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundStyle(W.project(chat.project))
                Text(chat.title).font(.system(size: 17, weight: .bold))
                Text(chat.kind == .needs ? chat.detail ?? "Needs you" : chat.kind == .running ? chat.detail ?? "Working" : chat.preview ?? "Finished")
                    .font(.system(size: 14))
                    .foregroundStyle(chat.kind == .needs ? W.amber : .secondary)
                Button {
                    working = true
                    Task {
                        let ok = await store.openOnMac(chat)
                        working = false
                        result = ok ? "Opened on your Mac" : "Your Mac didn't pick that up"
                        WKInterfaceDevice.current().play(ok ? .success : .failure)
                        if ok { try? await Task.sleep(for: .seconds(1)); dismiss() }
                    }
                } label: {
                    Label(working ? "Opening…" : "Open on Mac", systemImage: "macbook")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glassProminent)
                .tint(W.tint(chat.kind))
                .padding(.top, 4)
                if chat.kind == .new {
                    Button("Mark read") { Task { await store.markRead(chat); dismiss() } }
                        .buttonStyle(.glass)
                }
                if let result { Text(result).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}

// MARK: - PayIt

struct PayItPage: View {
    @EnvironmentObject private var store: WatchStore

    var body: some View {
        let p = store.data?.payit
        VStack(alignment: .leading, spacing: 6) {
            Text("PayIt today").font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
            if let p {
                Text(W.money(p.grossCents))
                    .font(.system(size: 38, weight: .semibold, design: .rounded))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .contentTransition(.numericText())
                if let y = p.yesterdaySameTimeCents, y > 0 {
                    let delta = Int((((p.grossCents ?? 0) - y) / y * 100).rounded())
                    Text("\(delta >= 0 ? "▲" : "▼") \(abs(delta))% vs yesterday")
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundStyle(delta >= 0 ? W.mint : W.coral)
                }
                HStack(spacing: 14) {
                    stat("\(p.count ?? 0)", "sales", .primary)
                    stat("\(p.declined ?? 0)", "declined", (p.declined ?? 0) > 0 ? W.amber : .primary)
                    if let profit = p.profitCents { stat(W.money(profit), "profit", W.mint) }
                }
                .padding(.top, 4)
                Spacer(minLength: 0)
                let down = p.down ?? 0, degraded = p.degraded ?? 0
                HStack(spacing: 6) {
                    Circle().fill(down > 0 ? W.coral : degraded > 0 ? W.amber : W.mint).frame(width: 7, height: 7)
                    Text(down > 0 ? "\(down) system\(down == 1 ? "" : "s") down" : degraded > 0 ? "\(degraded) degraded" : "All systems up")
                        .font(.system(size: 12, design: .monospaced)).foregroundStyle(.secondary)
                }
            } else if let problem = store.problem {
                Text(problem).font(.footnote).foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, 4)
        .containerBackground(LinearGradient(colors: [Color(red: 0.05, green: 0.5, blue: 0.45).opacity(0.7), .clear], startPoint: .top, endPoint: .bottom), for: .tabView)
    }

    private func stat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).font(.system(size: 17, weight: .semibold, design: .rounded)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary)
        }
    }
}

// MARK: - Study

struct StudyPage: View {
    @EnvironmentObject private var store: WatchStore
    @State private var onDesk = false

    var body: some View {
        Group {
            if let s = store.study { running(s) } else { picker }
        }
        .containerBackground(LinearGradient(colors: [Color(red: 1, green: 0.55, blue: 0.2).opacity(0.5), .clear], startPoint: .top, endPoint: .bottom), for: .tabView)
    }

    private var picker: some View {
        let f = store.data?.focus
        let usual = f?.focusMinutes ?? 25
        let presets = Array(Set([usual, 25, 50])).sorted()
        return ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Study").font(.system(size: 17, weight: .bold))
                    Spacer()
                    Text("\(Int(f?.todayMinutes ?? 0)) min today").font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                }
                if let t = f?.desk?.timer, t.running == true || t.remaining != nil { deskTimer(t) }
                HStack(spacing: 6) {
                    ForEach(presets, id: \.self) { m in
                        Button { store.startStudy(minutes: m, isBreak: false, onDesk: onDesk) } label: {
                            VStack(spacing: 0) {
                                Text("\(m)").font(.system(size: 20, weight: .semibold, design: .rounded))
                                Text("min").font(.system(size: 10)).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glass)
                    }
                }
                Button { store.startStudy(minutes: f?.shortBreak ?? 5, isBreak: true, onDesk: false) } label: {
                    Label("\(f?.shortBreak ?? 5) min break", systemImage: "cup.and.saucer.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                if f?.desk?.online == true {
                    Toggle("On the desk too", isOn: $onDesk).font(.system(size: 14))
                }
            }
        }
    }

    private func running(_ s: StudySession) -> some View {
        VStack(spacing: 8) {
            ZStack {
                if let left = s.pausedLeft {
                    Circle().trim(from: 0, to: left / (Double(s.minutes) * 60))
                        .stroke(W.amber.opacity(0.6), style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 0) {
                        Text(Duration.seconds(left).formatted(.time(pattern: .minuteSecond)))
                            .font(.system(size: 30, weight: .semibold, design: .rounded)).monospacedDigit()
                        Text("Paused").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                } else {
                    ProgressView(timerInterval: s.startedAt...s.endsAt, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                        .progressViewStyle(.circular)
                        .tint(s.isBreak ? W.blue : W.amber)
                        .scaleEffect(2.4)
                        .opacity(0.9)
                    VStack(spacing: 0) {
                        Text(timerInterval: s.startedAt...s.endsAt, countsDown: true)
                            .font(.system(size: 30, weight: .semibold, design: .rounded)).monospacedDigit()
                            .multilineTextAlignment(.center)
                        Text(s.isBreak ? "Break" : s.onDesk ? "Study · on desk" : "Study").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxHeight: .infinity)
            HStack(spacing: 6) {
                if s.pausedLeft == nil {
                    Button { store.pauseStudy() } label: { Image(systemName: "pause.fill").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                } else {
                    Button { store.resumeStudy() } label: { Image(systemName: "play.fill").frame(maxWidth: .infinity) }
                        .buttonStyle(.glassProminent).tint(W.amber)
                }
                Button { store.endStudy() } label: { Image(systemName: "stop.fill").frame(maxWidth: .infinity) }
                    .buttonStyle(.glass)
            }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in store.checkStudy() }
    }

    private func deskTimer(_ t: WatchData.DeskTimer) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "desktopcomputer").foregroundStyle(W.amber)
            if t.running == true, let end = t.endsAt {
                Text(timerInterval: Date()...Date(timeIntervalSince1970: end / 1000), countsDown: true)
                    .font(.system(size: 13, design: .monospaced)).monospacedDigit()
            } else {
                Text("Paused").font(.system(size: 13, design: .monospaced))
            }
            Spacer()
            Button { Task { await store.pauseDesk(t.running == true ? "pause" : "resume") } } label: {
                Image(systemName: t.running == true ? "pause.fill" : "play.fill")
            }
            .buttonStyle(.glass)
            .frame(width: 38)
        }
        .font(.system(size: 13))
    }
}
