import SwiftUI
import WidgetKit

@main
struct DeskHubWidgets: WidgetBundle {
    var body: some Widget {
        PayitWidget()
    }
}

/// PayIt on the home screen: today's sales, against yesterday, and the week.
struct PayitWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "payit", provider: PayitProvider()) { entry in
            PayitWidgetView(entry: entry)
                .containerBackground(for: .widget) { PayitStyle.background }
        }
        .configurationDisplayName("PayIt")
        .description("Today's sales, how they compare with yesterday, and the week.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct PayitEntry: TimelineEntry {
    let date: Date
    let snapshot: PayitSnapshot?
    /// True when the numbers were just fetched from the hub rather than remembered.
    let live: Bool
}

struct PayitProvider: TimelineProvider {
    func placeholder(in context: Context) -> PayitEntry {
        PayitEntry(date: Date(), snapshot: .sample, live: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (PayitEntry) -> Void) {
        completion(PayitEntry(date: Date(), snapshot: context.isPreview ? .sample : Shared.payit, live: context.isPreview))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PayitEntry>) -> Void) {
        Task {
            let live = try? await PayitSnapshot.fetch()
            if let live { Shared.payit = live }
            let entry = PayitEntry(date: Date(), snapshot: live ?? Shared.payit, live: live != nil)
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
        }
    }
}

// MARK: Views

struct PayitWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PayitEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular: lockScreen
            case .systemMedium: medium
            default: small
            }
        }
        .widgetURL(URL(string: "deskhub://payit"))
    }

    // MARK: Small

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Spacer(minLength: 4)
            if let s = entry.snapshot {
                Text(PayitStyle.money(s.todayCents))
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .foregroundStyle(PayitStyle.text)
                    .minimumScaleFactor(0.5).lineLimit(1)
                Text(s.count == 1 ? "1 payment today" : "\(s.count) payments today")
                    .font(.system(size: 13)).foregroundStyle(PayitStyle.text2)
                Spacer(minLength: 6)
                versus(s)
            } else {
                empty
            }
        }
    }

    // MARK: Medium

    private var medium: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                header
                Spacer(minLength: 4)
                if let s = entry.snapshot {
                    Text(PayitStyle.money(s.todayCents))
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                        .foregroundStyle(PayitStyle.text)
                        .minimumScaleFactor(0.5).lineLimit(1)
                    Text(s.count == 1 ? "1 payment today" : "\(s.count) payments today")
                        .font(.system(size: 13)).foregroundStyle(PayitStyle.text2)
                    Spacer(minLength: 6)
                    versus(s)
                } else {
                    empty
                }
            }
            if let s = entry.snapshot {
                VStack(alignment: .leading, spacing: 6) {
                    Text("LAST 7 DAYS").font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundStyle(PayitStyle.muted)
                    bars(s.weekCents)
                    if let paying = s.subsPaying {
                        Text("PayIt Plus: \(paying) paying" + (s.subsMonthCents.map { " · \(PayitStyle.money($0)) this month" } ?? ""))
                            .font(.system(size: 11)).foregroundStyle(PayitStyle.text2)
                            .lineLimit(2).minimumScaleFactor(0.8)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: Lock screen

    private var lockScreen: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("PayIt").font(.system(size: 12, weight: .semibold))
            if let s = entry.snapshot {
                Text(PayitStyle.money(s.todayCents)).font(.system(size: 22, weight: .semibold, design: .rounded)).minimumScaleFactor(0.6)
                Text(s.count == 1 ? "1 payment today" : "\(s.count) payments today").font(.system(size: 12))
            } else {
                Text("Open Desk Hub to connect").font(.system(size: 12))
            }
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(spacing: 6) {
            Text("PAYIT").font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundStyle(PayitStyle.mint)
            if let s = entry.snapshot, s.systemIssues > 0 {
                Label("\(s.systemIssues)", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 10, weight: .semibold)).foregroundStyle(PayitStyle.amber)
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder private func versus(_ s: PayitSnapshot) -> some View {
        if let change = s.versusYesterday {
            let up = change >= 0
            Label("\(Int((abs(change) * 100).rounded()))% \(up ? "ahead of" : "behind") yesterday", systemImage: up ? "arrow.up.right" : "arrow.down.right")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(up ? PayitStyle.mint : PayitStyle.coral)
                .lineLimit(1).minimumScaleFactor(0.7)
        } else {
            freshness(s)
        }
    }

    private func freshness(_ s: PayitSnapshot) -> some View {
        Text(entry.live ? "Live" : "As of " + s.updatedAt.formatted(date: .omitted, time: .shortened))
            .font(.system(size: 11)).foregroundStyle(PayitStyle.muted)
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("No numbers yet").font(.system(size: 16, weight: .semibold)).foregroundStyle(PayitStyle.text)
            Text("Open Desk Hub on your home Wi-Fi once.").font(.system(size: 12)).foregroundStyle(PayitStyle.text2)
        }
    }

    /// Seven bars, the last (today) in colour.
    private func bars(_ values: [Double]) -> some View {
        let top = max(values.max() ?? 0, 1)
        return HStack(alignment: .bottom, spacing: 4) {
            ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(index == values.count - 1 ? PayitStyle.mint : PayitStyle.text.opacity(0.28))
                    .frame(height: max(4, 54 * value / top))
            }
        }
        .frame(height: 54, alignment: .bottom)
    }
}

// MARK: Look

enum PayitStyle {
    static let text = Color(red: 0.95, green: 0.96, blue: 0.97)
    static let text2 = Color(red: 0.68, green: 0.71, blue: 0.76)
    static let muted = Color(red: 0.48, green: 0.51, blue: 0.56)
    static let mint = Color(red: 0.43, green: 0.94, blue: 0.71)
    static let amber = Color(red: 1.0, green: 0.71, blue: 0.28)
    static let coral = Color(red: 1.0, green: 0.48, blue: 0.48)
    static let background = LinearGradient(
        colors: [Color(red: 0.055, green: 0.36, blue: 0.32), Color(red: 0.06, green: 0.25, blue: 0.27), Color(red: 0.07, green: 0.15, blue: 0.18)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    /// "$1,234" from $100 up, "$87.50" below.
    static func money(_ cents: Double) -> String {
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

extension PayitSnapshot {
    /// For the widget gallery and placeholders.
    static let sample = PayitSnapshot(
        todayCents: 184_250, count: 47, yesterdaySameTimeCents: 163_900,
        weekCents: [182_000, 241_500, 198_300, 265_000, 301_200, 227_900, 184_250],
        subsPaying: 38, subsMonthCents: 92_969, systemIssues: 0, updatedAt: Date())
}
