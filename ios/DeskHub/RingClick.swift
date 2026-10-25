import Foundation

/// What a click of the ring's button does: one, two or three short presses.
enum RingClick: String, CaseIterable, Identifiable {
    case single, double, triple

    var id: String { rawValue }

    var title: String {
        switch self {
        case .single: "Click"
        case .double: "Double click"
        case .triple: "Triple click"
        }
    }

    /// Reads the ring's own wording ("short", "short short"...). Anything with a hold in it is a
    /// recording, not a click, and gives nil.
    init?(sequence: String) {
        let words = sequence.lowercased().split(separator: " ").map(String.init)
        guard !words.isEmpty, words.allSatisfy({ $0 == "short" }) else { return nil }
        switch words.count {
        case 1: self = .single
        case 2: self = .double
        case 3: self = .triple
        default: return nil
        }
    }
}
