import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// What a spoken check-in came to. Anything not said is nil or empty.
struct HeardCheckIn: Equatable {
    /// 1 very unpleasant … 7 very pleasant.
    var mood: Int?
    /// 1 none … 5 very high.
    var stress: Int?
    /// 1 empty … 5 great.
    var energy: Int?
    var feelings: [String] = []
    var about: [String] = []
    /// Which of "mood", "stress" and "energy" the model filled in because the words didn't say.
    var guessed: Set<String> = []
    /// "keywords" or "keywords + Apple's on-device model", for the log.
    var reader = ""
}

/// Turns what someone said about their day into a mood, stress and energy level and what it was
/// about. It all happens on the phone. What the person says outright ("stress was a 4", "I'm
/// exhausted") is read from their words, and so are the feelings and topics, so nothing is
/// tagged that wasn't mentioned. Where a level wasn't said at all, Apple's on-device language
/// model (where Apple Intelligence is on) may infer it, and those are marked as guesses.
enum CheckInParser {
    static func read(_ transcript: String, feelings: [String], about: [String]) async -> HeardCheckIn {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return HeardCheckIn() }
        var heard = KeywordReader.read(text, feelings: feelings, about: about)
        #if canImport(FoundationModels)
        // Only when they talk about how they are, so a plain to-do note isn't read as a mood.
        if heard.mood == nil || heard.stress == nil || heard.energy == nil, KeywordReader.speaksAboutSelf(text),
           #available(iOS 26.0, macOS 26.0, *), let model = await ModelReader.read(text) {
            if heard.mood == nil, let level = model.mood { heard.mood = level; heard.guessed.insert("mood") }
            if heard.stress == nil, let level = model.stress { heard.stress = level; heard.guessed.insert("stress") }
            if heard.energy == nil, let level = model.energy { heard.energy = level; heard.guessed.insert("energy") }
            if !heard.guessed.isEmpty { heard.reader = "keywords + Apple's on-device model" }
        }
        #endif
        return heard
    }
}

// MARK: On-device model

#if canImport(FoundationModels)
@available(iOS 26.0, macOS 26.0, *)
@Generable
private struct ModelReading {
    @Guide(description: "Overall mood: 1 very unpleasant, 2 unpleasant, 3 slightly unpleasant, 4 neutral, 5 slightly pleasant, 6 pleasant, 7 very pleasant. Leave out unless they said or clearly implied how they feel overall.", .range(1...7))
    var mood: Int?
    @Guide(description: "How stressed they were: 1 none, 2 low, 3 some, 4 high, 5 very high. Leave out unless they said or clearly implied it.", .range(1...5))
    var stress: Int?
    @Guide(description: "Their energy: 1 empty, 2 low, 3 okay, 4 good, 5 great. Leave out unless they said or clearly implied it.", .range(1...5))
    var energy: Int?
}

@available(iOS 26.0, macOS 26.0, *)
private enum ModelReader {
    static func read(_ text: String) async -> ModelReading? {
        guard case .available = SystemLanguageModel.default.availability else { return nil }
        let instructions = """
        You read a person's spoken end-of-day check-in and estimate three levels from it. Use only \
        what they said or clearly implied; if a level isn't there, leave it out. Never guess from \
        a topic alone: a note about a task says nothing about mood. Negations count: "wasn't a bad \
        day" is not a bad day.
        """
        do {
            let session = LanguageModelSession(instructions: instructions)
            return try await session.respond(to: "Check-in: \(text)", generating: ModelReading.self).content
        } catch {
            return nil
        }
    }
}
#endif

// MARK: Keyword rules

/// The fallback, and the source of any number the person says outright.
enum KeywordReader {
    static func read(_ text: String, feelings: [String], about: [String]) -> HeardCheckIn {
        let t = normalize(text)
        let explicit = explicitNumbers(text)
        var heard = HeardCheckIn()
        heard.stress = explicit.stress ?? stress(t)
        heard.energy = explicit.energy ?? energy(t)
        heard.mood = mood(t)
        heard.feelings = feelings.filter { name in feelingWords[name].map { has(t, $0) } ?? false }
        heard.about = about.filter { name in aboutWords[name].map { has(t, $0) } ?? false }
        heard.reader = "keywords"
        return heard
    }

    /// Whether they describe how they feel or how the day went ("I'm exhausted", "today was rough").
    static func speaksAboutSelf(_ text: String) -> Bool {
        has(normalize(text), ["i feel", "i m", "i am", "i was", "i ve been", "i got", "feeling", "felt", "feel", "today was", "day was", "my day", "my mood", "mood was", "been a"])
    }

    // MARK: Numbers said outright

    /// "stress was a 4", "energy, maybe 6 out of 10": on a 1 to 5 scale.
    static func explicitNumbers(_ text: String) -> (stress: Int?, energy: Int?) {
        let digits = digitize(text)
        return (number(near: "stress(?:ed|ful)?", in: digits), number(near: "energy", in: digits))
    }

    /// "seven out of ten" → "7 out of 10", since speech often comes back in words.
    static func digitize(_ text: String) -> String {
        let words = ["zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10"]
        var out = text
        for (word, digit) in words {
            out = out.replacingOccurrences(of: "\\b\(word)\\b", with: digit, options: [.regularExpression, .caseInsensitive])
        }
        return out
    }

    private static func number(near word: String, in text: String) -> Int? {
        let pattern = "\\b\(word)\\b[^0-9.!?]{0,24}?\\b(\\d{1,2})\\b(?:\\s*(?:/|out of)\\s*(\\d{1,2})\\b)?"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let nRange = Range(match.range(at: 1), in: text), let n = Double(text[nRange]) else { return nil }
        var of: Double?
        if let mRange = Range(match.range(at: 2), in: text) { of = Double(text[mRange]) }
        return scaled(n, of: of)
    }

    /// 4 → 4 on a 1-5 scale; 7 out of 10 → 4; nil when it can't be one of those.
    static func scaled(_ n: Double, of m: Double?) -> Int? {
        if let m {
            guard m >= 2, n >= 0, n <= m else { return nil }
            return min(5, max(1, Int((n / m * 5).rounded(.up))))
        }
        if (1...5).contains(n) { return Int(n) }
        if (6...10).contains(n) { return min(5, max(1, Int((n / 10 * 5).rounded(.up)))) }
        return nil
    }

    // MARK: Words

    private static func stress(_ t: String) -> Int? {
        if has(t, ["notstressed", "notstressful", "stress free", "no stress", "stressfree"]) { return 1 }
        if has(t, ["a little stressed", "a bit stressed", "slightly stressed", "little stress", "low stress", "mild stress", "a little stress"]) { return 2 }
        if has(t, ["very stressed", "really stressed", "super stressed", "extremely stressed", "so stressed", "overwhelmed", "stressed out", "max stress", "very high stress", "panicking", "freaking out"]) { return 5 }
        if has(t, ["somewhat stressed", "kind of stressed", "kinda stressed", "some stress", "moderately stressed", "a little tense"]) { return 3 }
        if has(t, ["stressed", "stressful", "anxious", "tense", "on edge", "high stress", "worried"]) { return 4 }
        if has(t, ["calm", "relaxed", "chill", "peaceful"]) { return 1 }
        return nil
    }

    private static func energy(_ t: String) -> Int? {
        if has(t, ["no energy", "zero energy", "empty", "exhausted", "wiped", "dead tired", "burnt out", "burned out", "running on fumes", "drained"]) { return 1 }
        if has(t, ["low energy", "tired", "sleepy", "sluggish", "worn out", "not much energy", "little energy", "groggy"]) { return 2 }
        if has(t, ["great energy", "so much energy", "lots of energy", "full of energy", "energized", "pumped", "buzzing", "wired", "high energy"]) { return 5 }
        if has(t, ["nottired", "notexhausted", "notdrained"]) { return 4 }
        if has(t, ["good energy", "energetic", "awake", "alert", "pretty energized", "decent energy", "well rested"]) { return 4 }
        if has(t, ["okay energy", "ok energy", "medium energy", "normal energy", "average energy", "fine energy"]) { return 3 }
        return nil
    }

    private static func mood(_ t: String) -> Int? {
        if has(t, ["notbad", "notterrible", "notawful"]) { return 6 }
        if has(t, ["notgood", "notgreat", "nothappy"]) { return 2 }
        if has(t, ["terrible", "awful", "miserable", "horrible", "worst", "really bad", "very bad", "really down", "devastated"]) { return 1 }
        if has(t, ["bad", "rough", "not good", "sad", "down", "lousy", "upset", "crappy", "not great", "pretty low"]) { return 2 }
        if has(t, ["kind of bad", "kinda bad", "a bit down", "a little down", "meh", "slightly off", "a bit off", "not the best"]) { return 3 }
        if has(t, ["amazing", "fantastic", "wonderful", "incredible", "best day", "really good", "very good", "really happy", "so happy", "awesome", "great day"]) { return 7 }
        if has(t, ["pretty good", "good", "happy", "nice", "positive", "productive", "glad", "pleasant", "solid", "great"]) { return 6 }
        if has(t, ["slightly good", "kind of good", "kinda good", "decent", "alright", "all right", "fairly good", "a bit better"]) { return 5 }
        if has(t, ["okay", "ok", "fine", "so so", "neutral", "average", "normal", "mixed", "whatever"]) { return 4 }
        return nil
    }

    private static let feelingWords: [String: [String]] = [
        "Calm": ["calm", "relaxed", "peaceful", "chill", "at ease"],
        "Content": ["content", "satisfied", "settled", "at peace"],
        "Happy": ["happy", "glad", "joyful", "cheerful", "good mood", "great mood"],
        "Grateful": ["grateful", "thankful", "appreciative", "lucky"],
        "Excited": ["excited", "pumped", "stoked", "thrilled", "can t wait", "hyped"],
        "Proud": ["proud", "accomplished", "nailed it", "pulled it off"],
        "Stressed": ["stressed", "stressful", "tense", "pressure", "stress"],
        "Anxious": ["anxious", "nervous", "worried", "on edge", "uneasy", "anxiety"],
        "Overwhelmed": ["overwhelmed", "swamped", "too much", "buried", "drowning", "snowed under"],
        "Frustrated": ["frustrated", "annoyed", "irritated", "angry", "mad", "fed up", "irritating"],
        "Drained": ["drained", "exhausted", "tired", "burnt out", "burned out", "wiped", "worn out", "no energy"],
        "Sad": ["sad", "down", "upset", "lonely", "depressed", "blue", "heartbroken"],
    ]

    private static let aboutWords: [String: [String]] = [
        "Work": ["work", "job", "internship", "boss", "coworker", "shift", "client", "office"],
        "School": ["school", "class", "exam", "midterm", "finals", "homework", "lab", "professor", "assignment", "lecture", "study", "studying", "course", "gpa", "tech", "deadline"],
        "PayIt": ["payit", "pay it", "merchants", "customers", "the app", "app store", "launch", "the business", "startup", "stripe"],
        "Family": ["family", "mom", "dad", "mother", "father", "sister", "brother", "parents", "grandma", "grandpa", "cousin"],
        "Friends": ["friends", "friend", "hung out", "hanging out", "party", "roommate", "buddies"],
        "Partner": ["girlfriend", "boyfriend", "partner", "my wife", "my husband", "date night", "fiancee", "fiance"],
        "Health": ["sick", "health", "doctor", "sleep", "slept", "headache", "pain", "injury", "illness", "cold", "sore"],
        "Fitness": ["gym", "workout", "run", "ran", "lift", "lifted", "exercise", "training", "swim", "hike", "sport", "practice"],
        "Money": ["money", "rent", "bills", "broke", "payment", "savings", "expensive", "afford", "paycheck", "debt", "tuition"],
        "Self care": ["self care", "relaxing", "rest", "took a break", "meditat", "journaling", "slow day", "recharge", "me time", "unwind"],
    ]

    /// Lowercase, punctuation to spaces, so "wasn't" is "wasn t" and phrases can be matched whole.
    private static func normalize(_ text: String) -> String {
        let lowered = text.lowercased().replacingOccurrences(of: "\u{2019}", with: "'")
        let cleaned = lowered.map { $0.isLetter || $0.isNumber ? $0 : " " }
        let flat = " " + String(cleaned).split(separator: " ").joined(separator: " ") + " "
        // "not a bad day", "wasn t very stressed", "never tired": the negated word becomes "notbad"
        // and so on, which no rule matches as the thing itself.
        let negated = "(?:not|no|wasn t|isn t|aren t|weren t|never|hardly|barely|don t feel|didn t feel|wouldn t say)(?: a| an| very| that| too| really| so| at all| particularly| super| the)* (bad|sad|down|rough|terrible|awful|stressed|stressful|tired|anxious|upset|drained|exhausted|overwhelmed|good|great|happy|calm|relaxed)"
        return flat.replacingOccurrences(of: negated, with: " not$1", options: .regularExpression)
    }

    /// Whether any phrase appears as whole words. A word list entry ending in "meditat" or
    /// "relax" matches its longer forms ("meditating", "relaxing") through the prefix test.
    private static func has(_ t: String, _ phrases: [String]) -> Bool {
        phrases.contains { phrase in
            let stem = phrase.hasSuffix("meditat") || phrase == "study" || phrase == "stress"
            return t.contains(" \(phrase)" + (stem ? "" : " "))
        }
    }
}
