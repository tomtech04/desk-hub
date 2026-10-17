import Foundation
import Security

/// Where the hub is and the token the ring's notes sign in with.
@MainActor
final class HubSettings: ObservableObject {
    @Published var hubAddress: String {
        didSet { UserDefaults.standard.set(hubAddress, forKey: "hubAddress") }
    }
    @Published var voiceToken: String {
        didSet { Keychain.set(voiceToken, account: "voiceToken") }
    }

    init() {
        hubAddress = UserDefaults.standard.string(forKey: "hubAddress") ?? "http://deskhub.local:8080"
        voiceToken = Keychain.get(account: "voiceToken") ?? ""
    }

    /// The hub's address as a URL, accepting "deskhub.local:8080" without a scheme.
    var baseURL: URL? {
        var text = hubAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") { text = "http://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), url.host != nil else { return nil }
        return url
    }
}

/// The voice token lives in the keychain, readable after the first unlock so a recording that
/// syncs while the phone is locked can still be sent.
enum Keychain {
    private static let service = "deskhub"

    static func get(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ value: String, account: String) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        guard !value.isEmpty else { return }
        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}
