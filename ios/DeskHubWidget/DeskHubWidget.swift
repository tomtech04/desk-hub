import AppIntents
import SwiftUI
import WidgetKit

@main
struct DeskHubWidgets: WidgetBundle {
    var body: some Widget {
        DeskHubWidget()
    }
}

/// Weather, PayIt and stress on the home and lock screens. The widget keeps its old "payit" kind so
/// the copy already on the home screen carries over.
struct DeskHubWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "payit", intent: DeskHubIntent.self, provider: DeskHubProvider()) { entry in
            DeskHubWidgetView(family: entry.family, content: entry.content, look: entry.look)
                .containerBackground(for: .widget) { entry.look.background(weather: entry.content.weather) }
        }
        .configurationDisplayName("Desk Hub")
        .description("Weather, PayIt and stress in one place. Press and hold the widget, then Edit Widget, to pick a style.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}

struct DeskHubIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Desk Hub"
    static var description = IntentDescription("Choose how the widget looks.")

    @Parameter(title: "Style", default: .aurora)
    var look: WidgetLook
}

struct DeskHubEntry: TimelineEntry {
    let date: Date
    let family: WidgetFamily
    let content: WidgetContent
    let look: WidgetLook
}

struct DeskHubProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> DeskHubEntry {
        DeskHubEntry(date: Date(), family: context.family, content: .sample, look: .aurora)
    }

    func snapshot(for configuration: DeskHubIntent, in context: Context) async -> DeskHubEntry {
        DeskHubEntry(date: Date(), family: context.family, content: context.isPreview ? .sample : Self.remembered(live: false), look: configuration.look)
    }

    func timeline(for configuration: DeskHubIntent, in context: Context) async -> Timeline<DeskHubEntry> {
        var live = false
        if let data = (try? await HubDashboard.fetch()) ?? nil {
            if let payit = PayitSnapshot.parse(dashboard: data) { Shared.payit = payit; live = true }
            if let weather = WeatherSnapshot.parse(dashboard: data) { Shared.weather = weather; live = true }
        }
        let entry = DeskHubEntry(date: Date(), family: context.family, content: Self.remembered(live: live), look: configuration.look)
        return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60)))
    }

    /// What the app and earlier refreshes left in the App Group.
    private static func remembered(live: Bool) -> WidgetContent {
        WidgetContent(payit: Shared.payit, weather: Shared.weather, wellness: Shared.wellness, live: live)
    }
}

extension PayitSnapshot {
    /// For the widget gallery and placeholders.
    static let sample = PayitSnapshot(
        todayCents: 184_250, count: 47, yesterdaySameTimeCents: 163_900,
        weekCents: [182_000, 241_500, 198_300, 265_000, 301_200, 227_900, 184_250],
        subsPaying: 38, subsMonthCents: 92_969, systemIssues: 0, updatedAt: Date())
}
