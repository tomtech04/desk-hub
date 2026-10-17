import Charts
import SwiftUI

/// PayIt, the schedule, your systems, the ring, and the hub connection.
struct MoreView: View {
    enum Page: String, Hashable {
        case payit, schedule, systems, health, ring, connection, web
    }

    @EnvironmentObject private var hub: HubStore
    @EnvironmentObject private var ring: RingController
    @EnvironmentObject private var health: HealthMonitor
    // `-morePage payit` on launch, for the simulator screenshots.
    @State private var path: [Page] = UserDefaults.standard.string(forKey: "morePage").flatMap(Page.init(rawValue:)).map { [$0] } ?? []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    link(.payit, "creditcard.fill", G.money, "PayIt", Fmt.money(hub.dashboard?.payit?.data?.today?.grossCents) + " today")
                    link(.schedule, "calendar", G.cal, "Schedule", "\(hub.dashboard?.events.count ?? 0) events coming up")
                    link(.systems, "server.rack", G.white, "Systems", systemsLine)
                    link(.health, "heart.fill", G.heart, "Health", healthLine)
                } header: { SectionLabel(text: "Your world") }
                Section {
                    link(.ring, "circle.circle", G.journal, "Ring & voice notes", ring.pairedId == nil ? "Not paired" : ring.status)
                } header: { SectionLabel(text: "Voice") }
                Section {
                    link(.connection, "network", G.cal, "Hub connection", connectionLine)
                    link(.web, "safari", G.white, "The full hub", "Every screen, as on the desk")
                } header: { SectionLabel(text: "Hub") }
            }
            .scrollContentBackground(.hidden)
            .graphitePage()
            .navigationTitle("More")
            .navigationDestination(for: Page.self) { page in
                switch page {
                case .payit: PayItView()
                case .schedule: ScheduleView()
                case .systems: SystemsView()
                case .health: HealthPage()
                case .ring: RingSettingsView()
                case .connection: ConnectionView()
                case .web: HubView().navigationTitle("Hub").navigationBarTitleDisplayMode(.inline)
                }
            }
        }
    }

    private var systemsLine: String {
        guard let d = hub.dashboard else { return "—" }
        let issues = d.payitIssues.count + d.failingFeeds.count
        return issues == 0 ? "All good" : plural(issues, "issue")
    }

    private var healthLine: String {
        guard health.connected else { return health.status == .unavailable ? "Not available" : "Not connected" }
        guard let day = health.today else { return "No data yet today" }
        return day.headline ?? HealthStory.headline(day)
    }

    private var connectionLine: String {
        switch hub.status {
        case .ok: return hub.dashboard?.signedIn == true ? "Signed in" : "Connected"
        case .signIn: return "Sign in needed"
        case .offline: return "Can't reach it"
        default: return "Connecting…"
        }
    }

    private func link(_ page: Page, _ icon: String, _ gradient: LinearGradient, _ title: String, _ detail: String) -> some View {
        NavigationLink(value: page) {
            HStack(spacing: 12) {
                IconTile(icon: icon, gradient: gradient, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 16, weight: .medium)).foregroundStyle(G.text)
                    Text(detail).font(G.mono(11)).foregroundStyle(G.muted).lineLimit(1)
                }
            }
            .padding(.vertical, 2)
        }
        .listRowBackground(G.panel)
    }
}

// MARK: PayIt

struct PayItView: View {
    @EnvironmentObject private var hub: HubStore

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let d = hub.dashboard, let p = d.payit?.data {
                    hero(p)
                    if let subs = p.subscriptions {
                        SubscriptionsCard(subs: subs)
                    } else if let error = p.subscriptionsError {
                        Card {
                            CardHeader(icon: "star.circle.fill", title: "PayIt Plus", gradient: G.money)
                            Text(error).font(.system(size: 14)).foregroundStyle(G.coral)
                        }
                    }
                    if let recent = p.recent, !recent.isEmpty { latest(recent, newBusinesses: p.today?.newBusinesses ?? 0) }
                    if let hourly = p.hourly, !hourly.isEmpty { byHour(hourly) }
                    if let week = p.week, !week.isEmpty { lastWeek(week) }
                    if let providers = p.today?.byProvider, !providers.isEmpty { methods(providers) }
                    // System checks matter only when something's off, so they stay folded until tapped.
                    FoldCard(icon: "bolt.horizontal.fill", title: "Systems", gradient: G.money,
                             summary: d.payitIssues.isEmpty ? "● All up" : "● \(plural(d.payitIssues.count, "issue"))",
                             summaryColor: d.payitIssues.isEmpty ? G.mint : G.amber) {
                        ForEach(p.systems ?? []) { check in
                            SystemLine(icon: "bolt.horizontal", name: check.system.replacingOccurrences(of: "_", with: " ").capitalized, value: check.detail ?? check.status, ok: check.isUp)
                        }
                    }
                } else if let error = hub.dashboard?.payit?.error {
                    Card { Text(error).font(.system(size: 14)).foregroundStyle(G.coral) }
                } else {
                    Card { Text("PayIt isn't connected to this hub.").font(.system(size: 14)).foregroundStyle(G.text2) }
                }
            }
            .padding(16)
        }
        .refreshable { await hub.refresh() }
        .graphitePage()
        .navigationTitle("PayIt")
    }

    private func hero(_ p: PayItData) -> some View {
        let t = p.today
        return VStack(alignment: .leading, spacing: 12) {
            Text("GROSS VOLUME TODAY").font(G.mono(11, .medium)).foregroundStyle(.white.opacity(0.7))
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(Fmt.money(t?.grossCents)).font(.system(size: 46, weight: .semibold)).foregroundStyle(.white)
                if let g = t?.grossCents, let y = p.yesterdaySameTimeCents, y > 0 {
                    let pct = Int(((g - y) / y * 100).rounded())
                    Pill(text: pct >= 0 ? "▲ \(pct)%" : "▼ \(-pct)%", color: pct >= 0 ? G.mint : G.coral)
                }
            }
            if let kept = p.profit?.todayCents {
                Text("Platform kept \(Fmt.money(kept)) today · \(Fmt.money(p.profit?.weekCents)) this week").font(.system(size: 13)).foregroundStyle(.white.opacity(0.75))
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                tile("SALES", "\(t?.count ?? 0)")
                tile("AVG TICKET", Fmt.money(t?.avgTicketCents))
                tile("DECLINED", "\(t?.declined ?? 0)")
                tile("MERCHANTS", "\(t?.activeMerchants ?? 0)")
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(G.heroPayit, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Color(hex: 0x1C5550), lineWidth: 1))
    }

    private func latest(_ recent: [PayTxn], newBusinesses: Int) -> some View {
        let shown = Array(recent.prefix(8))
        return Card {
            CardHeader(icon: "list.bullet.rectangle.fill", title: "Latest transactions", gradient: G.money)
            ForEach(shown) { txn in
                TxnRow(txn: txn)
                if txn.id != shown.last?.id { Divider().overlay(G.lineSoft) }
            }
            if newBusinesses > 0 {
                Text(newBusinesses == 1 ? "1 new business signed up today" : "\(newBusinesses) new businesses signed up today")
                    .font(G.mono(11)).foregroundStyle(G.muted)
            }
        }
    }

    private func tile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.system(size: 19, weight: .semibold)).foregroundStyle(.white)
            Text(label).font(G.mono(10)).foregroundStyle(.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(red: 5 / 255, green: 20 / 255, blue: 20 / 255).opacity(0.45), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func byHour(_ hourly: [Double]) -> some View {
        let now = Fmt.hour()
        return Card {
            CardHeader(icon: "chart.bar.fill", title: "By hour", gradient: G.money, meta: Fmt.money(hourly.indices.contains(now) ? hourly[now] : 0) + " this hour")
            Chart {
                ForEach(Array(hourly.enumerated()), id: \.offset) { hour, cents in
                    BarMark(x: .value("Hour", hour), y: .value("Sales", cents / 100))
                        .foregroundStyle(hour == now ? AnyShapeStyle(G.money) : AnyShapeStyle(Color(hex: 0x262B33)))
                        .cornerRadius(3)
                }
            }
            .chartXAxis {
                AxisMarks(values: [0, 6, 12, 18]) { value in
                    AxisValueLabel {
                        if let h = value.as(Int.self) { Text(h == 0 ? "12a" : h == 12 ? "12p" : h < 12 ? "\(h)a" : "\(h - 12)p") }
                    }
                }
            }
            .chartYAxis(.hidden)
            .frame(height: 130)
        }
    }

    private func lastWeek(_ week: [PayDay]) -> some View {
        Card {
            CardHeader(icon: "calendar", title: "Last 7 days", gradient: G.money, meta: Fmt.money(week.reduce(0) { $0 + ($1.cents ?? 0) }))
            Chart {
                ForEach(Array(week.enumerated()), id: \.offset) { i, day in
                    BarMark(x: .value("Day", label(day.date)), y: .value("Volume", (day.cents ?? 0) / 100))
                        .foregroundStyle(i == week.count - 1 ? AnyShapeStyle(G.money) : AnyShapeStyle(Color(hex: 0x262B33)))
                        .cornerRadius(4)
                }
            }
            .chartYAxis(.hidden)
            .frame(height: 130)
        }
    }

    private func methods(_ providers: [String: Double]) -> some View {
        let total = providers.values.reduce(0, +)
        let rows = providers.sorted { $0.value > $1.value }
        return Card {
            CardHeader(icon: "creditcard", title: "By payment method", gradient: G.money)
            ForEach(rows, id: \.key) { row in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(row.key.replacingOccurrences(of: "_", with: " ").capitalized).font(.system(size: 15, weight: .medium)).foregroundStyle(G.text)
                        Spacer()
                        Text(Fmt.money(row.value)).font(G.mono(12)).foregroundStyle(G.text2)
                    }
                    ProgressView(value: total > 0 ? row.value / total : 0).tint(G.mint)
                }
            }
        }
    }

    private func label(_ iso: String) -> String {
        guard let d = Fmt.isoDate(iso) else { return String(iso.prefix(10)) }
        // The hub sends each day as UTC midnight.
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEE"
        return f.string(from: d)
    }
}

/// PayIt Plus: how many merchants pay for the plan, and what came in this month.
struct SubscriptionsCard: View {
    let subs: SubTotals

    var body: some View {
        Card {
            CardHeader(icon: "star.circle.fill", title: "PayIt Plus", gradient: G.money, meta: "this month")
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(subs.paying ?? 0)").font(.system(size: 38, weight: .semibold)).foregroundStyle(G.text)
                    Text("paying subscribers").font(.system(size: 13)).foregroundStyle(G.text3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 3) {
                    Text(Fmt.money(subs.monthCents)).font(.system(size: 38, weight: .semibold)).foregroundStyle(G.mint).lineLimit(1).minimumScaleFactor(0.6)
                    Text("from \(plural(subs.paidThisMonth ?? 0, "payment")) this month").font(.system(size: 13)).foregroundStyle(G.text3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let extra { Text(extra).font(.system(size: 13, weight: .medium)).foregroundStyle(G.amber) }
            Text("Store prices, before Apple's cut.").font(G.mono(11)).foregroundStyle(Color(hex: 0x5C6370))
        }
    }

    private var extra: String? {
        let parts = [(subs.inTrial ?? 0) > 0 ? "\(subs.inTrial ?? 0) in trial" : nil,
                     (subs.billingIssues ?? 0) > 0 ? plural(subs.billingIssues ?? 0, "billing issue") : nil].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// One payment: method and time on the left, the amount on the right (struck through if it didn't go through).
struct TxnRow: View {
    let txn: PayTxn

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Fmt.provider(txn.provider)).font(.system(size: 15, weight: .medium)).foregroundStyle(G.text)
                Text(txn.when.map { "\(Fmt.ago($0)) · \(Fmt.time($0))" } ?? "").font(G.mono(11)).foregroundStyle(G.muted)
            }
            Spacer(minLength: 6)
            if !txn.completed, let status = txn.status {
                Pill(text: status, color: status == "declined" ? G.amber : G.text3)
            }
            Text(Fmt.money(txn.cents, exact: true))
                .strikethrough(!txn.completed, color: G.muted)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(txn.completed ? G.text : G.muted)
        }
    }
}

/// A card that shows only its title row until tapped.
struct FoldCard<Content: View>: View {
    let icon: String
    let title: String
    let gradient: LinearGradient
    let summary: String
    let summaryColor: Color
    let content: () -> Content
    @State private var open = false

    init(icon: String, title: String, gradient: LinearGradient, summary: String, summaryColor: Color, @ViewBuilder content: @escaping () -> Content) {
        self.icon = icon
        self.title = title
        self.gradient = gradient
        self.summary = summary
        self.summaryColor = summaryColor
        self.content = content
    }

    var body: some View {
        Card {
            Button { withAnimation(.snappy) { open.toggle() } } label: {
                HStack(spacing: 10) {
                    IconTile(icon: icon, gradient: gradient)
                    Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(G.title)
                    Spacer(minLength: 8)
                    Text(summary).font(G.mono(12)).foregroundStyle(summaryColor).lineLimit(1)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(G.muted)
                        .rotationEffect(.degrees(open ? 90 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open { content() }
        }
    }
}

// MARK: Schedule

struct ScheduleView: View {
    @EnvironmentObject private var hub: HubStore
    @State private var open: CalEvent?

    private var days: [(offset: Int, events: [CalEvent])] {
        let events = hub.dashboard?.events ?? []
        let grouped = Dictionary(grouping: events) { Fmt.dayOffset(Fmt.date($0.start)) }
        return grouped.keys.sorted().filter { $0 >= 0 }.map { (offset: $0, events: grouped[$0] ?? []) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if days.isEmpty {
                    Card { Text("Nothing on the calendar.").font(.system(size: 15)).foregroundStyle(G.text2) }
                }
                ForEach(days, id: \.offset) { day in
                    Card {
                        CardHeader(icon: "calendar", title: title(day.offset, day.events.first), gradient: G.cal, meta: plural(day.events.count, "event"))
                        ForEach(day.events) { event in
                            Button { open = event } label: { EventRow(event: event) }.buttonStyle(.plain)
                        }
                    }
                }
                if let errors = hub.dashboard?.calendar?.error {
                    Card { Text(errors).font(.system(size: 13)).foregroundStyle(G.coral) }
                }
            }
            .padding(16)
        }
        .refreshable { await hub.refresh() }
        .graphitePage()
        .navigationTitle("Schedule")
        .sheet(item: $open) { EventSheet(event: $0) }
    }

    private func title(_ offset: Int, _ first: CalEvent?) -> String {
        if offset == 0 { return "Today" }
        if offset == 1 { return "Tomorrow" }
        return first.map { Fmt.day(Fmt.date($0.start), "EEEE, MMM d") } ?? "Later"
    }
}

// MARK: Systems

struct SystemsView: View {
    @EnvironmentObject private var hub: HubStore

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let d = hub.dashboard {
                    SystemsCard(d: d)
                    Card {
                        CardHeader(icon: "antenna.radiowaves.left.and.right", title: "Feeds", gradient: G.cal)
                        feed("PayIt", d.payit?.error, d.payit?.updatedAt)
                        feed("Mail", d.mail?.error, d.mail?.updatedAt)
                        feed("Calendar", d.calendar?.error, d.calendar?.updatedAt)
                        feed("Weather", d.weather?.error, d.weather?.updatedAt)
                    }
                    Card {
                        CardHeader(icon: "bell.fill", title: "Alerts", gradient: (d.alerts ?? []).isEmpty ? G.money : G.bad, meta: "\(d.alerts?.count ?? 0)")
                        if (d.alerts ?? []).isEmpty {
                            Text("No alerts.").font(.system(size: 14)).foregroundStyle(G.text2)
                        }
                        ForEach(d.alerts ?? []) { alert in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(alert.title ?? "Alert").font(.system(size: 15, weight: .medium)).foregroundStyle(G.text)
                                    Text([alert.source, alert.body].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(G.mono(11)).foregroundStyle(G.muted)
                                }
                                Spacer()
                                Button("Dismiss") { Task { await hub.dismiss(alert) } }.font(.system(size: 13, weight: .medium)).foregroundStyle(G.text2)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await hub.refresh() }
        .graphitePage()
        .navigationTitle("Systems")
    }

    private func feed(_ name: String, _ error: String?, _ updatedAt: Double?) -> some View {
        SystemLine(icon: "arrow.triangle.2.circlepath", name: name, value: error ?? (updatedAt.map { "updated " + Fmt.ago(Fmt.date($0)) } ?? "not set up"),
                   ok: error != nil ? false : updatedAt == nil ? nil : true)
    }
}

// MARK: Hub connection

struct ConnectionView: View {
    @EnvironmentObject private var hub: HubStore
    @EnvironmentObject private var settings: HubSettings
    @State private var signingIn = false
    @State private var testResult: String?

    var body: some View {
        Form {
            Section {
                TextField("http://deskhub.local:8080", text: $settings.hubAddress)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await hub.refresh() } }
                LabeledContent("Status", value: statusLine)
                if needsSignIn {
                    Button("Sign in") { signingIn = true }
                } else if hub.dashboard?.signedIn == true {
                    Button("Sign out", role: .destructive) { Task { await hub.signOut() } }
                }
            } header: {
                SectionLabel(text: "Address")
            } footer: {
                Text("At home, http://deskhub.local:8080. Use the hub's public address to see everything when you're out.")
            }
            Section {
                SecureField("Voice token (HUB_VOICE_TOKEN)", text: $settings.voiceToken)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Send a test to the hub") { sendTest() }
                if let testResult { Text(testResult).font(.footnote).foregroundStyle(.secondary) }
            } header: {
                SectionLabel(text: "Ring notes")
            } footer: {
                Text("The ring's notes are sent with the voice token from the hub's .env, so they arrive even when this phone isn't signed in.")
            }
        }
        .scrollContentBackground(.hidden)
        .graphitePage()
        .navigationTitle("Hub connection")
        .sheet(isPresented: $signingIn) { SignInSheet() }
    }

    private var needsSignIn: Bool { hub.status == .signIn(canSignIn: true) }

    private var statusLine: String {
        switch hub.status {
        case .ok: return hub.updatedAt.map { "Connected · " + Fmt.ago($0) } ?? "Connected"
        case .signIn: return "Sign in needed"
        case .offline(let message): return message
        default: return "Connecting…"
        }
    }

    private func sendTest() {
        testResult = "Sending…"
        Task {
            do {
                try await HubClient.sendTest(settings: settings)
                testResult = "The hub got it; a \"Ring connected\" card should be showing."
            } catch {
                testResult = error.localizedDescription
            }
        }
    }
}
