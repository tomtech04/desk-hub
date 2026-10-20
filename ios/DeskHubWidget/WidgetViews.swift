import SwiftUI
import WidgetKit

/// Everything the widget draws, gathered once per refresh.
struct WidgetContent {
    var payit: PayitSnapshot?
    var weather: WeatherSnapshot?
    var wellness: WellnessSnapshot?
    /// True when the numbers were just fetched from the hub rather than remembered.
    var live: Bool
    var now: Date = Date()

    /// The newest time any of the numbers was read.
    var updatedAt: Date? { [payit?.updatedAt, weather?.updatedAt].compactMap { $0 }.max() }

    var hasAnything: Bool { payit != nil || weather != nil || stress != nil }

    var stress: StressReading? { StressReading(wellness) }
}

/// Stress as the widget shows it: from the watch estimate when there is one, else the latest check-in.
struct StressReading {
    /// 0 (calm) to 1 (very stressed).
    var level: Double
    var word: String
    /// "28" for the watch estimate; nil for a check-in.
    var number: String?
    /// Where it comes from, in a few words.
    var source: String

    init?(_ wellness: WellnessSnapshot?) {
        guard let w = wellness, w.isToday else { return nil }
        if let score = w.score {
            level = Double(score) / 100
            switch w.label {
            case "calm": word = "Calm"
            case "elevated": word = "Elevated"
            case "high": word = "High"
            default: word = "Typical"
            }
            number = String(score)
            source = w.learning ? "Watch · still learning" : "vs your usual"
        } else if let c = w.checkinStress, (1...5).contains(c) {
            level = [0.08, 0.28, 0.5, 0.74, 0.94][c - 1]
            word = ["None", "Low", "Some", "High", "Very high"][c - 1]
            number = nil
            source = "Your check-in"
        } else {
            return nil
        }
    }
}

extension WidgetContent {
    /// For the gallery, placeholders and the screenshots.
    static let sample = WidgetContent(
        payit: .sample, weather: .sample,
        wellness: WellnessSnapshot(day: WellnessSnapshot.dayKey(), score: 34, label: "typical", learning: false, checkinStress: 2,
                                   headline: "A normal day for you", steps: 6_240, updatedAt: Date()),
        live: true)
}

extension WeatherSnapshot {
    static let sample = WeatherSnapshot(
        unit: "F", temp: 72, feels: 74, code: 2, isDay: true, hi: 78, lo: 61, rainChance: 20,
        hours: [(14, 72, 2, 5), (15, 74, 1, 0), (16, 75, 0, 0), (17, 73, 0, 0), (18, 70, 61, 40), (19, 67, 61, 55), (20, 65, 3, 10), (21, 63, 3, 5)]
            .map { Hour(hour: $0.0, temp: Double($0.1), code: $0.2, rain: $0.3) },
        updatedAt: Date())
}

// MARK: The widget

struct DeskHubWidgetView: View {
    let family: WidgetFamily
    let content: WidgetContent
    let look: WidgetLook

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular: LockScreenLayout(content: content)
            case .systemMedium: MediumLayout(content: content, look: look)
            case .systemLarge, .systemExtraLarge: LargeLayout(content: content, look: look)
            default: SmallLayout(content: content, look: look)
            }
        }
        .widgetURL(URL(string: "deskhub://payit"))
    }
}

// MARK: Small

private struct SmallLayout: View {
    let content: WidgetContent
    let look: WidgetLook

    var body: some View {
        if !content.hasAnything {
            EmptyNote(look: look).padding(14)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                if let w = content.weather {
                    HStack(spacing: 6) {
                        WeatherIcon(code: w.code, day: w.isDay, look: look, size: 22)
                        Text(Temp.text(w.temp)).font(look.number(28)).foregroundStyle(look.text)
                        Spacer(minLength: 0)
                        if let hi = w.hi, let lo = w.lo {
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(Temp.text(hi)).foregroundStyle(look.text)
                                Text(Temp.text(lo)).foregroundStyle(look.muted)
                            }
                            .font(look.number(11, .medium))
                        }
                    }
                }
                Spacer(minLength: 4)
                if let p = content.payit {
                    Caption(text: "PAYIT", look: look, size: 9.5)
                    Text(Money.text(p.todayCents))
                        .font(look.number(28)).foregroundStyle(look.text)
                        .minimumScaleFactor(0.5).lineLimit(1)
                    VersusYesterday(payit: p, look: look, size: 10.5, short: true)
                }
                Spacer(minLength: 5)
                if let s = content.stress {
                    HStack(spacing: 6) {
                        Image(systemName: "waveform.path.ecg").font(.system(size: 11, weight: .semibold)).foregroundStyle(look.tint(forStress: s.level))
                        Text(s.word).font(look.label(11.5)).foregroundStyle(look.text).lineLimit(1).minimumScaleFactor(0.7)
                        Spacer(minLength: 0)
                        if let number = s.number {
                            Text(number).font(look.number(12, .medium)).foregroundStyle(look.text2)
                        }
                    }
                    .padding(.horizontal, 9).padding(.vertical, 6)
                    .lookPanel(look, radius: 10)
                } else {
                    Freshness(content: content, look: look)
                }
            }
            .padding(14)
        }
    }
}

// MARK: Medium (the long one)

private struct MediumLayout: View {
    let content: WidgetContent
    let look: WidgetLook

    var body: some View {
        if !content.hasAnything {
            EmptyNote(look: look).padding(16)
        } else {
            HStack(spacing: 8) {
                if let w = content.weather {
                    VStack(alignment: .leading, spacing: 0) {
                        WeatherIcon(code: w.code, day: w.isDay, look: look, size: 26)
                        Spacer(minLength: 2)
                        Text(Temp.text(w.temp)).font(look.number(36)).foregroundStyle(look.text)
                        Text(WeatherSnapshot.word(w.code)).font(look.label(11)).foregroundStyle(look.text2).lineLimit(1).minimumScaleFactor(0.8)
                        if let hi = w.hi, let lo = w.lo {
                            Text("H\(Temp.text(hi)) L\(Temp.text(lo))").font(look.number(11, .medium)).foregroundStyle(look.muted)
                                .padding(.top, 1)
                        }
                    }
                    .padding(11)
                    .frame(width: 96, alignment: .leading)
                    .frame(maxHeight: .infinity)
                    .lookPanel(look)
                }
                if let p = content.payit {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack {
                            Caption(text: "PAYIT", look: look, size: 9.5)
                            if p.systemIssues > 0 { IssueBadge(count: p.systemIssues, look: look) }
                            Spacer(minLength: 0)
                        }
                        Text(Money.text(p.todayCents))
                            .font(look.number(30)).foregroundStyle(look.text)
                            .minimumScaleFactor(0.5).lineLimit(1)
                            .padding(.top, 2)
                        Text(p.count == 1 ? "1 payment" : "\(p.count) payments")
                            .font(.system(size: 11.5)).foregroundStyle(look.text2)
                        Spacer(minLength: 4)
                        WeekBars(values: p.weekCents, look: look, height: 24, days: false, now: content.now)
                        VersusYesterday(payit: p, look: look, size: 10.5, short: true).padding(.top, 5)
                    }
                    .padding(11)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .lookPanel(look)
                }
                if let s = content.stress {
                    VStack(spacing: 4) {
                        Caption(text: "STRESS", look: look, size: 9.5)
                        Spacer(minLength: 0)
                        StressGauge(reading: s, look: look, size: 56)
                        Spacer(minLength: 0)
                        Text(s.word).font(look.label(12)).foregroundStyle(look.text)
                    }
                    .padding(.vertical, 11).padding(.horizontal, 6)
                    .frame(width: 84)
                    .frame(maxHeight: .infinity)
                    .lookPanel(look)
                }
            }
            .padding(10)
        }
    }
}

// MARK: Large

private struct LargeLayout: View {
    let content: WidgetContent
    let look: WidgetLook

    var body: some View {
        if !content.hasAnything {
            EmptyNote(look: look).padding(18)
        } else {
            VStack(spacing: 8) {
                if let w = content.weather { weather(w) }
                if let p = content.payit { payit(p) }
                if let s = content.stress { stress(s) }
                if content.weather == nil || content.payit == nil || content.stress == nil {
                    Freshness(content: content, look: look)
                }
            }
            .padding(12)
        }
    }

    private func weather(_ w: WeatherSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                WeatherIcon(code: w.code, day: w.isDay, look: look, size: 34)
                Text(Temp.text(w.temp)).font(look.number(46)).foregroundStyle(look.text).lineLimit(1).fixedSize()
                VStack(alignment: .leading, spacing: 1) {
                    Text(WeatherSnapshot.word(w.code)).font(look.label(13)).foregroundStyle(look.text).lineLimit(1).minimumScaleFactor(0.7)
                    if let feels = w.feels, abs(feels - w.temp) >= 2 {
                        Text("Feels \(Temp.text(feels))").font(.system(size: 11)).foregroundStyle(look.text2)
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 1) {
                    if let hi = w.hi, let lo = w.lo {
                        Text("H \(Temp.text(hi))  L \(Temp.text(lo))").font(look.number(12, .medium)).foregroundStyle(look.text)
                    }
                    if let rain = w.rainChance, rain >= 30 {
                        Label("\(rain)%", systemImage: "drop.fill").font(.system(size: 11, weight: .medium)).foregroundStyle(look.cool)
                    }
                }
            }
            Spacer(minLength: 6)
            HStack(spacing: 0) {
                ForEach(Array(w.hours.prefix(6).enumerated()), id: \.offset) { index, h in
                    VStack(spacing: 3) {
                        Text(index == 0 ? "Now" : Clock.hour(h.hour)).font(look.label(10)).foregroundStyle(look.muted)
                        WeatherIcon(code: h.code, day: (6..<20).contains(h.hour), look: look, size: 15)
                        Text(Temp.text(h.temp)).font(look.number(12.5, .medium)).foregroundStyle(look.text)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .lookPanel(look, radius: 18)
    }

    private func payit(_ p: PayitSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Caption(text: "PAYIT", look: look, size: 10)
                if p.systemIssues > 0 { IssueBadge(count: p.systemIssues, look: look) }
                Spacer(minLength: 0)
                VersusYesterday(payit: p, look: look, size: 11)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Money.text(p.todayCents))
                    .font(look.number(34)).foregroundStyle(look.text)
                    .minimumScaleFactor(0.5).lineLimit(1)
                Text(p.count == 1 ? "1 payment" : "\(p.count) payments").font(.system(size: 12)).foregroundStyle(look.text2)
                Spacer(minLength: 0)
            }
            Spacer(minLength: 4)
            WeekBars(values: p.weekCents, look: look, height: 30, days: true, now: content.now)
            if let paying = p.subsPaying {
                Text("PayIt Plus: \(paying) paying" + (p.subsMonthCents.map { " · \(Money.text($0)) this month" } ?? ""))
                    .font(.system(size: 11)).foregroundStyle(look.text2).lineLimit(1).minimumScaleFactor(0.8)
                    .padding(.top, 5)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .lookPanel(look, radius: 18)
    }

    private func stress(_ s: StressReading) -> some View {
        HStack(spacing: 14) {
            StressGauge(reading: s, look: look, size: 58)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Caption(text: "STRESS", look: look, size: 10)
                    Text(s.word).font(look.label(14)).foregroundStyle(look.text).lineLimit(1)
                }
                Text(content.wellness?.headline ?? s.source)
                    .font(.system(size: 12)).foregroundStyle(look.text2).lineLimit(2)
                if let steps = content.wellness?.steps, steps > 0 {
                    Label("\(Int(steps).formatted()) steps", systemImage: "figure.walk")
                        .font(.system(size: 11)).foregroundStyle(look.muted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .lookPanel(look, radius: 18)
    }
}

// MARK: Lock screen

private struct LockScreenLayout: View {
    let content: WidgetContent

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("PayIt").font(.system(size: 12, weight: .semibold))
            if let p = content.payit {
                Text(Money.text(p.todayCents)).font(.system(size: 22, weight: .semibold, design: .rounded)).minimumScaleFactor(0.6)
                Text(p.count == 1 ? "1 payment today" : "\(p.count) payments today").font(.system(size: 12))
            } else {
                Text("Open Desk Hub to connect").font(.system(size: 12))
            }
        }
    }
}

// MARK: Pieces

private struct Caption: View {
    let text: String
    let look: WidgetLook
    var size: CGFloat = 10

    var body: some View {
        Text(text).font(look.label(size)).tracking(look == .graphite ? 0.6 : 1.1).foregroundStyle(look.accent)
    }
}

private struct WeatherIcon: View {
    let code: Int
    let day: Bool
    let look: WidgetLook
    let size: CGFloat

    var body: some View {
        Image(systemName: WeatherSnapshot.symbol(code, day: day))
            .symbolRenderingMode(look.weatherSymbols)
            .font(.system(size: size))
            .foregroundStyle(look == .graphite ? look.accent : look.text)
            .frame(minWidth: size * 1.1)
    }
}

private struct VersusYesterday: View {
    let payit: PayitSnapshot
    let look: WidgetLook
    let size: CGFloat
    /// "12% vs yesterday" instead of "12% ahead of yesterday", for the narrow spots.
    var short = false

    var body: some View {
        if let change = payit.versusYesterday {
            let up = change >= 0
            let percent = Int((abs(change) * 100).rounded())
            Label(short ? "\(percent)% vs yesterday" : "\(percent)% \(up ? "ahead of" : "behind") yesterday", systemImage: up ? "arrow.up.right" : "arrow.down.right")
                .font(.system(size: size, weight: .medium))
                .foregroundStyle(up ? look.good : look.bad)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

private struct IssueBadge: View {
    let count: Int
    let look: WidgetLook

    var body: some View {
        Label("\(count)", systemImage: "exclamationmark.triangle.fill")
            .font(.system(size: 10, weight: .semibold)).foregroundStyle(look.warn)
    }
}

/// Seven bars, the last (today) in colour; with the weekday under each.
private struct WeekBars: View {
    let values: [Double]
    let look: WidgetLook
    let height: CGFloat
    let days: Bool
    let now: Date

    var body: some View {
        let top = max(values.max() ?? 0, 1)
        VStack(spacing: 3) {
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                    RoundedRectangle(cornerRadius: look == .graphite ? 1.5 : 3.5, style: .continuous)
                        .fill(index == values.count - 1 ? AnyShapeStyle(look.good) : AnyShapeStyle(look.text.opacity(0.26)))
                        .frame(height: max(3, height * value / top))
                }
            }
            .frame(height: height, alignment: .bottom)
            if days {
                HStack(spacing: 5) {
                    ForEach(Array(values.indices), id: \.self) { index in
                        Text(letter(daysAgo: values.count - 1 - index))
                            .font(look.label(8.5)).foregroundStyle(index == values.count - 1 ? look.text2 : look.muted)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func letter(daysAgo: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: -daysAgo, to: now) ?? now
        return String(date.formatted(.dateTime.weekday(.narrow)))
    }
}

/// The stress level as a ring (Aurora, Sky) or a level meter (Graphite), with the score in the middle.
private struct StressGauge: View {
    let reading: StressReading
    let look: WidgetLook
    let size: CGFloat

    var body: some View {
        let tint = look.tint(forStress: reading.level)
        if look == .graphite {
            VStack(spacing: 6) {
                Text(reading.number ?? reading.word)
                    .font(look.number(size * 0.5)).foregroundStyle(tint)
                    .minimumScaleFactor(0.5).lineLimit(1)
                Meter(level: reading.level, look: look)
                    .frame(width: size, height: max(8, size * 0.18))
            }
        } else {
            ZStack {
                Circle().stroke(Color.white.opacity(0.15), lineWidth: size * 0.12)
                Circle()
                    .trim(from: 0, to: max(0.04, reading.level))
                    .stroke(AngularGradient(colors: [look.good, tint], center: .center, startAngle: .degrees(0), endAngle: .degrees(360 * max(0.04, reading.level))),
                            style: StrokeStyle(lineWidth: size * 0.12, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                if let number = reading.number {
                    Text(number).font(look.number(size * 0.34)).foregroundStyle(look.text)
                } else {
                    Image(systemName: "heart.text.square.fill").font(.system(size: size * 0.3)).foregroundStyle(tint)
                }
            }
            .frame(width: size, height: size)
        }
    }
}

/// Ten ticks, filled up to the level and coloured green to red.
private struct Meter: View {
    let level: Double
    let look: WidgetLook

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<10, id: \.self) { index in
                let filled = Double(index) < (level * 10).rounded(.up)
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(filled ? look.tint(forStress: (Double(index) + 0.5) / 10) : Color.white.opacity(0.12))
            }
        }
    }
}

private struct Freshness: View {
    let content: WidgetContent
    let look: WidgetLook

    var body: some View {
        if let at = content.updatedAt {
            Text(content.live ? "Live" : "As of " + at.formatted(date: .omitted, time: .shortened))
                .font(.system(size: 10)).foregroundStyle(look.muted)
        }
    }
}

private struct EmptyNote: View {
    let look: WidgetLook

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Spacer(minLength: 0)
            Text("No numbers yet").font(.system(size: 16, weight: .semibold)).foregroundStyle(look.text)
            Text("Open Desk Hub on your home Wi-Fi once.").font(.system(size: 12)).foregroundStyle(look.text2)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: Formatting

enum Money {
    /// "$1,234" from $100 up, "$87.50" below.
    static func text(_ cents: Double) -> String {
        let dollars = cents / 100
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = dollars >= 100 ? 0 : 2
        f.minimumFractionDigits = f.maximumFractionDigits
        return f.string(from: dollars as NSNumber) ?? "$0"
    }
}

enum Temp {
    static func text(_ value: Double) -> String { "\(Int(value.rounded()))°" }
}

enum Clock {
    /// 15 is "3p", 0 is "12a".
    static func hour(_ h: Int) -> String { "\(h % 12 == 0 ? 12 : h % 12)\(h < 12 ? "a" : "p")" }
}
