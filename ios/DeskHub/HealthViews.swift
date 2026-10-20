import Charts
import SwiftUI

extension G {
    static let heart = gradient(0xFF9DB0, 0xFF5E7A)

    /// Calm blue, typical mint, elevated amber, high coral.
    static func stress(_ score: Int) -> Color {
        score >= 75 ? coral : score >= 60 ? amber : score < 35 ? blue : mint
    }
}

// MARK: Today card

/// How the day is going by the watch and by the person's own check-ins.
struct BodyCard: View {
    /// On Today it links to the Health page; on the Health page it doesn't.
    var details = true
    @EnvironmentObject private var health: HealthMonitor
    @EnvironmentObject private var nav: AppNav

    var body: some View {
        Card {
            CardHeader(icon: "heart.fill", title: "How you're doing", gradient: G.heart)
            switch health.status {
            case .ready, .demo:
                if let day = health.today { DayStory(day: day) } else { ProgressView().tint(G.text2) }
            case .connecting:
                HStack(spacing: 10) { ProgressView().tint(G.text2); Text("Connecting to Apple Health…").foregroundStyle(G.text2) }
            case .unavailable:
                Text("Apple Health isn't available on this device.").font(.system(size: 14)).foregroundStyle(G.text2)
            case .off, .failed:
                Text("Connect Apple Health and the app watches your heart rate, HRV and activity from your Apple Watch through the day, estimates how stressed you are against your own normal, and sends the day to the hub.")
                    .font(.system(size: 14)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
                if let failure {
                    Text(failure).font(.system(size: 13)).foregroundStyle(G.coral)
                }
                Button { Task { await health.connect() } } label: { Label("Connect Apple Health", systemImage: "heart.text.square.fill") }
                    .buttonStyle(GraphiteButton(fill: G.heart))
            }
            if !health.connected, let c = health.today?.checkins.last { CheckInLine(checkin: c) }
            HStack(spacing: 10) {
                Button { nav.checkIn() } label: { Label("Check in", systemImage: checkedInToday ? "checkmark.circle" : "face.smiling").lineLimit(1).frame(maxWidth: .infinity) }
                    .buttonStyle(GraphiteButton(primary: false))
                if details, health.connected {
                    NavigationLink { HealthPage() } label: { Label("Details", systemImage: "chart.xyaxis.line").frame(maxWidth: .infinity) }
                        .buttonStyle(GraphiteButton(primary: false))
                }
            }
        }
    }

    private var checkedInToday: Bool { !(health.today?.checkins.isEmpty ?? true) }

    private var failure: String? {
        if case .failed(let message) = health.status { return message }
        return nil
    }
}

/// The day in plain words: a headline in the stress colour and a few sentences.
struct DayStory: View {
    let day: HealthDay

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(day.headline ?? HealthStory.headline(day))
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(day.stress.map { G.stress($0.score) } ?? G.text)
            Text(day.summary ?? HealthStory.summary(day))
                .font(.system(size: 15)).foregroundStyle(G.text2).lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The numbers behind the story, for the Health page: the estimate, HRV, resting heart rate,
/// and the stretches of raised heart rate while still.
struct DayNumbers: View {
    let day: HealthDay

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let stress = day.stress {
                HStack(spacing: 14) {
                    StressRing(score: stress.score)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(stress.label.capitalized).font(.system(size: 20, weight: .semibold)).foregroundStyle(G.stress(stress.score))
                        Text(stress.basis).font(.system(size: 13)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                Text("No heart data yet today. Wear your Apple Watch and it fills in through the day.").font(.system(size: 14)).foregroundStyle(G.text2)
            }
            HStack(spacing: 0) {
                stat(day.hrv.map { "\(Int($0.avg.rounded())) ms" }, day.hrv?.usual.map { "HRV · usual \(Int($0.rounded()))" } ?? "HRV")
                stat(day.restingHR?.today.map { "\(Int($0.rounded()))" }, day.restingHR?.usual.map { "RESTING · \(Int($0.rounded()))" } ?? "RESTING")
                stat(day.exerciseMin.map { "\(Int($0)) min" }, "EXERCISE")
                stat(day.daylightMin.map { "\(Int($0)) min" }, "DAYLIGHT")
            }
            if !day.moments.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("RAISED HEART RATE WHILE STILL").font(G.mono(10)).foregroundStyle(G.muted)
                    FlowLayout(spacing: 6) {
                        ForEach(day.moments) { m in
                            Text("\(Fmt.time(m.date)) · \(m.minutes) min · \(m.bpm) bpm")
                                .font(G.mono(12, .medium)).foregroundStyle(G.amber)
                                .padding(.horizontal, 9).padding(.vertical, 5)
                                .background(G.amber.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                }
            }
        }
    }

    private func stat(_ value: String?, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value ?? "–").font(.system(size: 17, weight: .semibold)).foregroundStyle(G.text).lineLimit(1).minimumScaleFactor(0.7)
            Text(label.uppercased()).font(G.mono(9)).foregroundStyle(G.muted).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CheckInLine: View {
    let checkin: CheckIn

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Divider().overlay(G.lineSoft)
            Text("CHECK-IN · \(Fmt.time(checkin.date))").font(G.mono(10)).foregroundStyle(G.muted)
            Text("\(CheckIn.moods[checkin.mood]) · stress \(CheckIn.stressWords[checkin.stress].lowercased()) · energy \(CheckIn.energyWords[checkin.energy].lowercased())")
                .font(.system(size: 15, weight: .medium)).foregroundStyle(G.text)
            if !(checkin.feelings + checkin.about).isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(checkin.feelings + checkin.about, id: \.self) { tag in
                        Text(tag).font(.system(size: 12, weight: .medium)).foregroundStyle(G.text2)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(G.control, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    }
                }
            }
            if !checkin.note.isEmpty {
                Text("“\(checkin.note)”").font(.system(size: 14)).italic().foregroundStyle(G.text2)
            }
        }
    }
}

struct StressRing: View {
    let score: Int
    var size: CGFloat = 78

    var body: some View {
        ZStack {
            Circle().stroke(G.track, lineWidth: 7)
            Circle()
                .trim(from: 0, to: CGFloat(score) / 100)
                .stroke(G.stress(score), style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(score)").font(.system(size: size * 0.36, weight: .semibold)).foregroundStyle(G.text)
                Text("stress").font(G.mono(9)).foregroundStyle(G.muted)
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: Health page (More)

struct HealthPage: View {
    @EnvironmentObject private var health: HealthMonitor
    @EnvironmentObject private var nav: AppNav

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                BodyCard(details: false)
                if health.connected, let day = health.today {
                    if day.stress != nil {
                        Card {
                            CardHeader(icon: "speedometer", title: "The numbers", gradient: G.heart, meta: "vs your last 30 days")
                            DayNumbers(day: day)
                        }
                    }
                    if !health.hours.isEmpty { chart }
                    activity(day)
                    if !day.checkins.isEmpty {
                        Card {
                            CardHeader(icon: "face.smiling", title: "Check-ins today", gradient: G.journal, meta: "\(day.checkins.count)")
                            ForEach(day.checkins.reversed()) { CheckInLine(checkin: $0) }
                        }
                    }
                }
                settings
                explainer
            }
            .padding(16)
        }
        .refreshable { await health.refresh(force: true) }
        .graphitePage()
        .navigationTitle("Health")
    }

    private var chart: some View {
        Card {
            CardHeader(icon: "waveform.path.ecg", title: "Through the day", gradient: G.heart, meta: "heart rate · steps")
            Chart {
                // Each hour's bar and point sit in the middle of that hour.
                ForEach(health.hours) { point in
                    BarMark(x: .value("Hour", Double(point.hour) + 0.5), y: .value("Steps", point.steps / 40), width: 7)
                        .foregroundStyle(Color(hex: 0x262B33))
                        .cornerRadius(3)
                    if let bpm = point.bpm {
                        LineMark(x: .value("Hour", Double(point.hour) + 0.5), y: .value("Heart rate", bpm))
                            .foregroundStyle(G.pink)
                            .interpolationMethod(.catmullRom)
                        PointMark(x: .value("Hour", Double(point.hour) + 0.5), y: .value("Heart rate", bpm))
                            .foregroundStyle(G.pink)
                            .symbolSize(18)
                    }
                }
                ForEach(health.today?.moments ?? []) { m in
                    RectangleMark(xStart: .value("From", hourValue(m.date)), xEnd: .value("To", hourValue(m.date) + Double(m.minutes) / 60),
                                  yStart: .value("Low", 0.0), yEnd: .value("High", 125.0))
                        .foregroundStyle(G.amber.opacity(0.18))
                }
            }
            .chartXScale(domain: 0.0...24.0)
            .chartXAxis {
                AxisMarks(values: [0.0, 6.0, 12.0, 18.0, 24.0]) { value in
                    AxisValueLabel {
                        if let h = value.as(Double.self) { Text(hourLabel(Int(h) % 24)) }
                    }
                }
            }
            .chartYAxis {
                AxisMarks(position: .trailing, values: [60.0, 90.0, 120.0]) { _ in
                    AxisGridLine().foregroundStyle(G.lineSoft)
                    AxisValueLabel()
                }
            }
            .frame(height: 170)
            Text("Pink: average heart rate each hour. Grey bars: steps. Amber: raised heart rate while still.")
                .font(.system(size: 12)).foregroundStyle(G.muted)
        }
    }

    private func hourLabel(_ h: Int) -> String {
        switch h {
        case 0: return "12a"
        case 12: return "12p"
        case 1..<12: return "\(h)a"
        default: return "\(h - 12)p"
        }
    }

    private func hourValue(_ date: Date) -> Double {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return Double(c.hour ?? 0) + Double(c.minute ?? 0) / 60
    }

    private func activity(_ day: HealthDay) -> some View {
        Card {
            CardHeader(icon: "figure.walk", title: "Activity", gradient: G.money)
            HStack(spacing: 0) {
                tile(day.steps.map { "\(Int($0))" }, "STEPS")
                tile(day.activeKcal.map { "\(Int($0))" }, "ACTIVE KCAL")
                tile(day.standHours.map { "\(Int($0))" }, "STAND HRS")
                tile(day.mindfulMin.map { "\(Int($0))" }, "MINDFUL MIN")
            }
            ForEach(day.workouts) { w in
                HStack {
                    Image(systemName: "figure.run").foregroundStyle(G.mint)
                    Text(w.type).font(.system(size: 15, weight: .medium)).foregroundStyle(G.text)
                    Spacer()
                    Text("\(w.minutes) min\(w.kcal.map { " · \($0) kcal" } ?? "") · \(Fmt.time(Date(timeIntervalSince1970: w.start / 1000)))")
                        .font(G.mono(11)).foregroundStyle(G.muted)
                }
            }
        }
    }

    private func tile(_ value: String?, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value ?? "–").font(.system(size: 17, weight: .semibold)).foregroundStyle(G.text).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(G.mono(9)).foregroundStyle(G.muted).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var settings: some View {
        Card {
            CardHeader(icon: "bell.fill", title: "Check-ins", gradient: G.journal)
            Toggle("Remind me every evening", isOn: $health.checkinOn).tint(G.pink).foregroundStyle(G.text)
            if health.checkinOn {
                DatePicker("At", selection: checkinTime, displayedComponents: .hourAndMinute).foregroundStyle(G.text)
                if health.notificationsOff {
                    Text("Notifications are off for Desk Hub, so the reminder can't show up. Turn them on in Settings > Notifications > Desk Hub.")
                        .font(.system(size: 12)).foregroundStyle(G.amber)
                } else {
                    Text("Tap it and you can say how the day went, or tap it in.").font(.system(size: 12)).foregroundStyle(G.muted)
                }
            }
            Toggle("Ask when stress looks high", isOn: $health.nudges).tint(G.pink).foregroundStyle(G.text)
            Text("At most twice a day, after your heart rate has been up for a while when you weren't moving.")
                .font(.system(size: 12)).foregroundStyle(G.muted)
            if let sent = health.sentAt {
                Text("Sent to the hub \(Fmt.ago(sent)).").font(G.mono(11)).foregroundStyle(G.muted)
            } else if let problem = health.sendProblem {
                Text(problem).font(.system(size: 12)).foregroundStyle(G.coral)
            }
            if health.status == .ready {
                Button("Disconnect Apple Health", role: .destructive) { health.disconnect() }.font(.system(size: 14))
            }
        }
    }

    private var checkinTime: Binding<Date> {
        Binding {
            Calendar.current.date(bySettingHour: health.checkinMinutes / 60, minute: health.checkinMinutes % 60, second: 0, of: Date()) ?? Date()
        } set: { date in
            let c = Calendar.current.dateComponents([.hour, .minute], from: date)
            health.checkinMinutes = (c.hour ?? 21) * 60 + (c.minute ?? 0)
        }
    }

    private var explainer: some View {
        Card {
            CardHeader(icon: "info.circle.fill", title: "How the estimate works", gradient: G.white)
            Text("Apple doesn't give apps a stress number, so this one is an estimate from your Apple Watch, compared with your own last 30 days. Heart-rate variability (HRV) tends to drop when you're stressed and your resting heart rate tends to rise; a heart rate well above resting while you're sitting still counts too. 50 is a typical day for you. Your own check-ins count for more than the number, and it isn't a medical measurement.")
                .font(.system(size: 13)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
            Text("Only this summary, the day's totals and your check-ins go to your hub, never the raw samples. Claude's evening recap may mention how the day felt, without the numbers.")
                .font(.system(size: 13)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: Layout

/// Lays out chips left to right, wrapping onto new lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += row + spacing
                row = 0
            }
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += row + spacing
                row = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            row = max(row, size.height)
        }
    }
}
