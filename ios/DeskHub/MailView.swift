import SwiftUI
import WebKit

/// What matters in your inbox: Claude's digest and each unread email in one line, with what to
/// do about it. Mail is never marked read or sent from here.
struct MailView: View {
    @EnvironmentObject private var hub: HubStore
    @State private var open: MailMessage?
    @State private var opened = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    ScreenHeader("Mail")
                    if let d = hub.dashboard {
                        digest(d)
                        if let error = d.mail?.error {
                            Card { Text(error).font(.system(size: 14)).foregroundStyle(G.coral) }
                        }
                        ForEach(d.mail?.data?.accounts ?? []) { account in
                            AccountCard(account: account, open: $open)
                        }
                    } else {
                        StatusBanner(signingIn: .constant(false))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            }
            .refreshable { await hub.refresh() }
            .graphiteRoot()
            .sheet(item: $open) { MailDetailSheet(message: $0) }
            .onAppear(perform: openIfAsked)
            .onChange(of: hub.updatedAt) { _, _ in openIfAsked() }
        }
    }

    /// `-openMail p1` on launch, for the simulator screenshots.
    private func openIfAsked() {
        guard !opened, let id = UserDefaults.standard.string(forKey: "openMail"),
              let message = hub.dashboard?.allMail.first(where: { $0.id == id }) else { return }
        opened = true
        open = message
    }

    @ViewBuilder private func digest(_ d: Dashboard) -> some View {
        Card(outline: G.aiMail) {
            CardHeader(icon: "sparkles", title: "Digest", gradient: G.mail, meta: d.digest?.emailCount.map { "\($0) emails" })
            if let headline = d.digest?.headline {
                Text(headline).font(.system(size: 17, weight: .medium)).foregroundStyle(G.text).fixedSize(horizontal: false, vertical: true)
                ForEach(Array((d.digest?.highlights ?? []).enumerated()), id: \.offset) { _, line in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Circle().fill(G.violet).frame(width: 5, height: 5).offset(y: -2)
                        Text(line).font(.system(size: 14)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                Text("Claude writes a digest of the last day of mail each morning.").font(.system(size: 14)).foregroundStyle(G.text2)
                Button("Write it now") { Task { await hub.runDigest() } }.buttonStyle(GraphiteButton(primary: false))
            }
        }
    }
}

struct AccountCard: View {
    let account: MailAccount
    @Binding var open: MailMessage?

    private var messages: [MailMessage] {
        // Urgent, then customers, then the rest by priority; newest first within each.
        func rank(_ m: MailMessage) -> Int {
            if m.priority == "urgent" { return 0 }
            if m.isCustomer { return 1 }
            return m.priority == "low" ? 3 : 2
        }
        return (account.messages ?? []).sorted {
            rank($0) != rank($1) ? rank($0) < rank($1) : ($0.when ?? .distantPast) > ($1.when ?? .distantPast)
        }
    }

    var body: some View {
        Card {
            CardHeader(icon: "tray.full.fill", title: account.name, gradient: G.mail, meta: account.unread.map { "\($0) unread" })
            if let error = account.error {
                Text(error).font(.system(size: 13)).foregroundStyle(G.coral)
            }
            if messages.isEmpty, account.error == nil {
                Text("All caught up.").font(.system(size: 14)).foregroundStyle(G.text2)
            }
            ForEach(messages) { message in
                Button { open = message } label: { MailRow(message: message) }.buttonStyle(.plain)
                if message.id != messages.last?.id { Divider().overlay(G.lineSoft) }
            }
        }
    }
}

struct MailRow: View {
    let message: MailMessage

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle().fill(dot).frame(width: 8, height: 8).padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(message.from ?? "Unknown").font(.system(size: 15, weight: .semibold)).foregroundStyle(G.text).lineLimit(1)
                    if message.isCustomer {
                        Text("CUSTOMER").font(G.mono(9)).foregroundStyle(G.mint)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(G.mint.opacity(0.14), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                    Spacer(minLength: 6)
                    if let when = message.when {
                        Text(Fmt.isToday(when) ? Fmt.time(when) : Fmt.day(when, "MMM d")).font(G.mono(11)).foregroundStyle(G.muted)
                    }
                }
                Text(message.summary ?? message.subject ?? "").font(.system(size: 14)).foregroundStyle(G.text2).lineLimit(2)
                if let action = message.action, !action.isEmpty {
                    Label(action, systemImage: "arrow.turn.down.right").font(.system(size: 13, weight: .medium)).foregroundStyle(G.violet).lineLimit(1)
                }
            }
        }
        .contentShape(Rectangle())
    }

    private var dot: Color {
        switch message.priority {
        case "urgent": return G.coral
        case "low": return Color(hex: 0x3A404B)
        default: return G.blue
        }
    }
}

// MARK: Sheets

struct MailDetailSheet: View {
    @EnvironmentObject private var hub: HubStore
    @Environment(\.dismiss) private var dismiss
    let message: MailMessage
    @State private var full: MailBody?
    @State private var loading = false
    @State private var showOriginal = false
    @State private var note: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(message.subject ?? "(no subject)").font(.system(size: 22, weight: .semibold)).foregroundStyle(G.text)
                        Text([message.from, message.when.map { Fmt.day($0, "EEE MMM d, h:mm a") }].compactMap { $0 }.joined(separator: " · "))
                            .font(G.mono(12)).foregroundStyle(G.muted)
                    }
                    Card(outline: G.aiMail) {
                        CardHeader(icon: "sparkles", title: "In short", gradient: G.mail, meta: message.isUrgent ? "URGENT" : nil, metaColor: G.coral)
                        Text(message.summary ?? "No summary yet.").font(.system(size: 16)).foregroundStyle(G.text).fixedSize(horizontal: false, vertical: true)
                        if let action = message.action, !action.isEmpty {
                            Label(action, systemImage: "arrow.turn.down.right").font(.system(size: 15, weight: .medium)).foregroundStyle(G.violet)
                        }
                    }
                    if let note { Text(note).font(.system(size: 14)).foregroundStyle(G.mint) }
                    HStack(spacing: 10) {
                        Button { makeTask() } label: { Label("Make it a task", systemImage: "plus.circle.fill") }.buttonStyle(GraphiteButton())
                        Button { done() } label: { Label("Done", systemImage: "checkmark") }.buttonStyle(GraphiteButton(primary: false))
                    }
                    Card {
                        CardHeader(icon: "doc.text", title: "The email", gradient: G.white)
                        if let full {
                            Text(full.text ?? "").font(.system(size: 14)).foregroundStyle(G.text2).textSelection(.enabled)
                            if let html = full.html, !html.isEmpty {
                                Button("See it as it was sent") { showOriginal = true }.buttonStyle(GraphiteButton(primary: false))
                            }
                        } else if loading {
                            ProgressView().tint(G.text2)
                        } else {
                            Button("Read the whole email") { load() }.buttonStyle(GraphiteButton(primary: false))
                        }
                    }
                }
                .padding(16)
            }
            .graphitePage()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } } }
            .sheet(isPresented: $showOriginal) {
                NavigationStack {
                    EmailWebView(html: full?.html ?? "")
                        .ignoresSafeArea(edges: .bottom)
                        .navigationTitle(message.from ?? "Email")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { showOriginal = false } } }
                }
            }
        }
    }

    private func load() {
        loading = true
        Task {
            full = try? await hub.readMail(message.id)
            if full == nil { note = "Couldn't open the email right now." }
            loading = false
        }
    }

    private func makeTask() {
        note = "Claude is reading it and writing the task…"
        Task {
            note = await hub.makeTask(fromMail: message.id) ? "Added to your tasks." : (hub.problem ?? "That didn't work.")
        }
    }

    private func done() {
        Task { await hub.hideMail(message.id) }
        dismiss()
    }
}

/// An email's own HTML with scripts off; links open in Safari.
struct EmailWebView: UIViewRepresentable {
    let html: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.loadHTMLString("""
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline' http: https:; font-src http: https: data:">
        <style>html{background:#fff;color:#111;font:16px/1.5 -apple-system,sans-serif}body{margin:14px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>
        </head><body>\(html)</body></html>
        """, baseURL: nil)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            if action.navigationType == .linkActivated, let url = action.request.url {
                _ = await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }
    }
}

struct EventSheet: View {
    @Environment(\.dismiss) private var dismiss
    let event: CalEvent

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(event.title ?? "Event").font(.system(size: 24, weight: .semibold)).foregroundStyle(G.text)
                    Card {
                        row("clock", when)
                        if let location = event.location, !location.isEmpty { row("mappin.and.ellipse", location) }
                        if let calendar = event.calendar { row("calendar", calendar) }
                        if let organizer = event.organizer, !organizer.isEmpty { row("person", organizer) }
                        if let reply = event.myReply, !reply.isEmpty { row("checkmark.circle", "You replied: \(reply)") }
                    }
                    if let description = event.description, !description.isEmpty {
                        Card {
                            Text(description).font(.system(size: 15)).foregroundStyle(G.text2).textSelection(.enabled)
                        }
                    }
                }
                .padding(16)
            }
            .graphitePage()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private var when: String {
        let start = Fmt.date(event.start)
        if event.allDay == true { return Fmt.day(start, "EEEE, MMMM d") + " · all day" }
        let end = Fmt.date(event.endMs)
        return Fmt.day(start, "EEEE, MMMM d") + " · " + Fmt.time(start) + (event.endMs > event.start ? " – " + Fmt.time(end) : "")
    }

    private func row(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon).foregroundStyle(G.blue).frame(width: 20)
            Text(text).font(.system(size: 15)).foregroundStyle(G.text)
        }
    }
}

struct SignInSheet: View {
    @EnvironmentObject private var hub: HubStore
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Your hub's password is HUB_PASSWORD in the Pi's .env. You stay signed in for 30 days.")
                    .font(.system(size: 15)).foregroundStyle(G.text2)
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .padding(14)
                    .background(Color(hex: 0x0F1115), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .onSubmit(signIn)
                if let error { Text(error).font(.system(size: 14)).foregroundStyle(G.coral) }
                Button(busy ? "Signing in…" : "Sign in", action: signIn).buttonStyle(GraphiteButton()).disabled(busy || password.isEmpty)
                Spacer()
            }
            .padding(20)
            .graphitePage()
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private func signIn() {
        busy = true
        Task {
            error = await hub.signIn(password: password)
            busy = false
            if error == nil { dismiss() }
        }
    }
}
