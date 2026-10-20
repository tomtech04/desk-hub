// Checks the keyword rules that read a spoken check-in (the part that behaves the same every
// time). Run with: bash ios/scripts/test-parser.sh
import Foundation

var failures = 0
func check(_ name: String, _ ok: Bool) {
    print(ok ? "ok   " : "FAIL ", name)
    if !ok { failures += 1 }
}

let feelings = ["Calm", "Content", "Happy", "Grateful", "Excited", "Proud", "Stressed", "Anxious", "Overwhelmed", "Frustrated", "Drained", "Sad"]
let about = ["Work", "School", "PayIt", "Family", "Friends", "Partner", "Health", "Fitness", "Money", "Self care"]
func read(_ text: String) -> HeardCheckIn { KeywordReader.read(text, feelings: feelings, about: about) }

@main struct Tests {
    static func main() {
        var h = read("Overall I feel pretty good. My stress was about a 4 out of 5 today and my energy is a 2. Mostly school and PayIt, I had a midterm.")
        check("numbers said outright", h.mood == 6 && h.stress == 4 && h.energy == 2)
        check("topics from words said", h.about.contains("School") && h.about.contains("PayIt") && !h.about.contains("Work"))

        h = read("Stress was like seven out of ten and energy was a three out of five.")
        check("spoken numbers, out of ten and out of five", h.stress == 4 && h.energy == 3)

        h = read("I wasn't stressed at all today, honestly it wasn't a bad day. Pretty relaxed, hung out with my friends.")
        check("negations: not stressed, not a bad day", h.stress == 1 && h.mood == 6)
        check("a negated feeling is not tagged", !h.feelings.contains("Stressed") && h.feelings.contains("Calm"))
        check("friends heard", h.about == ["Friends"])

        h = read("Honestly today was rough. I was super stressed about the exam and I'm exhausted now.")
        check("loose speech", h.mood == 2 && h.stress == 5 && h.energy == 1 && h.feelings.contains("Drained"))

        h = read("Remind me to email Professor Chen about the lab report tomorrow.")
        check("a to-do says nothing about mood", h.mood == nil && h.stress == nil && h.energy == nil && h.feelings.isEmpty)

        h = read("It wasn't a bad day, honestly. Not tired either.")
        check("not tired is decent energy", h.mood == 6 && h.energy == 4)

        check("scaling: 7 of 10 is 4", KeywordReader.scaled(7, of: 10) == 4)
        check("scaling: 3 of 10 is 2", KeywordReader.scaled(3, of: 10) == 2)
        check("scaling: a bare 12 is nothing", KeywordReader.scaled(12, of: nil) == nil)

        check("speaking about yourself", KeywordReader.speaksAboutSelf("I'm a total mess right now"))
        check("a to-do is not about yourself", !KeywordReader.speaksAboutSelf("Remind me to email Professor Chen tomorrow"))
        check("a task list is not about yourself", !KeywordReader.speaksAboutSelf("I need to follow up with the merchant and finish the problem set"))

        print(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
        exit(failures == 0 ? 0 : 1)
    }
}
