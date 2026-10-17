import SwiftUI

/// The first thing to open each day: Claude's brief, what needs you, the calendar, tasks,
/// mail, PayIt, your systems and the journal, on one page.
struct TodayView: View {
    @EnvironmentObject private var hub: HubStore
    @State private var openMail: MailMessage?
    @State private var openEvent: CalEvent?
    @State private var signingIn = false
    @State private var scrolled = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        header
                        StatusBanner(signingIn: $signingIn)
                        if let d = hub.dashboard {
                            HeroCard(d: d).id("hero")
                            NeedsYouCard(d: d, openMail: $openMail).id("needs")
                            UpNextCard(d: d, openEvent: $openEvent).id("schedule")
                            TodayTasksCard(d: d).id("tasks")
                            MailDigestCard(d: d, openMail: $openMail).id("mail")
                            NavigationLink { PayItView() } label: { PayItCard(d: d) }
                                .buttonStyle(.plain)
                                .id("payit")
                            NavigationLink { SystemsView() } label: { SystemsCard(d: d) }
                                .buttonStyle(.plain)
                                .id("systems")
                            JournalSummaryCard(d: d).id("journal")
                        } else if hub.status == .loading || hub.status == .idle {
                            ProgressView().tint(G.text2).padding(.top, 80)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 28)
                }
                .refreshable { await hub.refresh() }
                .onAppear { scrollIfAsked(proxy) }
                .onChange(of: hub.updatedAt) { _, _ in scrollIfAsked(proxy) }
            }
            .overlay(alignment: .top) {
                Color.clear.frame(height: 0).background(G.bg.ignoresSafeArea(edges: .top))
            }
            .graphitePage()
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $openMail) { MailDetailSheet(message: $0) }
            .sheet(item: $openEvent) { EventSheet(event: $0) }
            .sheet(isPresented: $signingIn) { SignInSheet() }
        }
    }

    /// `-scrollTo payit` on launch, for the simulator screenshots.
    private func scrollIfAsked(_ proxy: ScrollViewProxy) {
        guard !scrolled, hub.dashboard != nil, let anchor = UserDefaults.standard.string(forKey: "scrollTo") else { return }
        scrolled = true
        Task {
            try? await Task.sleep(for: .milliseconds(500))
            proxy.scrollTo(anchor, anchor: .top)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Fmt.day(Date(), "EEEE, MMMM d").uppercased())
                .font(G.mono(12, .medium))
                .foregroundStyle(G.muted)
            HStack(alignment: .firstTextBaseline) {
                Text(greeting).font(.system(size: 30, weight: .bold)).foregroundStyle(G.text)
                Spacer()
                if let at = hub.updatedAt {
                    Text(Fmt.ago(at)).font(G.mono(11)).foregroundStyle(G.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 10)
    }

    private var greeting: String {
        switch Fmt.hour() {
        case 4..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        default: return "Good evening"
        }
    }
}

/// Sign-in needed, hub unreachable, or an action that just failed.
struct StatusBanner: View {
    @EnvironmentObject private var hub: HubStore
    @Binding var signingIn: Bool

    var body: some View {
        switch hub.status {
        case .signIn(let canSignIn):
            Card {
                CardHeader(icon: "lock.fill", title: "Sign in to your hub", gradient: G.cal)
                Text(canSignIn ? "Your hub asks for its password from devices other than the desk screen." : "This hub only lets in devices on its own Wi-Fi. Set HUB_PASSWORD in the Pi's .env to use it from anywhere.")
                    .font(.system(size: 14)).foregroundStyle(G.text2)
                if canSignIn {
                    Button("Sign in") { signingIn = true }.buttonStyle(GraphiteButton())
                }
            }
        case .offline(let message):
            Card {
                CardHeader(icon: "wifi.slash", title: "Can't reach the hub", gradient: G.bad)
                Text(message).font(.system(size: 14)).foregroundStyle(G.text2)
                Button("Try again") { Task { await hub.refresh() } }.buttonStyle(GraphiteButton(primary: false))
            }
        default:
            if let problem = hub.problem {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(G.coral)
                    Text(problem).font(.system(size: 14)).foregroundStyle(G.text2)
                    Spacer()
                    Button { hub.problem = nil } label: { Image(systemName: "xmark").foregroundStyle(G.muted) }
                }
                .padding(14)
                .background(Color(hex: 0x1E2229), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }
}

// MARK: Hero

struct HeroCard: View {
    let d: Dashboard

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(label).font(G.mono(11, .medium)).foregroundStyle(.white.opacity(0.7))
                    Text(headline)
                        .font(.system(size: 21, weight: .semibold))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                if let w = d.weather?.data { weather(w) }
            }
            HStack(spacing: 8) {
                chip("calendar", plural(d.upNext.count, "event"))
                chip("checklist", plural(d.focusTodos.count, "to do"))
                chip("envelope", plural(d.urgentMail.count, "urgent"))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(evening ? G.heroDusk : G.heroDay, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(alignment: .topTrailing) {
            Circle().strokeBorder(.white.opacity(0.14), lineWidth: 1).frame(width: 180).offset(x: 70, y: -80)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private var evening: Bool { Fmt.hour() >= 16 }

    private var label: String {
        if evening, d.recap?.headline != nil { return "TODAY'S RECAP" }
        if d.digest?.headline != nil { return "CLAUDE'S BRIEF" }
        return "TODAY"
    }

    private var headline: String {
        if evening, let h = d.recap?.headline { return h }
        if let h = d.digest?.headline { return h }
        var parts: [String] = []
        if !d.upNext.isEmpty { parts.append(plural(d.upNext.count, "event") + " ahead") }
        if !d.focusTodos.isEmpty { parts.append(plural(d.focusTodos.count, "task") + " due") }
        if !d.urgentMail.isEmpty { parts.append(plural(d.urgentMail.count, "urgent email")) }
        return parts.isEmpty ? "A clear day. Nothing's due and nothing needs you." : parts.joined(separator: ", ") + "."
    }

    private func weather(_ w: WeatherData) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Image(systemName: Fmt.weatherIcon(w.code, day: w.isDay ?? true))
                .symbolRenderingMode(.multicolor)
                .font(.system(size: 26))
            Text("\(Int(w.temp ?? 0))°").font(.system(size: 30, weight: .medium)).foregroundStyle(.white)
            Text("H \(Int(w.hi ?? 0))° L \(Int(w.lo ?? 0))°").font(G.mono(11)).foregroundStyle(.white.opacity(0.75))
            if let rain = w.rainChance, rain >= 20 {
                Text("\(rain)% rain").font(G.mono(11)).foregroundStyle(.white.opacity(0.75))
            }
        }
    }

    private func chip(_ icon: String, _ text: String) -> some View {
        Label(text, systemImage: icon)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(.white)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.white.opacity(0.16), in: Capsule())
    }
}

func plural(_ n: Int, _ noun: String) -> String {
    "\(n) \(noun)\(n == 1 || noun.hasSuffix("do") || noun == "urgent" ? "" : "s")"
}

// MARK: Needs you

struct NeedsYouCard: View {
    @EnvironmentObject private var hub: HubStore
    @EnvironmentObject private var nav: AppNav
    let d: Dashboard
    @Binding var openMail: MailMessage?

    /// Warnings and errors only; the hub's info notices ("digest is ready") are updates, not asks.
    private var alerts: [HubAlert] { (d.alerts ?? []).filter { $0.level == "error" || $0.level == "warn" } }

    private var total: Int { alerts.count + d.urgentMail.count + d.overdueTodos.count + (d.suggestedTodos.isEmpty ? 0 : 1) }

    var body: some View {
        Card {
            CardHeader(icon: "bell.fill", title: "Needs you", gradient: total == 0 ? G.money : G.bad, meta: total == 0 ? nil : "\(total)")
            if total == 0 {
                Label("Nothing needs you right now.", systemImage: "checkmark.seal.fill")
                    .font(.system(size: 15)).foregroundStyle(G.mint)
            }
            ForEach(alerts) { alert in
                NeedRow(icon: alertIcon(alert.level), gradient: alertGradient(alert.level), title: sentence(alert.title ?? "Alert"),
                        detail: [alert.source.map(Self.sourceName), alert.body].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .contextMenu { Button("Dismiss") { Task { await hub.dismiss(alert) } } }
            }
            ForEach(d.urgentMail) { message in
                Button { openMail = message } label: {
                    NeedRow(icon: "envelope.fill", gradient: G.mail, title: message.action?.isEmpty == false ? message.action! : (message.subject ?? "Email"),
                            detail: message.from ?? "", chevron: true)
                }
                .buttonStyle(.plain)
            }
            ForEach(d.overdueTodos) { todo in
                Button { nav.tab = .tasks } label: {
                    NeedRow(icon: "clock.fill", gradient: G.focus, title: todo.text, detail: "Overdue" + (todo.tag.map { " · \($0)" } ?? ""), chevron: true)
                }
                .buttonStyle(.plain)
            }
            if !d.suggestedTodos.isEmpty {
                Button { nav.tab = .tasks } label: {
                    NeedRow(icon: "sparkles", gradient: G.mail, title: "\(plural(d.suggestedTodos.count, "suggested task")) from email",
                            detail: "Keep or dismiss", chevron: true)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func sentence(_ text: String) -> String { text.prefix(1).uppercased() + text.dropFirst() }

    private static func sourceName(_ source: String) -> String { source == "payit" ? "PayIt" : source.capitalized }

    private func alertIcon(_ level: String?) -> String {
        switch level {
        case "error": return "exclamationmark.octagon.fill"
        case "warn": return "exclamationmark.triangle.fill"
        default: return "info.circle.fill"
        }
    }

    private func alertGradient(_ level: String?) -> LinearGradient {
        switch level {
        case "error": return G.bad
        case "warn": return G.focus
        default: return G.cal
        }
    }
}

struct NeedRow: View {
    let icon: String
    let gradient: LinearGradient
    let title: String
    let detail: String
    var chevron = false

    var body: some View {
        HStack(spacing: 12) {
            IconTile(icon: icon, gradient: gradient, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 15, weight: .medium)).foregroundStyle(G.text).lineLimit(2).multilineTextAlignment(.leading)
                if !detail.isEmpty {
                    Text(detail).font(G.mono(11)).foregroundStyle(G.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color(hex: 0x5C6370))
            }
        }
        .contentShape(Rectangle())
    }
}

// MARK: Up next

struct UpNextCard: View {
    let d: Dashboard
    @Binding var openEvent: CalEvent?

    var body: some View {
        Card {
            CardHeader(icon: "calendar", title: "Up next", gradient: G.cal, meta: d.upNext.isEmpty ? nil : "\(d.upNext.count) today")
            if d.upNext.isEmpty {
                Text(tomorrowLine).font(.system(size: 15)).foregroundStyle(G.text2)
            }
            ForEach(d.upNext.prefix(4)) { event in
                Button { openEvent = event } label: { EventRow(event: event) }.buttonStyle(.plain)
            }
        }
    }

    private var tomorrowLine: String {
        guard let next = d.events.first(where: { Fmt.dayOffset(Fmt.date($0.start)) == 1 }) else { return "Nothing else on the calendar today." }
        return "Nothing else today. Tomorrow starts with \(next.title ?? "an event") at \(Fmt.time(Fmt.date(next.start)))."
    }
}

struct EventRow: View {
    let event: CalEvent

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(when).font(G.mono(13, .medium)).foregroundStyle(isNow ? G.blue : G.text2).frame(width: 78, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title ?? "Event").font(.system(size: 16, weight: .medium)).foregroundStyle(G.text).lineLimit(2)
                let place = [event.location, event.calendar].compactMap { $0 }.first { !$0.isEmpty }
                if let place { Text(place).font(G.mono(11)).foregroundStyle(G.muted).lineLimit(1) }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    private var isNow: Bool {
        let now = Date().timeIntervalSince1970 * 1000
        return event.start <= now && event.endMs > now
    }

    private var when: String {
        if event.allDay == true { return "All day" }
        if isNow { return "Now" }
        return Fmt.time(Fmt.date(event.start))
    }
}

// MARK: To do

struct TodayTasksCard: View {
    @EnvironmentObject private var hub: HubStore
    @EnvironmentObject private var nav: AppNav
    let d: Dashboard

    var body: some View {
        Card {
            CardHeader(icon: "checklist", title: "To do", gradient: G.tasks, meta: "\(d.openTodos.count) open")
            if d.focusTodos.isEmpty {
                Text("Nothing due today.").font(.system(size: 15)).foregroundStyle(G.text2)
            }
            ForEach(d.focusTodos.prefix(5)) { todo in
                HStack(spacing: 12) {
                    Button { Task { await hub.setDone(todo, true) } } label: { CheckCircle(done: todo.isDone) }.buttonStyle(.plain)
                    Text(todo.text).font(.system(size: 15, weight: .medium)).foregroundStyle(G.text).lineLimit(2)
                    Spacer(minLength: 6)
                    if let due = Fmt.due(todo.due) {
                        Text(due.text).font(G.mono(11, .medium)).foregroundStyle(due.color)
                    } else if todo.star == true {
                        Image(systemName: "star.fill").font(.system(size: 12)).foregroundStyle(Color(hex: 0xFFC65C))
                    }
                }
            }
            Button { nav.tab = .tasks } label: {
                Text(d.focusTodos.count > 5 ? "See all \(d.openTodos.count) tasks" : "All tasks")
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(G.text2)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: Mail

struct MailDigestCard: View {
    @EnvironmentObject private var hub: HubStore
    @EnvironmentObject private var nav: AppNav
    let d: Dashboard
    @Binding var openMail: MailMessage?

    private var unread: Int { (d.mail?.data?.accounts ?? []).reduce(0) { $0 + ($1.unread ?? 0) } }

    var body: some View {
        Card(outline: G.aiMail) {
            CardHeader(icon: "envelope.fill", title: "Mail", gradient: G.mail, meta: d.digest?.emailCount.map { "\($0) emails" } ?? "\(unread) unread")
            if let digest = d.digest, let headline = digest.headline {
                Text(headline).font(.system(size: 17, weight: .medium)).foregroundStyle(G.text).fixedSize(horizontal: false, vertical: true)
                ForEach(Array((digest.highlights ?? []).prefix(3).enumerated()), id: \.offset) { _, line in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Circle().fill(G.violet).frame(width: 5, height: 5).offset(y: -2)
                        Text(line).font(.system(size: 14)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                Text("No digest yet today.").font(.system(size: 15)).foregroundStyle(G.text2)
                Button("Write it now") { Task { await hub.runDigest() } }.buttonStyle(GraphiteButton(primary: false))
            }
            Button { nav.tab = .mail } label: {
                Text("Open mail").font(.system(size: 14, weight: .medium)).foregroundStyle(G.text2)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: PayIt

struct PayItCard: View {
    let d: Dashboard

    var body: some View {
        let today = d.payit?.data?.today
        Card {
            CardHeader(icon: "creditcard.fill", title: "PayIt", gradient: G.money, meta: statusText, metaColor: d.payitIssues.isEmpty ? G.mint : G.amber)
            if let error = d.payit?.error, today == nil {
                Text(error).font(.system(size: 14)).foregroundStyle(G.coral)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(Fmt.money(today?.grossCents)).font(.system(size: 40, weight: .semibold)).foregroundStyle(G.text)
                    if let pill = delta { Pill(text: pill.text, color: pill.color) }
                }
                if let y = d.payit?.data?.yesterdaySameTimeCents {
                    Text("vs. \(Fmt.money(y)) yesterday by now").font(.system(size: 13)).foregroundStyle(G.text3)
                }
                HStack(spacing: 0) {
                    stat("SALES", "\(today?.count ?? 0)", G.text)
                    stat("AVG", Fmt.money(today?.avgTicketCents), G.text)
                    stat("DECLINED", "\(today?.declined ?? 0)", (today?.declined ?? 0) > 0 ? G.amber : G.text)
                    stat("KEPT", Fmt.money(d.payit?.data?.profit?.todayCents), G.mint)
                }
                if let subs = d.payit?.data?.subscriptions {
                    Divider().overlay(G.lineSoft)
                    HStack(spacing: 8) {
                        Text("PLUS").font(G.mono(10)).foregroundStyle(G.muted)
                        Text("\(subs.paying ?? 0) paying · \(Fmt.money(subs.monthCents)) this month")
                            .font(.system(size: 14, weight: .medium)).foregroundStyle(G.text)
                        Spacer(minLength: 0)
                    }
                }
                if let last = d.payit?.data?.recent?.first {
                    Divider().overlay(G.lineSoft)
                    HStack(spacing: 8) {
                        Text("LATEST").font(G.mono(10)).foregroundStyle(G.muted)
                        Text("\(Fmt.money(last.cents, exact: true)) · \(Fmt.provider(last.provider))")
                            .font(.system(size: 14, weight: .medium)).foregroundStyle(last.completed ? G.text : G.muted)
                        Spacer(minLength: 6)
                        if let when = last.when { Text(Fmt.ago(when)).font(G.mono(11)).foregroundStyle(G.muted) }
                    }
                }
            }
        }
    }

    private var statusText: String {
        d.payitIssues.isEmpty ? "● All systems up" : "● \(plural(d.payitIssues.count, "issue"))"
    }

    private var delta: (text: String, color: Color)? {
        guard let gross = d.payit?.data?.today?.grossCents, let y = d.payit?.data?.yesterdaySameTimeCents, y > 0 else { return nil }
        let pct = Int(((gross - y) / y * 100).rounded())
        return pct >= 0 ? ("▲ \(pct)%", G.mint) : ("▼ \(-pct)%", G.coral)
    }

    private func stat(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.system(size: 17, weight: .semibold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(G.mono(10)).foregroundStyle(G.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: Systems

struct SystemsCard: View {
    @EnvironmentObject private var ring: RingController
    let d: Dashboard

    var body: some View {
        Card {
            CardHeader(icon: "server.rack", title: "Systems", gradient: G.white, meta: issues == 0 ? "● All good" : "● \(plural(issues, "issue"))", metaColor: issues == 0 ? G.mint : G.amber)
            SystemLine(icon: "display", name: "Desk screen", value: d.desk?.online == true ? "On · \(d.desk?.view ?? "home")" : "Not reporting", ok: d.desk?.online == true ? true : nil)
            SystemLine(icon: "cpu", name: "Pi", value: piLine, ok: (d.system?.tempC ?? 0) < 75)
            if let checks = d.payit?.data?.systems, !checks.isEmpty { ChecksRow(checks: checks) }
            ForEach(d.failingFeeds) { feed in
                SystemLine(icon: "antenna.radiowaves.left.and.right", name: feed.name, value: feed.error, ok: false)
            }
            if ring.pairedId != nil {
                SystemLine(icon: "circle.circle", name: "Index 01", value: ring.status, ok: !ring.status.lowercased().contains("problem"))
            }
        }
    }

    private var issues: Int { d.payitIssues.count + d.failingFeeds.count + ((d.system?.tempC ?? 0) >= 75 ? 1 : 0) }

    private var piLine: String {
        var parts: [String] = []
        if let t = d.system?.tempC { parts.append("\(Int(t))°C") }
        if let l = d.system?.load { parts.append(String(format: "load %.2f", l)) }
        if let m = d.system?.memUsedPct { parts.append("mem \(Int(m))%") }
        if let u = d.system?.uptimeH { parts.append(u >= 48 ? "up \(Int(u / 24))d" : "up \(Int(u))h") }
        return parts.isEmpty ? "No readings" : parts.joined(separator: " · ")
    }
}

/// PayIt's system checks as one line ("4 up"), opening to each check when tapped.
struct ChecksRow: View {
    let checks: [SystemCheck]
    @State private var open = false

    init(checks: [SystemCheck]) {
        self.checks = checks
    }

    var body: some View {
        let bad = checks.filter { !$0.isUp }
        VStack(alignment: .leading, spacing: 10) {
            Button { withAnimation(.snappy) { open.toggle() } } label: {
                HStack(spacing: 10) {
                    Circle().fill(bad.isEmpty ? G.mint : G.coral).frame(width: 7, height: 7)
                    Image(systemName: "bolt.horizontal").font(.system(size: 13)).foregroundStyle(G.text3).frame(width: 18)
                    Text("PayIt checks").font(.system(size: 15, weight: .medium)).foregroundStyle(G.text).lineLimit(1).layoutPriority(1)
                    Spacer(minLength: 8)
                    Text(bad.isEmpty ? "\(checks.count) up" : "\(bad.count) of \(checks.count) need a look")
                        .font(G.mono(11)).foregroundStyle(bad.isEmpty ? G.muted : G.coral).lineLimit(1)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(G.muted)
                        .rotationEffect(.degrees(open ? 90 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                ForEach(checks) { check in
                    SystemLine(icon: "bolt.horizontal", name: check.system.replacingOccurrences(of: "_", with: " ").capitalized, value: check.detail ?? check.status, ok: check.isUp)
                }
                .padding(.leading, 18)
            }
        }
    }
}

struct SystemLine: View {
    let icon: String
    let name: String
    let value: String
    /// true = fine, false = a problem, nil = neither (switched off, not set up).
    let ok: Bool?

    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(ok == true ? G.mint : ok == false ? G.coral : Color(hex: 0x5C6370)).frame(width: 7, height: 7)
            Image(systemName: icon).font(.system(size: 13)).foregroundStyle(G.text3).frame(width: 18)
            Text(name).font(.system(size: 15, weight: .medium)).foregroundStyle(G.text).lineLimit(1).layoutPriority(1)
            Spacer(minLength: 8)
            Text(value).font(G.mono(11)).foregroundStyle(ok == false ? G.coral : G.muted).lineLimit(1).truncationMode(.tail)
        }
    }
}

// MARK: Journal

struct JournalSummaryCard: View {
    @EnvironmentObject private var nav: AppNav
    let d: Dashboard

    var body: some View {
        Card(outline: G.aiJournal) {
            CardHeader(icon: "book.closed.fill", title: "Journal", gradient: G.journal, meta: d.todayJournal.isEmpty ? nil : "\(d.todayJournal.count) today")
            if let recap = d.recap?.headline {
                Text(recap).font(.system(size: 16, weight: .medium)).foregroundStyle(G.text).fixedSize(horizontal: false, vertical: true)
            } else if let last = d.todayJournal.first {
                Text(last.shown).font(.system(size: 15)).foregroundStyle(G.text2).lineLimit(3)
            } else {
                Text("Nothing written today. Say how it's going and the hub files it.").font(.system(size: 15)).foregroundStyle(G.text2)
            }
            HStack(spacing: 10) {
                Button { nav.record() } label: { Label("Record", systemImage: "mic.fill") }
                    .buttonStyle(GraphiteButton(fill: G.journal))
                Button { nav.write() } label: { Label("Write", systemImage: "square.and.pencil") }
                    .buttonStyle(GraphiteButton(primary: false))
            }
        }
    }
}
