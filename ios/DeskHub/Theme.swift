import SwiftUI

/// Graphite, the hub's look (mockups/graphite-spec.md): a near-black base, solid panels with a
/// hairline border, and colour only in short gradients, one per section.
enum G {
    static let bg = Color(hex: 0x0C0E12)
    static let panel = Color(hex: 0x15181D)
    static let panel2 = Color(hex: 0x1C2027)
    static let control = Color(hex: 0x1F232A)
    static let line = Color(hex: 0x232831)
    static let lineSoft = Color(hex: 0x20242B)
    static let track = Color(hex: 0x22262D)
    static let text = Color(hex: 0xF2F4F7)
    static let title = Color(hex: 0xD4D9E1)
    static let text2 = Color(hex: 0xAEB5C1)
    static let text3 = Color(hex: 0x8C94A1)
    static let muted = Color(hex: 0x7A8290)
    static let amber = Color(hex: 0xFFB547)
    static let mint = Color(hex: 0x6EF0B4)
    static let coral = Color(hex: 0xFF7A7A)
    static let blue = Color(hex: 0x8AB4FF)
    static let violet = Color(hex: 0xC59CFF)
    static let pink = Color(hex: 0xFF9DB0)

    static let focus = gradient(0xFFC65C, 0xFF7A45)
    static let tasks = gradient(0xFFE07A, 0xFFAE45)
    static let money = gradient(0x6EF0B4, 0x1FB5C9)
    static let mail = gradient(0xC59CFF, 0xFF8DB9)
    static let journal = gradient(0xFF9DB0, 0xFF9354)
    static let cal = gradient(0x8AB4FF, 0x8C7BFF)
    static let bad = gradient(0xFF9A8A, 0xFF5F6D)
    static let white = gradient(0xFFFFFF, 0xD4D9E1)

    /// Thin outlines for Claude's cards (mail digest, recap).
    static let aiMail = LinearGradient(colors: [Color(hex: 0xC59CFF, alpha: 0.7), Color(hex: 0xFF8DB9, alpha: 0.5)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let aiJournal = LinearGradient(colors: [Color(hex: 0xFF9DB0, alpha: 0.7), Color(hex: 0xFF9354, alpha: 0.5)], startPoint: .topLeading, endPoint: .bottomTrailing)

    static let heroDay = LinearGradient(colors: [Color(hex: 0x1C44B0), Color(hex: 0x2C6FD0), Color(hex: 0x1B93A8)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let heroDusk = LinearGradient(colors: [Color(hex: 0x3B2377), Color(hex: 0x93407A), Color(hex: 0xD9683E)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let heroPayit = LinearGradient(colors: [Color(hex: 0x0E5C52), Color(hex: 0x0F3F45), Color(hex: 0x12262E)], startPoint: .topLeading, endPoint: .bottomTrailing)

    static func tag(_ name: String?) -> Color {
        switch name {
        case "School": return blue
        case "PayIt": return Color(hex: 0x5EE6B0)
        case "Personal": return violet
        default: return muted
        }
    }

    static func gradient(_ a: UInt32, _ b: UInt32) -> LinearGradient {
        LinearGradient(colors: [Color(hex: a), Color(hex: b)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

/// A Graphite panel: solid, hairline border, 22pt corners. AI cards get a gradient outline.
struct Card<Content: View>: View {
    private let outline: AnyShapeStyle
    private let content: Content

    init(outline: LinearGradient? = nil, @ViewBuilder content: () -> Content) {
        self.outline = outline.map { AnyShapeStyle($0) } ?? AnyShapeStyle(G.line)
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(G.panel, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(outline, lineWidth: 1))
    }
}

/// Card title row: a gradient icon tile, the title, and mono metadata on the right.
struct CardHeader: View {
    let icon: String
    let title: String
    let gradient: LinearGradient
    var meta: String?
    var metaColor: Color = G.muted

    var body: some View {
        HStack(spacing: 10) {
            IconTile(icon: icon, gradient: gradient)
            Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(G.title)
            Spacer(minLength: 8)
            if let meta {
                Text(meta).font(G.mono(12)).foregroundStyle(metaColor).lineLimit(1)
            }
        }
    }
}

struct IconTile: View {
    let icon: String
    let gradient: LinearGradient
    var size: CGFloat = 30

    var body: some View {
        Image(systemName: icon)
            .font(.system(size: size * 0.48, weight: .semibold))
            .foregroundStyle(G.bg)
            .frame(width: size, height: size)
            .background(gradient, in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
    }
}

/// The round check used for tasks and steps; mint when done.
struct CheckCircle: View {
    let done: Bool
    var size: CGFloat = 26

    var body: some View {
        ZStack {
            Circle().strokeBorder(done ? Color.clear : Color(hex: 0x3A404B), lineWidth: 2)
            if done {
                Circle().fill(G.money)
                Image(systemName: "checkmark").font(.system(size: size * 0.45, weight: .bold)).foregroundStyle(Color(hex: 0x06231A))
            }
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
    }
}

/// A small mono label in a tinted capsule ("▲ 16%", "Today").
struct Pill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(G.mono(12, .medium))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.14), in: Capsule())
    }
}

/// Primary (near-white) and secondary (dark) buttons from the spec.
struct GraphiteButton: ButtonStyle {
    var primary = true
    var fill: LinearGradient?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(primary ? G.bg : G.text)
            .padding(.horizontal, 18)
            .frame(minHeight: 46)
            .background(background, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(primary ? Color.clear : Color(hex: 0x2C313A), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.75 : 1)
    }

    private var background: AnyShapeStyle {
        if let fill { return AnyShapeStyle(fill) }
        return primary ? AnyShapeStyle(G.text) : AnyShapeStyle(G.control)
    }
}

/// Section label above a group of rows, mono and uppercase like the hub's Settings.
struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(G.mono(11, .medium))
            .tracking(1)
            .foregroundStyle(G.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)
    }
}

extension View {
    /// The screen background and dark bars every page shares.
    func graphitePage() -> some View {
        background(G.bg.ignoresSafeArea())
    }
}
