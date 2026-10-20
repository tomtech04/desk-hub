import AppIntents
import SwiftUI

/// The three looks of the Desk Hub widget, picked in Edit Widget > Style.
enum WidgetLook: String, AppEnum, CaseIterable {
    /// Deep night with soft violet, teal and pink glows, and frosted panels.
    case aurora
    /// Near-black with hairlines and monospaced labels, like the hub's own screen.
    case graphite
    /// The sky outside: the background follows the weather and the time of day.
    case sky

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Style"
    static var caseDisplayRepresentations: [WidgetLook: DisplayRepresentation] = [
        .aurora: "Aurora", .graphite: "Graphite", .sky: "Sky",
    ]
}

extension WidgetLook {
    var text: Color { Color(red: 0.96, green: 0.97, blue: 0.99) }
    var text2: Color { Color.white.opacity(self == .sky ? 0.84 : 0.70) }
    var muted: Color { Color.white.opacity(self == .sky ? 0.64 : 0.46) }

    /// Calm, ahead of yesterday, up and running.
    var good: Color {
        switch self {
        case .aurora: return Color(red: 0.36, green: 0.96, blue: 0.80)
        case .graphite: return Color(red: 0.43, green: 0.94, blue: 0.71)
        case .sky: return Color(red: 0.76, green: 1.0, blue: 0.87)
        }
    }

    /// Typical: neither good nor worrying.
    var cool: Color {
        switch self {
        case .aurora: return Color(red: 0.55, green: 0.80, blue: 1.0)
        case .graphite: return Color(red: 0.62, green: 0.78, blue: 0.92)
        case .sky: return Color(red: 0.92, green: 0.97, blue: 1.0)
        }
    }

    var warn: Color { Color(red: 1.0, green: 0.76, blue: 0.34) }
    var bad: Color { Color(red: 1.0, green: 0.50, blue: 0.54) }

    /// Section labels.
    var accent: Color {
        switch self {
        case .aurora: return Color(red: 0.74, green: 0.66, blue: 1.0)
        case .graphite: return Color(red: 0.43, green: 0.94, blue: 0.71)
        case .sky: return Color.white.opacity(0.9)
        }
    }

    var numberDesign: Font.Design { self == .graphite ? .monospaced : .rounded }

    /// Monospaced digits run wide, so Graphite's are set a little smaller.
    func number(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: self == .graphite ? size * 0.88 : size, weight: weight, design: numberDesign)
    }

    func label(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: self == .graphite ? .monospaced : .rounded)
    }

    /// Green, blue, amber or red for a stress level from 0 to 1.
    func tint(forStress level: Double) -> Color {
        level < 0.35 ? good : level < 0.6 ? cool : level < 0.75 ? warn : bad
    }

    var weatherSymbols: SymbolRenderingMode { self == .graphite ? .monochrome : .multicolor }
}

// MARK: Backgrounds

extension WidgetLook {
    @ViewBuilder func background(weather: WeatherSnapshot?) -> some View {
        switch self {
        case .aurora: AuroraBackground()
        case .graphite: GraphiteBackground()
        case .sky: SkyBackground(weather: weather)
        }
    }
}

private struct AuroraBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.035, green: 0.04, blue: 0.13), Color(red: 0.08, green: 0.05, blue: 0.20)],
                           startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Color(red: 0.50, green: 0.36, blue: 1.0).opacity(0.60), .clear],
                           center: UnitPoint(x: 0.08, y: 0.02), startRadius: 0, endRadius: 260)
            RadialGradient(colors: [Color(red: 0.10, green: 0.85, blue: 0.75).opacity(0.42), .clear],
                           center: UnitPoint(x: 1.0, y: 0.55), startRadius: 0, endRadius: 240)
            RadialGradient(colors: [Color(red: 1.0, green: 0.38, blue: 0.80).opacity(0.34), .clear],
                           center: UnitPoint(x: 0.25, y: 1.05), startRadius: 0, endRadius: 230)
        }
    }
}

private struct GraphiteBackground: View {
    var body: some View {
        ZStack {
            Color(red: 0.045, green: 0.05, blue: 0.06)
            RadialGradient(colors: [Color(red: 0.43, green: 0.94, blue: 0.71).opacity(0.10), .clear],
                           center: .topLeading, startRadius: 0, endRadius: 220)
            // A faint dot grid, the way the hub's screen is drawn.
            Canvas { context, size in
                let step: CGFloat = 12
                var y: CGFloat = 6
                while y < size.height {
                    var x: CGFloat = 6
                    while x < size.width {
                        context.fill(Path(ellipseIn: CGRect(x: x - 0.6, y: y - 0.6, width: 1.2, height: 1.2)), with: .color(.white.opacity(0.07)))
                        x += step
                    }
                    y += step
                }
            }
        }
    }
}

/// The sky for the current weather, by day or night.
private struct SkyBackground: View {
    let weather: WeatherSnapshot?

    private enum Kind { case clear, cloudy, rain, snow, storm }

    private var kind: Kind {
        switch weather?.code ?? 0 {
        case 0, 1, 2: return .clear
        case 51...67, 80...82: return .rain
        case 71...77, 85, 86: return .snow
        case 95...99: return .storm
        default: return .cloudy
        }
    }

    private var day: Bool { weather?.isDay ?? true }

    private var colors: [Color] {
        func c(_ r: Double, _ g: Double, _ b: Double) -> Color { Color(red: r, green: g, blue: b) }
        switch (kind, day) {
        case (.clear, true): return [c(0.13, 0.42, 0.88), c(0.42, 0.74, 0.98)]
        case (.clear, false): return [c(0.03, 0.04, 0.17), c(0.13, 0.13, 0.40)]
        case (.cloudy, true): return [c(0.30, 0.42, 0.58), c(0.52, 0.62, 0.74)]
        case (.cloudy, false): return [c(0.08, 0.10, 0.18), c(0.20, 0.23, 0.33)]
        case (.rain, true): return [c(0.16, 0.24, 0.36), c(0.30, 0.41, 0.54)]
        case (.rain, false): return [c(0.05, 0.08, 0.14), c(0.14, 0.20, 0.29)]
        case (.snow, true): return [c(0.33, 0.45, 0.62), c(0.56, 0.67, 0.82)]
        case (.snow, false): return [c(0.10, 0.14, 0.24), c(0.28, 0.36, 0.50)]
        case (.storm, _): return [c(0.11, 0.09, 0.22), c(0.29, 0.22, 0.42)]
        }
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: colors, startPoint: .top, endPoint: .bottom)
            if kind == .clear && day {
                RadialGradient(colors: [Color(red: 1.0, green: 0.88, blue: 0.55).opacity((weather?.code ?? 0) == 2 ? 0.42 : 0.65), .clear],
                               center: UnitPoint(x: 0.95, y: 0.0), startRadius: 0, endRadius: 190)
            } else if kind == .clear {
                Stars()
                RadialGradient(colors: [Color(red: 0.70, green: 0.75, blue: 1.0).opacity(0.28), .clear],
                               center: UnitPoint(x: 0.95, y: 0.0), startRadius: 0, endRadius: 150)
            } else if kind == .rain || kind == .storm {
                Rain()
            }
        }
    }
}

private struct Stars: View {
    var body: some View {
        Canvas { context, size in
            // Fixed positions, so the sky doesn't shuffle on every refresh.
            let spots: [(Double, Double, Double)] = [
                (0.06, 0.06, 1.1), (0.40, 0.04, 0.9), (0.62, 0.05, 1.2), (0.90, 0.30, 0.9), (0.95, 0.52, 1.0),
                (0.04, 0.46, 0.9), (0.97, 0.88, 1.1), (0.50, 0.97, 0.9), (0.07, 0.93, 1.0),
            ]
            for (x, y, r) in spots {
                context.fill(Path(ellipseIn: CGRect(x: x * size.width - r, y: y * size.height - r, width: r * 2, height: r * 2)),
                             with: .color(.white.opacity(0.6)))
            }
        }
    }
}

private struct Rain: View {
    var body: some View {
        Canvas { context, size in
            var x: CGFloat = 8
            var row = 0
            while x < size.width + size.height {
                var y: CGFloat = CGFloat((row * 23) % 40) - 20
                while y < size.height {
                    var line = Path()
                    line.move(to: CGPoint(x: x - y * 0.25, y: y))
                    line.addLine(to: CGPoint(x: x - y * 0.25 - 3, y: y + 12))
                    context.stroke(line, with: .color(.white.opacity(0.10)), lineWidth: 1)
                    y += 46
                }
                x += 19
                row += 1
            }
        }
    }
}

// MARK: Panels

private struct LookPanel: ViewModifier {
    let look: WidgetLook
    let radius: CGFloat

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        switch look {
        case .aurora:
            content.background(
                shape.fill(LinearGradient(colors: [.white.opacity(0.13), .white.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(shape.strokeBorder(LinearGradient(colors: [.white.opacity(0.32), .white.opacity(0.04)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 0.8))
            )
        case .graphite:
            content.background(
                shape.fill(Color.white.opacity(0.035)).overlay(shape.strokeBorder(Color.white.opacity(0.11), lineWidth: 0.7))
            )
        case .sky:
            content.background(
                shape.fill(Color.white.opacity(0.15)).overlay(shape.strokeBorder(Color.white.opacity(0.22), lineWidth: 0.7))
            )
        }
    }
}

extension View {
    func lookPanel(_ look: WidgetLook, radius: CGFloat = 16) -> some View {
        modifier(LookPanel(look: look, radius: radius))
    }
}
