#if DEBUG
import AppKit
import SwiftUI

/// Debug builds only. Run with CLAUDE_STATUS_SNAPSHOT=<folder> to fire a muted test alert,
/// save PNGs of the menu bar item and the pop-up there, and quit. Lets you check the
/// look without screen recording.
enum SelfCheck {
    @MainActor static func startIfRequested(_ store: SessionStore) {
        guard let folder = ProcessInfo.processInfo.environment["CLAUDE_STATUS_SNAPSHOT"] else { return }
        let output = URL(fileURLWithPath: folder)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            store.alerter.sendTest()
            for shot in 0..<3 {
                try? await Task.sleep(for: .milliseconds(shot == 0 ? 900 : 300))
                for (index, window) in NSApp.windows.enumerated() where window.isVisible {
                    guard let view = window.contentView, view.bounds.width > 0 else { continue }
                    let name = "\(shot)-\(index)-\(type(of: window))"
                    save(view, to: output.appendingPathComponent("\(name).png"))
                    print("\(name) \(view.bounds.size) flashing=\(store.alerter.isFlashing) phase=\(store.alerter.flashPhase)")
                }
            }
            // Windows drawn by SwiftUI don't show up in cacheDisplay, so render the views directly.
            // Glass doesn't render offscreen; a gradient stands in for the desktop behind it.
            render(ToastStack(center: store.alerter.toasts).frame(height: 230), "toasts", to: output)
            render(PanelView(store: store), "panel", to: output)
            // Scroll views don't render offscreen either, so draw the rows on their own.
            render(VStack(spacing: 6) {
                ForEach(store.chats.prefix(6)) { ChatRow(chat: $0, now: .now, isUnread: store.isUnread($0), store: store) }
            }.padding(14).frame(width: 368), "rows", to: output)
            NSApp.terminate(nil)
        }
    }

    @MainActor private static func render(_ view: some View, _ name: String, to folder: URL) {
        let backdrop = view.background(
            LinearGradient(colors: [.indigo, .teal], startPoint: .topLeading, endPoint: .bottomTrailing))
        let renderer = ImageRenderer(content: backdrop)
        renderer.scale = 2
        guard let image = renderer.cgImage else { return }
        let rep = NSBitmapImageRep(cgImage: image)
        try? rep.representation(using: .png, properties: [:])?.write(to: folder.appendingPathComponent("\(name).png"))
        print("\(name) \(image.width)x\(image.height)")
    }

    @MainActor private static func save(_ view: NSView, to url: URL) {
        guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
    }
}
#endif
