import SwiftUI
import WebKit

/// The hub itself, in its phone layout, the same page as in Safari but signed in for good.
struct HubView: View {
    @EnvironmentObject private var settings: HubSettings

    var body: some View {
        ZStack {
            Color.graphite.ignoresSafeArea()
            if let url = settings.baseURL {
                HubWebView(url: url)
            } else {
                ContentUnavailableView("No hub address", systemImage: "network", description: Text("Add your hub's address on the Ring tab."))
            }
        }
    }
}

struct HubWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "DeskHubApp"
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(Color.graphite)
        web.scrollView.backgroundColor = UIColor(Color.graphite)
        web.isInspectable = true
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pulled), for: .valueChanged)
        web.scrollView.refreshControl = refresh
        context.coordinator.web = web
        context.coordinator.load(url)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if context.coordinator.hubURL != url { context.coordinator.load(url) }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        weak var web: WKWebView?
        private(set) var hubURL: URL?

        func load(_ url: URL) {
            hubURL = url
            web?.load(URLRequest(url: url))
        }

        @objc func pulled() {
            if let hubURL { load(hubURL) }
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .allow }
            if url.scheme == "deskhub-retry" {
                if let hubURL { load(hubURL) }
                return .cancel
            }
            // Mail links and anything leaving the hub go to their own apps (Mail, Safari).
            if ["mailto", "tel", "sms", "facetime"].contains(url.scheme?.lowercased() ?? "") ||
                (action.navigationType == .linkActivated && url.host != hubURL?.host) {
                _ = await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }

        /// Links that ask for a new window (an email's links) open in Safari.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url { UIApplication.shared.open(url) }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            show(error, in: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            show(error, in: webView)
        }

        private func show(_ error: Error, in webView: WKWebView) {
            webView.scrollView.refreshControl?.endRefreshing()
            let e = error as NSError
            // A load replaced by another, or a link handed to another app, isn't a failure.
            if (e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled) || (e.domain == "WebKitErrorDomain" && e.code == 102) { return }
            webView.loadHTMLString(Self.errorPage(e.localizedDescription, address: hubURL?.absoluteString ?? ""), baseURL: nil)
        }

        private static func errorPage(_ message: String, address: String) -> String {
            func esc(_ s: String) -> String {
                s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
            }
            return """
            <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
            <style>body{background:#0C0E12;color:#E8EAEE;font:17px -apple-system,sans-serif;display:flex;flex-direction:column;justify-content:center;min-height:90vh;margin:0 28px}
            h1{font-size:22px;margin:0 0 8px}p{color:#9AA0AA;line-height:1.45;margin:0 0 10px}code{color:#E8EAEE}
            a{display:inline-block;margin-top:14px;padding:12px 20px;border-radius:12px;background:#1B2029;color:#8AB4FF;text-decoration:none;font-weight:600}</style></head>
            <body><h1>Can't reach the hub</h1><p>\(esc(message))</p>
            <p>Trying <code>\(esc(address))</code>. A <code>.local</code> address only works on the same Wi-Fi as the Pi; away from home use the hub's public address. You can change it on the Ring tab.</p>
            <a href="deskhub-retry:">Try again</a></body></html>
            """
        }
    }
}
