import AppKit
import SwiftUI

struct Toast: Identifiable, Equatable {
    enum Kind { case needs, done }

    let id: String
    let chatId: String?
    let kind: Kind
    let title: String
    let detail: String

    static func needs(_ chat: Chat, reason: String) -> Toast {
        Toast(id: "needs-\(chat.id)", chatId: chat.id, kind: .needs, title: chat.title,
              detail: [reason, chat.project].filter { !$0.isEmpty }.joined(separator: " · "))
    }

    static func done(_ chat: Chat) -> Toast {
        Toast(id: "done-\(chat.id)", chatId: chat.id, kind: .done, title: "\(chat.title) is done",
              detail: chat.preview ?? "Finished in \(chat.project)")
    }
}

/// Glass pop-ups that drop down from the top of the screen, below the menu bar.
/// "Needs you" pop-ups stay until you open or close them, or the chat moves on.
@MainActor
@Observable
final class ToastCenter {
    private(set) var toasts: [Toast] = []
    @ObservationIgnored var onOpen: (Toast) -> Void = { _ in }
    @ObservationIgnored var onDismiss: (Toast) -> Void = { _ in }

    @ObservationIgnored private var panel: ToastPanel?
    @ObservationIgnored private var expiry: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var layoutPending = false

    static let width: CGFloat = 420
    static let rowHeight: CGFloat = 58
    static let spacing: CGFloat = 8
    static let padding: CGFloat = 12
    static let maxShown = 4

    func contains(_ id: String) -> Bool { toasts.contains { $0.id == id } }

    /// Shows or updates a pop-up. With `seconds`, it closes itself after that long.
    func show(_ toast: Toast, for seconds: Double? = nil) {
        if let index = toasts.firstIndex(where: { $0.id == toast.id }) {
            toasts[index] = toast
        } else {
            toasts.insert(toast, at: 0)
            if toasts.count > Self.maxShown { toasts.removeLast(toasts.count - Self.maxShown) }
        }
        expiry[toast.id]?.cancel()
        expiry[toast.id] = seconds.map { seconds in
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(seconds))
                guard !Task.isCancelled else { return }
                self?.removeAll { $0.id == toast.id }
            }
        }
        scheduleLayout()
    }

    func open(_ toast: Toast) {
        removeAll { $0.id == toast.id }
        onOpen(toast)
    }

    func close(_ toast: Toast) {
        removeAll { $0.id == toast.id }
        onDismiss(toast)
    }

    func removeAll(where shouldRemove: (Toast) -> Bool) {
        let before = toasts.count
        toasts.removeAll(where: shouldRemove)
        if toasts.count != before { scheduleLayout() }
    }

    /// Resizing the window makes SwiftUI lay out right away, which it refuses to do in the
    /// middle of its own update (alerts can fire from there), so wait for the next turn.
    private func scheduleLayout() {
        guard !layoutPending else { return }
        layoutPending = true
        Task { @MainActor [weak self] in
            self?.layoutPending = false
            self?.layout()
        }
    }

    private func layout() {
        let panel = self.panel ?? makePanel()
        guard !toasts.isEmpty else {
            // Let the slide-out animation finish before hiding the window.
            Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(450))
                if self?.toasts.isEmpty == true { panel.orderOut(nil) }
            }
            return
        }
        let count = CGFloat(toasts.count)
        let height = Self.padding * 2 + count * Self.rowHeight + (count - 1) * Self.spacing
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        guard let area = screen?.visibleFrame else { return }
        let frame = NSRect(x: area.midX - Self.width / 2, y: area.maxY - height, width: Self.width, height: height)
        // Grow right away; shrink after the row has animated out.
        if height >= panel.frame.height || !panel.isVisible {
            panel.setFrame(frame, display: true)
        } else {
            Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(450))
                if self?.toasts.count == Int(count) { panel.setFrame(frame, display: true) }
            }
        }
        panel.orderFrontRegardless()
    }

    private func makePanel() -> ToastPanel {
        let panel = ToastPanel(
            contentRect: NSRect(x: 0, y: 0, width: Self.width, height: 100),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.contentView = FirstClickHostingView(rootView: ToastStack(center: self))
        self.panel = panel
        return panel
    }
}

/// Never takes focus away from what you're doing.
final class ToastPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// Buttons in a window that never becomes key still need to react to the first click.
final class FirstClickHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

struct ToastStack: View {
    let center: ToastCenter

    var body: some View {
        GlassEffectContainer(spacing: ToastCenter.spacing / 2) {
            VStack(spacing: ToastCenter.spacing) {
                ForEach(center.toasts) { toast in
                    ToastRow(toast: toast, center: center)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .padding(ToastCenter.padding)
        .frame(width: ToastCenter.width)
        .frame(maxHeight: .infinity, alignment: .top)
        .animation(.spring(duration: 0.4, bounce: 0.25), value: center.toasts)
    }
}

struct ToastRow: View {
    let toast: Toast
    let center: ToastCenter

    private var tint: Color { toast.kind == .needs ? .orange : .green }

    var body: some View {
        HStack(spacing: 12) {
            StatusGlyph(state: toast.kind == .needs ? .needsInput("") : .done)

            VStack(alignment: .leading, spacing: 2) {
                Text(toast.title)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Text(toast.detail)
                    .font(.system(size: 11.5))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 6)

            Button("Open") { center.open(toast) }
                .buttonStyle(.glassProminent)
                .tint(tint)
                .controlSize(.small)
                .disabled(toast.chatId == nil)
            Button { center.close(toast) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .frame(width: 10, height: 10)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .controlSize(.small)
            .help("Dismiss")
        }
        .padding(.horizontal, 12)
        .frame(height: ToastCenter.rowHeight)
        .glassEffect(.regular.tint(tint.opacity(0.18)), in: .capsule)
        .contentShape(.capsule)
        .onTapGesture { center.open(toast) }
    }
}

/// The orange menu bar badge shown while chats need you. The outlined version
/// alternates with the filled one to make the badge flash.
enum MenuBarBadge {
    @MainActor private static var cache: [String: NSImage] = [:]

    @MainActor static func image(count: Int, outlined: Bool) -> NSImage {
        let key = "\(count)-\(outlined)"
        if let image = cache[key] { return image }

        let orange = NSColor.systemOrange
        let ink = outlined ? orange : .white
        let text = NSAttributedString(string: "\(count)", attributes: [
            .font: NSFont.systemFont(ofSize: 12, weight: .bold), .foregroundColor: ink,
        ])
        let symbol = NSImage(systemSymbolName: "hand.raised.fill", accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 10.5, weight: .bold)
                .applying(NSImage.SymbolConfiguration(paletteColors: [ink])))
        let symbolSize = symbol?.size ?? .zero
        let height: CGFloat = 18
        let width = ceil(7 + symbolSize.width + 4 + text.size().width + 8)

        let scale: CGFloat = 2
        let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: Int(width * scale), pixelsHigh: Int(height * scale),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        rep.size = NSSize(width: width, height: height)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        let pill = NSBezierPath(roundedRect: NSRect(x: 0.75, y: 0.75, width: width - 1.5, height: height - 1.5),
                                xRadius: (height - 1.5) / 2, yRadius: (height - 1.5) / 2)
        if outlined {
            orange.setStroke()
            pill.lineWidth = 1.5
            pill.stroke()
        } else {
            orange.setFill()
            pill.fill()
        }
        symbol?.draw(in: NSRect(x: 7, y: (height - symbolSize.height) / 2,
                                width: symbolSize.width, height: symbolSize.height))
        text.draw(at: NSPoint(x: 7 + symbolSize.width + 4, y: (height - text.size().height) / 2))
        NSGraphicsContext.restoreGraphicsState()

        let image = NSImage(size: rep.size)
        image.addRepresentation(rep)
        image.isTemplate = false
        cache[key] = image
        return image
    }
}
