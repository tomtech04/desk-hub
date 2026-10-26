import SwiftUI
import WebKit

/// The workstation (the hub's laptop layout) in a window of its own. While the window is open the
/// app has a Dock icon; closed, it goes back to being just the menu bar item.
struct HubWindow: View {
    static let id = "main"
    @MainActor static var opener: (() -> Void)?

    @MainActor static func show() {
        NSApp.setActivationPolicy(.regular)
        opener?()
        NSApp.activate()
    }

    @State private var web = WebModel()

    var body: some View {
        HubWebView(view: web.view)
            .frame(minWidth: 1100, minHeight: 680)
            .background(Color(red: 12 / 255, green: 14 / 255, blue: 18 / 255))
            .overlay {
                if let problem = web.problem {
                    VStack(spacing: 12) {
                        Image(systemName: "wifi.exclamationmark").font(.system(size: 30)).foregroundStyle(.secondary)
                        Text("Can't reach your hub").font(.title3.weight(.semibold))
                        Text(problem).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 420)
                        Button("Try Again") { web.load() }.buttonStyle(.glassProminent)
                    }
                    .padding(28)
                    .glassEffect(.regular, in: .rect(cornerRadius: 24))
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button { web.view.reload() } label: { Label("Reload", systemImage: "arrow.clockwise") }
                        .keyboardShortcut("r", modifiers: .command)
                        .help("Reload the hub")
                    Button { if let url = web.view.url { NSWorkspace.shared.open(url) } } label: { Label("Open in Browser", systemImage: "safari") }
                        .help("Open the hub in your browser")
                }
            }
            .navigationTitle("Desk Hub")
            .onAppear { NSApp.setActivationPolicy(.regular) }
            // Closing the window keeps the app running in the menu bar, without a Dock icon.
            .onDisappear { NSApp.setActivationPolicy(.accessory) }
    }
}

private struct HubWebView: NSViewRepresentable {
    let view: WKWebView
    func makeNSView(context: Context) -> WKWebView { view }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

/// Holds the web view, so it (and your sign-in) survive the window closing and reopening.
@MainActor
@Observable
final class WebModel: NSObject, WKUIDelegate, WKNavigationDelegate {
    let view: WKWebView
    private(set) var problem: String?

    /// The hub's address: set by the installer (`defaults write … hubURL`), else the one the
    /// mail sync uses, else the usual address on the home network.
    static var hubURL: URL {
        if let saved = UserDefaults.standard.string(forKey: "hubURL"), let url = URL(string: saved) { return url }
        if let data = try? Data(contentsOf: HubSync.configFile),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let hub = json["hub"] as? String, let url = URL(string: hub) { return url }
        return URL(string: "http://deskhub.local:8080")!
    }

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // keeps you signed in to the hub
        view = WKWebView(frame: .zero, configuration: config)
        super.init()
        view.uiDelegate = self
        view.navigationDelegate = self
        view.underPageBackgroundColor = NSColor(red: 12 / 255, green: 14 / 255, blue: 18 / 255, alpha: 1)
        view.setValue(false, forKey: "drawsBackground") // no white flash before the page paints
        view.allowsBackForwardNavigationGestures = false
        load()
    }

    func load() {
        problem = nil
        view.load(URLRequest(url: Self.hubURL))
    }

    // Links out of the hub (an email's links, the hub's own "open in new tab") go to your browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, navigationAction.targetFrame?.isMainFrame == true,
              let host = url.host, host != Self.hubURL.host, ["http", "https"].contains(url.scheme ?? "") else { return .allow }
        NSWorkspace.shared.open(url)
        return .cancel
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { problem = error.localizedDescription }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { problem = error.localizedDescription }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { problem = nil }

    /// "Record a note" uses the microphone; the hub itself may ask, nothing else.
    func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin, initiatedBy frame: WKFrameInfo,
                 type: WKMediaCaptureType) async -> WKPermissionDecision {
        origin.host == Self.hubURL.host ? .grant : .deny
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        return alert.runModal() == .alertFirstButtonReturn
    }
}
