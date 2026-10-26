import SwiftUI

/// The panel that drops down from the menu bar.
struct PanelView: View {
    @Bindable var store: SessionStore
    @State private var showAllDone = false
    @State private var listHeight: CGFloat = 0

    private let doneLimit = 5

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            VStack(alignment: .leading, spacing: 14) {
                header
                if store.chats.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        list(now: context.date)
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { listHeight = $0 }
                    }
                    .scrollIndicators(.never)
                    .scrollBounceBehavior(.basedOnSize)
                    .frame(height: min(listHeight, 520))
                }
                if !store.hookInstalled {
                    hookBanner
                }
            }
            .padding(14)
        }
        .frame(width: 368)
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            store.refresh()
            store.alerter.acknowledge()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didResignKeyNotification)) { _ in
            showAllDone = false
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkle")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.claude)
                .frame(width: 32, height: 32)
                .glassEffect(.regular.tint(Color.claude.opacity(0.18)), in: .circle)

            VStack(alignment: .leading, spacing: 1) {
                Text("Claude")
                    .font(.system(size: 15, weight: .semibold))
                Text(summary)
                    .font(.system(size: 11.5))
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
            }

            Spacer()

            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 6) {
                    iconButton("plus", help: "New chat") { store.newChat() }
                    iconButton("arrow.up.forward.app", help: "Open Claude") { store.openClaude() }
                    iconButton("macwindow", help: "Open Desk Hub") { HubWindow.show() }
                    Menu {
                        AlertsMenu(alerter: store.alerter)
                        Divider()
                        if store.hubSync.isConfigured {
                            HubToggle(hub: store.hubSync)
                        }
                        Toggle("Open at Login", isOn: $store.launchAtLogin)
                        Divider()
                        Button("Open Desk Hub") { HubWindow.show() }
                        Button("Quit Desk Hub") { NSApp.terminate(nil) }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 12, weight: .semibold))
                            .frame(width: 16, height: 16)
                    }
                    .menuStyle(.button)
                    .menuIndicator(.hidden)
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .fixedSize()
                    .help("More")
                }
            }
        }
    }

    private func iconButton(_ symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 16, height: 16)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .help(help)
    }

    private var summary: String {
        var parts: [String] = []
        if !store.needsInput.isEmpty { parts.append("\(store.needsInput.count) need you") }
        if !store.running.isEmpty { parts.append("\(store.running.count) running") }
        if !store.done.isEmpty { parts.append("\(store.done.count) done") }
        return parts.isEmpty ? "No chats open" : parts.joined(separator: " · ")
    }

    // MARK: - List

    /// Unread ones first, so a finished chat you haven't opened is never hidden under "Show more".
    private var doneChats: [Chat] {
        let unread = store.done.filter { store.isUnread($0) }
        let read = store.done.filter { !store.isUnread($0) }
        return unread + read
    }

    private var markAllRead: (String, () -> Void)? {
        guard store.done.contains(where: { store.isUnread($0) }) else { return nil }
        let store = self.store
        return ("Mark All Read", { store.markAllRead() })
    }

    private func list(now: Date) -> some View {
        GlassEffectContainer(spacing: 4) {
            VStack(alignment: .leading, spacing: 14) {
                section("Needs you", tint: .orange, chats: store.needsInput, now: now)
                section("Running", tint: .blue, chats: store.running, now: now)

                let done = doneChats
                let shown = showAllDone ? done : Array(done.prefix(doneLimit))
                section("Done", tint: .green, count: done.count, chats: shown, now: now, action: markAllRead)

                if done.count > doneLimit {
                    Button {
                        withAnimation(.smooth) { showAllDone.toggle() }
                    } label: {
                        Text(showAllDone ? "Show less" : "Show \(done.count - doneLimit) more")
                            .font(.system(size: 11.5, weight: .medium))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.small)
                }
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, tint: Color, count: Int? = nil, chats: [Chat], now: Date,
                         action: (String, () -> Void)? = nil) -> some View {
        if !chats.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text("\(count ?? chats.count)")
                        .font(.system(size: 10, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(tint)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(tint.opacity(0.16), in: .capsule)
                    if let action {
                        Spacer()
                        Button(action.0, action: action.1)
                            .buttonStyle(.plain)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.blue)
                    }
                }
                .padding(.horizontal, 4)

                ForEach(chats) { chat in
                    ChatRow(chat: chat, now: now, isUnread: store.isUnread(chat), store: store)
                }
            }
        }
    }

    // MARK: - Hook

    private var hookBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "bell.badge")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text("See permission prompts too")
                    .font(.system(size: 12, weight: .semibold))
                Text(store.hookError ?? "Adds a small hook to your Claude Code settings. Chats opened after this pick it up.")
                    .font(.system(size: 11))
                    .foregroundStyle(store.hookError == nil ? Color.secondary : Color.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Button("Turn On") { store.installHook() }
                .buttonStyle(.glassProminent)
                .tint(.orange)
                .controlSize(.small)
        }
        .padding(11)
        .glassEffect(.regular.tint(.orange.opacity(0.12)), in: .rect(cornerRadius: 16))
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "bubble.left.and.text.bubble.right")
                .font(.system(size: 26))
                .foregroundStyle(.secondary)
                .padding(.bottom, 2)
            Text("No Claude chats open")
                .font(.system(size: 13, weight: .semibold))
            Text("Chats from the Claude app and the terminal show up here.")
                .font(.system(size: 11.5))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("New Chat") { store.newChat() }
                .buttonStyle(.glassProminent)
                .tint(Color.claude)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
    }
}

// MARK: - Alerts menu

struct AlertsMenu: View {
    @Bindable var alerter: Alerter

    var body: some View {
        Section("Alerts") {
            Toggle("Pop-up on Screen", isOn: $alerter.showToast)
            Toggle("Notification Banner", isOn: $alerter.notify)
            Toggle("Sound", isOn: $alerter.playSound)
            Toggle("Flash Menu Bar Icon", isOn: $alerter.flashIcon)
            Toggle("Also When a Chat Finishes", isOn: $alerter.alertOnDone)
            Picker("Remind Me", selection: $alerter.reminderMinutes) {
                Text("Never").tag(0)
                Text("Every 2 Minutes").tag(2)
                Text("Every 5 Minutes").tag(5)
                Text("Every 10 Minutes").tag(10)
            }
            Button("Send a Test Alert") { alerter.sendTest() }
            Button(alerter.notificationsDenied ? "Notifications Are Off. Turn On…" : "Notification Settings…") {
                alerter.openNotificationSettings()
            }
        }
    }
}

struct HubToggle: View {
    @Bindable var hub: HubSync

    var body: some View {
        Toggle("Show on Desk Hub", isOn: $hub.enabled)
        if hub.enabled, hub.problem != nil {
            Button("Can't Reach Desk Hub. Check Local Network Access…") { hub.openLocalNetworkSettings() }
        }
    }
}

// MARK: - Row

struct ChatRow: View {
    let chat: Chat
    let now: Date
    let isUnread: Bool
    let store: SessionStore

    var body: some View {
        Button { store.open(chat) } label: {
            HStack(spacing: 10) {
                StatusGlyph(state: chat.state)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(chat.title)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        if isUnread {
                            Circle()
                                .fill(.blue)
                                .frame(width: 6, height: 6)
                                .help("New: you haven't opened it yet")
                        }
                        Text(age)
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    detail
                        .font(.system(size: 11.5))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 9)
            .contentShape(.rect(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .glassEffect(glass, in: .rect(cornerRadius: 16))
        .help(chat.preview ?? chat.title)
        .contextMenu {
            Button("Open") { store.open(chat) }
            Button("Show Folder in Finder") { store.revealFolder(chat) }
            Divider()
            if !chat.isDesktop {
                Button("Copy Resume Command") { store.copy("cd \(shellQuoted(chat.cwd)) && claude --resume \(chat.id)") }
            }
            Button("Copy Session ID") { store.copy(chat.id) }
        }
    }

    private var glass: Glass {
        if case .needsInput = chat.state {
            return .regular.tint(.orange.opacity(0.22)).interactive()
        }
        return .regular.interactive()
    }

    private var detail: Text {
        let info: String
        switch chat.state {
        case .needsInput(let reason): info = reason
        case .running: info = chat.activity ?? (chat.isBackground ? "Working in the background" : "Working")
        case .done: info = chat.preview ?? "Finished"
        }
        guard !chat.project.isEmpty else {
            return Text(info).foregroundStyle(.secondary)
        }
        return Text("\(Text(chat.project).foregroundStyle(.tertiary))  \(Text(info).foregroundStyle(.secondary))")
    }

    private var age: String {
        let seconds = max(0, now.timeIntervalSince(chat.since))
        switch seconds {
        case ..<60: return "now"
        case ..<3_600: return "\(Int(seconds / 60))m"
        case ..<86_400: return "\(Int(seconds / 3_600))h"
        default: return "\(Int(seconds / 86_400))d"
        }
    }

    private func shellQuoted(_ path: String) -> String {
        "'" + path.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}

struct StatusGlyph: View {
    let state: ChatState

    var body: some View {
        symbol
            .font(.system(size: 12, weight: .bold))
            .frame(width: 28, height: 28)
            .background(tint.opacity(0.18), in: .circle)
    }

    private var tint: Color {
        switch state {
        case .needsInput: .orange
        case .running: .blue
        case .done: .green
        }
    }

    @ViewBuilder private var symbol: some View {
        switch state {
        case .needsInput:
            Image(systemName: "hand.raised.fill")
                .foregroundStyle(.orange)
                .symbolEffect(.pulse, options: .repeating)
        case .running:
            Image(systemName: "ellipsis")
                .foregroundStyle(.blue)
                .symbolEffect(.variableColor.iterative, options: .repeating)
        case .done:
            Image(systemName: "checkmark")
                .foregroundStyle(.green)
        }
    }
}

extension Color {
    /// Claude's terracotta.
    static let claude = Color(red: 0.85, green: 0.47, blue: 0.34)
}
