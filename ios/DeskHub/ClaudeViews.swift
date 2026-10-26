import SwiftUI

// Claude chats on the Mac, as the Desk Hub Mac app reports them to the hub: a board of what's
// going on, a card on Today, and a full-screen moment when a chat finishes or needs you.
// Tapping a chat opens it on the Mac.

enum ClaudeLook {
    /// Each project keeps the same colour here, on the desk and on the Mac.
    static func color(_ project: String?) -> Color {
        let palette: [UInt32] = [0x8AB4FF, 0x6EF0B4, 0xC59CFF, 0xFFB547, 0xFF9DB0, 0x5EE6E6, 0xFF9354, 0xB9E66E]
        var h: UInt32 = 7
        for unit in (project ?? "").utf16 { h = h &* 31 &+ UInt32(unit) }
        return Color(hex: palette[Int(h % UInt32(palette.count))])
    }

    static func tint(_ kind: ClaudeChat.Kind) -> Color {
        switch kind {
        case .needs: return G.amber
        case .new: return G.mint
        case .running: return G.blue
        case .read: return G.muted
        }
    }

    static func symbol(_ chat: ClaudeChat) -> String {
        switch chat.kind {
        case .needs: return "hand.raised.fill"
        case .running: return "ellipsis"
        default: return "checkmark"
        }
    }

    static func line(_ chat: ClaudeChat) -> String {
        switch chat.kind {
        case .needs: return chat.detail ?? "Waiting on you"
        case .running: return chat.detail ?? "Working"
        default: return chat.preview ?? "Finished"
        }
    }

    static func when(_ chat: ClaudeChat) -> String {
        let minutes = Int((Date().timeIntervalSince1970 * 1000 - chat.since) / 60_000)
        let span = minutes < 1 ? nil : minutes < 60 ? "\(minutes)m" : minutes < 1440 ? "\(minutes / 60)h" : "\(minutes / 1440)d"
        if chat.kind == .running { return span.map { "for \($0)" } ?? "just started" }
        return span.map { "\($0) ago" } ?? "just now"
    }
}

/// Shrinks a little under your finger, like system buttons.
struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.25, bounce: 0.3), value: configuration.isPressed)
    }
}

// MARK: - The board

struct ClaudeBoardView: View {
    @EnvironmentObject private var hub: HubStore

    var body: some View {
        let d = hub.dashboard
        let live = d?.claudeLive ?? [], earlier = d?.claudeEarlier ?? []
        let fresh = live.filter { $0.kind == .new }.count
        NavigationStack {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ScreenHeader(title: "Claude") {
                    if fresh > 0 {
                        Button("Mark all read") { Task { await hub.markAllClaudeRead() } }
                            .buttonStyle(GraphiteButton(primary: false))
                    }
                }
                liveLabel(d?.claude)
                if !summary(live).isEmpty {
                    Text(summary(live)).font(.system(size: 17, weight: .medium)).foregroundStyle(G.text2)
                }
                if d == nil {
                    StatusBanner(signingIn: .constant(false))
                    ProgressView().tint(G.text2).frame(maxWidth: .infinity).padding(.top, 60)
                } else if live.isEmpty {
                    quiet(d?.claude)
                } else {
                    ForEach(live) { ClaudeTile(chat: $0) }
                }
                if !earlier.isEmpty {
                    Card {
                        HStack {
                            Text("Earlier").font(.system(size: 17, weight: .semibold)).foregroundStyle(G.title)
                            Spacer()
                            Text("\(earlier.count)").font(G.mono(12)).foregroundStyle(G.muted)
                        }
                        ForEach(earlier.prefix(12)) { ClaudeRow(chat: $0, showPreview: true) }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
            .animation(.spring(duration: 0.45, bounce: 0.2), value: live)
        }
        .refreshable { await hub.refresh() }
        .graphiteRoot()
        }
    }

    private func summary(_ live: [ClaudeChat]) -> String {
        let count = { (k: ClaudeChat.Kind) in live.filter { $0.kind == k }.count }
        return [
            count(.needs) > 0 ? "\(count(.needs)) need\(count(.needs) == 1 ? "s" : "") you" : nil,
            count(.new) > 0 ? "\(count(.new)) new" : nil,
            count(.running) > 0 ? "\(count(.running)) working" : nil,
        ].compactMap { $0 }.joined(separator: " · ")
    }

    private func liveLabel(_ info: ClaudeInfo?) -> some View {
        let (color, text): (Color, String) = info?.syncedAt == nil ? (G.muted, "Waiting for your Mac")
            : info?.online != true ? (G.amber, "Mac away since \(Fmt.time(Fmt.date(info?.syncedAt ?? 0)))")
            : info?.listening == true ? (G.mint, "Live from your Mac") : (G.mint, "Live · taps can't reach your Mac")
        return HStack(spacing: 7) {
            Circle().fill(color).frame(width: 8, height: 8)
                .symbolEffect(.pulse, options: .repeating, isActive: info?.online == true)
            Text(text).font(G.mono(12)).foregroundStyle(G.muted)
        }
    }

    private func quiet(_ info: ClaudeInfo?) -> some View {
        Card {
            VStack(spacing: 10) {
                IconTile(icon: "asterisk", gradient: G.mail, size: 52)
                Text(info?.syncedAt == nil ? "Nothing from your Mac yet" : "All quiet")
                    .font(.system(size: 20, weight: .semibold)).foregroundStyle(G.text)
                Text(info?.syncedAt == nil
                     ? "The Desk Hub app on your Mac sends your Claude chats to the hub whenever it can reach it."
                     : "Nothing is running. Chats you start on your Mac show up here, and anything that finishes or needs you takes over the screen while this app is open.")
                    .font(.system(size: 15)).foregroundStyle(G.text2).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
        }
    }
}

/// One chat as a tile: project in its colour, title, what it's waiting for or doing (or said last).
struct ClaudeTile: View {
    @EnvironmentObject private var hub: HubStore
    let chat: ClaudeChat
    @State private var opening = false

    var body: some View {
        let tint = ClaudeLook.tint(chat.kind), project = ClaudeLook.color(chat.project)
        Button {
            opening = true
            Task {
                await hub.openOnMac(chat)
                try? await Task.sleep(for: .seconds(2))
                opening = false
            }
        } label: {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Text((chat.project ?? "Claude").uppercased())
                        .font(G.mono(11, .medium)).tracking(1.2).foregroundStyle(project).lineLimit(1)
                    Spacer(minLength: 8)
                    Pill(text: chat.kind == .needs ? "Needs you" : chat.kind == .new ? "New" : "Working", color: tint)
                }
                Text(chat.title).font(.system(size: 20, weight: .semibold)).foregroundStyle(G.text)
                    .lineLimit(2).multilineTextAlignment(.leading)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: ClaudeLook.symbol(chat))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(tint)
                        .symbolEffect(.variableColor.iterative, options: .repeating, isActive: chat.kind == .running)
                    Text(ClaudeLook.line(chat))
                        .font(.system(size: 15, weight: chat.kind == .needs ? .medium : .regular))
                        .foregroundStyle(chat.kind == .needs ? G.amber : G.text2)
                        .lineLimit(3).multilineTextAlignment(.leading)
                }
                if chat.kind == .running { WorkingBar() }
                HStack {
                    Text(ClaudeLook.when(chat))
                    Spacer()
                    Text(opening ? "Opening on your Mac…" : "Tap to open on your Mac")
                }
                .font(G.mono(11)).foregroundStyle(G.muted)
            }
            .padding(16)
            .padding(.leading, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 22, style: .continuous).fill(G.panel)
                if chat.kind == .needs || chat.kind == .new {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(LinearGradient(colors: [tint.opacity(0.10), .clear], startPoint: .top, endPoint: .center))
                }
            }
            .overlay(alignment: .leading) { Rectangle().fill(project).frame(width: 5) }
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(chat.kind == .needs || chat.kind == .new ? tint.opacity(0.6) : G.line, lineWidth: chat.kind == .needs ? 1.5 : 1)
            }
            .phaseAnimator(chat.kind == .needs ? [false, true] : [false]) { view, glow in
                view.shadow(color: G.amber.opacity(glow ? 0.35 : 0), radius: glow ? 14 : 0)
            } animation: { _ in .easeInOut(duration: 1.2) }
        }
        .buttonStyle(PressScale())
    }
}

/// A thin bar with a light sweeping across it while a chat works.
struct WorkingBar: View {
    @State private var sweep = false

    var body: some View {
        GeometryReader { geo in
            Capsule().fill(G.track)
                .overlay(alignment: .leading) {
                    Capsule().fill(G.cal).frame(width: geo.size.width * 0.35)
                        .offset(x: sweep ? geo.size.width * 0.65 : 0)
                }
                .clipShape(Capsule())
        }
        .frame(height: 4)
        .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { sweep = true } }
    }
}

/// A chat as a single row (Today's card, and Earlier on the board).
struct ClaudeRow: View {
    let chat: ClaudeChat
    var showPreview = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: ClaudeLook.symbol(chat))
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(ClaudeLook.tint(chat.kind))
                .frame(width: 30, height: 30)
                .background(ClaudeLook.tint(chat.kind).opacity(0.15), in: Circle())
                .symbolEffect(.pulse, options: .repeating, isActive: chat.kind == .needs)
            VStack(alignment: .leading, spacing: 3) {
                Text(chat.title).font(.system(size: 16, weight: .medium))
                    .foregroundStyle(chat.kind == .read ? G.text2 : G.text).lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if let project = chat.project, !project.isEmpty {
                        Text(project).font(G.mono(11)).foregroundStyle(ClaudeLook.color(project)).lineLimit(1)
                    }
                    Text(chat.kind == .read && !showPreview ? "Finished" : ClaudeLook.line(chat))
                        .font(.system(size: 13))
                        .foregroundStyle(chat.kind == .needs ? G.amber : G.text2)
                        .lineLimit(showPreview ? 2 : 1)
                }
            }
            Spacer(minLength: 4)
            if chat.kind == .new {
                Pill(text: "New", color: G.mint)
            } else {
                Text(ClaudeLook.when(chat).replacingOccurrences(of: " ago", with: "").replacingOccurrences(of: "for ", with: ""))
                    .font(G.mono(11)).foregroundStyle(G.muted)
            }
        }
        .padding(.vertical, 4)
    }
}

/// On Today while chats are working, waiting or unread. Tapping it opens the Claude tab.
struct ClaudeTodayCard: View {
    let d: Dashboard

    var body: some View {
        let live = d.claudeLive
        let needs = live.filter { $0.kind == .needs }.count, fresh = live.filter { $0.kind == .new }.count
        Card {
                CardHeader(icon: "asterisk", title: "Claude", gradient: G.mail,
                           meta: needs > 0 ? "\(needs) need\(needs == 1 ? "s" : "") you" : fresh > 0 ? "\(fresh) new" : "\(live.count) working",
                           metaColor: needs > 0 ? G.amber : fresh > 0 ? G.mint : G.muted)
                ForEach(live.prefix(3)) { ClaudeRow(chat: $0) }
                if live.count > 3 {
                    Text("+\(live.count - 3) more").font(G.mono(12)).foregroundStyle(G.muted)
                }
            }
            .overlay {
                if needs > 0 {
                    RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(G.amber.opacity(0.55), lineWidth: 1)
                }
            }
    }
}

// MARK: - Full screen

/// A chat that finished or needs you, full screen. The backdrop dims, a glow blooms, the icon
/// springs in (a check draws itself, a hand waves) with a haptic, then the words rise in one after
/// another. A finished chat steps aside after 12 seconds, with a ring counting down.
struct ClaudeTakeover: View {
    @EnvironmentObject private var hub: HubStore
    let call: ClaudeCall
    @State private var shown = false
    @State private var ripple = false
    @State private var countdown = 1.0

    private var needs: Bool { call.chat.kind == .needs }
    private var accent: Color { needs ? G.amber : G.mint }
    private var accent2: Color { needs ? Color(hex: 0xFF8A3D) : Color(hex: 0x1FB5C9) }

    var body: some View {
        ZStack {
            Color(hex: 0x07080A).ignoresSafeArea()
            RadialGradient(colors: [accent.opacity(needs ? 0.30 : 0.24), .clear], center: UnitPoint(x: 0.5, y: 0.36),
                           startRadius: 0, endRadius: 380)
                .scaleEffect(shown ? 1 : 0.15)
                .opacity(shown ? 1 : 0)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                orb
                    .scaleEffect(shown ? 1 : 0.35)
                    .opacity(shown ? 1 : 0)
                    .animation(.spring(duration: 0.75, bounce: 0.4).delay(0.08), value: shown)
                    .padding(.bottom, 28)
                rise(Text(needs ? "CLAUDE NEEDS YOU" : "CLAUDE IS DONE").font(G.mono(13, .semibold)).tracking(3).foregroundStyle(accent), 0.22)
                rise(Text((call.chat.project ?? "Claude").uppercased()).font(G.mono(12)).tracking(1.4)
                        .foregroundStyle(ClaudeLook.color(call.chat.project)).padding(.top, 14), 0.30)
                rise(Text(call.chat.title).font(.system(size: 34, weight: .bold)).tracking(-0.8)
                        .foregroundStyle(G.text).multilineTextAlignment(.center).lineLimit(3).padding(.top, 6), 0.36)
                rise(Text(ClaudeLook.line(call.chat)).font(.system(size: 17, weight: needs ? .medium : .regular))
                        .foregroundStyle(needs ? Color(hex: 0xFFD08A) : G.text2)
                        .multilineTextAlignment(.center).lineLimit(4).padding(.top, 12), 0.44)
                rise(buttons.padding(.top, 34), 0.54)
                Spacer()
            }
            .padding(.horizontal, 28)
        }
        .onAppear {
            withAnimation(.spring(duration: 0.9, bounce: 0.15)) { shown = true }
            ripple = true
            if !needs { withAnimation(.linear(duration: ClaudeCall.doneSeconds)) { countdown = 0 } }
        }
        .sensoryFeedback(needs ? .warning : .success, trigger: shown)
    }

    private var orb: some View {
        ZStack {
            ForEach(0..<(needs ? 2 : 1), id: \.self) { i in
                Circle().strokeBorder(accent, lineWidth: 2)
                    .frame(width: 136, height: 136)
                    .scaleEffect(ripple ? 1.85 : 1)
                    .opacity(ripple ? 0 : 0.5)
                    .animation(needs ? .easeOut(duration: 2.4).repeatForever(autoreverses: false).delay(0.6 + Double(i) * 1.2)
                                     : .easeOut(duration: 2.4).delay(0.6), value: ripple)
            }
            if !needs {
                Circle().trim(from: 0, to: countdown)
                    .stroke(accent.opacity(0.55), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 180, height: 180)
            }
            Circle()
                .fill(LinearGradient(colors: [accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 136, height: 136)
            symbol
        }
        .frame(width: 190, height: 190)
    }

    @ViewBuilder private var symbol: some View {
        if needs {
            if #available(iOS 18.0, *) {
                Image(systemName: "hand.raised")
                    .font(.system(size: 58, weight: .semibold))
                    .foregroundStyle(G.bg)
                    .symbolEffect(.wiggle, options: .repeat(2), value: shown)
            } else {
                Image(systemName: "hand.raised")
                    .font(.system(size: 58, weight: .semibold))
                    .foregroundStyle(G.bg)
                    .symbolEffect(.bounce, value: shown)
            }
        } else if #available(iOS 26.0, *) {
            if shown {
                Image(systemName: "checkmark")
                    .font(.system(size: 60, weight: .bold))
                    .foregroundStyle(G.bg)
                    .transition(.symbolEffect(.drawOn))
            }
        } else {
            Image(systemName: "checkmark")
                .font(.system(size: 60, weight: .bold))
                .foregroundStyle(G.bg)
                .symbolEffect(.bounce, value: shown)
        }
    }

    private var buttons: some View {
        HStack(spacing: 12) {
            Button {
                Task { await hub.openOnMac(call.chat) }
            } label: {
                Label("Open on Mac", systemImage: "arrow.right")
                    .labelStyle(TrailingIcon())
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(G.bg)
                    .padding(.horizontal, 26)
                    .frame(height: 56)
                    .background(LinearGradient(colors: [accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing), in: Capsule())
            }
            Button {
                hub.later(call)
            } label: {
                Text(needs ? "Later" : "Close")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(G.text)
                    .padding(.horizontal, 24)
                    .frame(height: 56)
                    .background(.white.opacity(0.08), in: Capsule())
            }
        }
        .buttonStyle(PressScale())
    }

    private func rise(_ view: some View, _ delay: Double) -> some View {
        view
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 20)
            .animation(.spring(duration: 0.7, bounce: 0.2).delay(delay), value: shown)
    }
}

private struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.title; configuration.icon }
    }
}
