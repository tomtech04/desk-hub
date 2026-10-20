import SwiftUI

/// "How was today?": say it, with the questions on screen so you know what to cover, or tap it in.
/// Speech is transcribed and read on the phone; what it found fills in the form for you to check.
struct CheckInSheet: View {
    @EnvironmentObject private var health: HealthMonitor
    @EnvironmentObject private var transcriber: Transcriber
    @Environment(\.dismiss) private var dismiss
    @StateObject private var recorder = PhoneRecorder()

    private enum Step { case talk, review }
    private enum Phase { case idle, transcribing, reading }

    @State private var step = Step.talk
    @State private var phase = Phase.idle
    @State private var problem: String?
    /// What the speech came to, or nil when the form was filled in by hand.
    @State private var heard: HeardCheckIn?
    /// Fields the person changed themselves; saying more never overwrites those.
    @State private var touched: Set<String> = []
    @State private var mood = 4.0
    @State private var stress = 3
    @State private var energy = 3
    @State private var feelings: Set<String> = []
    @State private var about: Set<String> = []
    @State private var note = ""
    @State private var saving = false

    private var evening: Bool { Calendar.current.component(.hour, from: Date()) >= 17 }
    private var busy: Bool { phase != .idle || recorder.isRecording }

    /// What to talk about. The reader knows these words, and "remind me to…" is filed as a task.
    private static let prompts: [(icon: String, question: String, hint: String)] = [
        ("face.smiling", "How are you feeling overall?", "Pretty good, kind of rough, somewhere in between…"),
        ("gauge.with.dots.needle.67percent", "How stressed were you?", "1 is none, 5 is very high. A number is perfect."),
        ("bolt.fill", "How much energy do you have?", "1 is empty, 5 is great."),
        ("tag", "What was it about?", "School, PayIt, work, friends, family, sleep, money…"),
        ("checklist", "Anything to remember or do?", "Say \"remind me to…\" and it becomes a task."),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let day = health.today, let stress = day.stress {
                        Label {
                            Text("By your watch: \(HealthStory.headline(day).lowercased()).").foregroundStyle(G.text2)
                        } icon: {
                            Image(systemName: "applewatch").foregroundStyle(G.stress(stress.score))
                        }
                        .font(.system(size: 14))
                    }
                    switch step {
                    case .talk: talk
                    case .review: review
                    }
                }
                .padding(20)
            }
            .graphitePage()
            .navigationTitle(evening ? "How was today?" : "How are you doing?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Later") { stopIfRecording(); dismiss() } }
                if step == .review {
                    ToolbarItem(placement: .confirmationAction) { Button(saving ? "Saving…" : "Save", action: save).disabled(saving || busy) }
                }
            }
        }
        .tint(G.text)
        .onAppear {
            transcriber.prepareInBackground()
            // `-checkinDemoText "..."` on launch: as if that had just been said (the simulator screenshots).
            if let text = UserDefaults.standard.string(forKey: "checkinDemoText"), note.isEmpty {
                note = text
                Task {
                    apply(await CheckInParser.read(text, feelings: CheckIn.feelingChoices, about: CheckIn.aboutChoices))
                    step = .review
                }
            }
        }
        .onDisappear { stopIfRecording() }
    }

    // MARK: Talk

    private var talk: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Talk for a minute and cover these, in any order. It works out the rest.")
                .font(.system(size: 16)).foregroundStyle(G.text2)
            VStack(spacing: 0) {
                ForEach(Array(Self.prompts.enumerated()), id: \.offset) { index, prompt in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: prompt.icon).font(.system(size: 16)).foregroundStyle(G.pink).frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(prompt.question).font(.system(size: 16, weight: .semibold)).foregroundStyle(G.text)
                            Text(prompt.hint).font(.system(size: 13)).foregroundStyle(G.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 11)
                    if index < Self.prompts.count - 1 { Divider().overlay(G.lineSoft) }
                }
            }
            .padding(.horizontal, 14)
            .background(G.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            micButton
            if let problem { Text(problem).font(.system(size: 14)).foregroundStyle(G.amber).frame(maxWidth: .infinity) }
            modelStatus

            Button("Tap it in instead") { step = .review }
                .buttonStyle(GraphiteButton(primary: false))
                .disabled(busy)
                .frame(maxWidth: .infinity)
        }
    }

    private var micButton: some View {
        VStack(spacing: 10) {
            Button(action: toggleRecording) {
                ZStack {
                    Circle()
                        .fill(recorder.isRecording ? AnyShapeStyle(G.bad) : AnyShapeStyle(G.journal))
                        .frame(width: 88, height: 88)
                        .scaleEffect(recorder.isRecording ? 1 + CGFloat(recorder.level) * 0.35 : 1)
                        .animation(.easeOut(duration: 0.12), value: recorder.level)
                    if phase == .idle {
                        Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill").font(.system(size: 30)).foregroundStyle(G.bg)
                    } else {
                        ProgressView().tint(G.bg)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(phase != .idle)
            Group {
                if recorder.isRecording, let started = recorder.startedAt {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let seconds = Int(context.date.timeIntervalSince(started))
                        Text("Listening  \(seconds / 60):" + String(format: "%02d", seconds % 60) + "  ·  tap when you're done")
                    }
                } else {
                    switch phase {
                    case .transcribing: Text("Writing down what you said…")
                    case .reading: Text("Working out how you feel…")
                    case .idle: Text(step == .talk ? "Tap to start talking" : "Tap to say more")
                    }
                }
            }
            .font(G.mono(12)).foregroundStyle(G.text3)
        }
        .frame(maxWidth: .infinity)
    }

    /// The first time, the speech model has to download.
    @ViewBuilder private var modelStatus: some View {
        switch transcriber.modelState {
        case .downloading(let fraction):
            VStack(spacing: 6) {
                ProgressView(value: fraction)
                Text("Getting the speech model ready, once (about 500 MB). Talking works when it's done.")
                    .font(.system(size: 12)).foregroundStyle(G.muted)
            }
        case .failed(let message):
            Text("The speech model couldn't load: \(message)").font(.system(size: 12)).foregroundStyle(G.coral)
        default:
            EmptyView()
        }
    }

    // MARK: Review

    private var review: some View {
        VStack(alignment: .leading, spacing: 18) {
            if heard != nil {
                Text("Filled in from what you said. Check it, change anything, then Save.")
                    .font(.system(size: 14)).foregroundStyle(G.text2)
                if !missing.isEmpty {
                    HStack(spacing: 10) {
                        Image(systemName: "questionmark.circle.fill").foregroundStyle(G.amber)
                        Text("You didn't say \(missing.joined(separator: " or ")).").font(.system(size: 14)).foregroundStyle(G.text2)
                        Spacer(minLength: 0)
                    }
                }
            }
            section("How do you feel?", field: "mood") {
                VStack(alignment: .leading, spacing: 8) {
                    Text(CheckIn.moods[Int(mood)]).font(.system(size: 22, weight: .semibold)).foregroundStyle(moodColor)
                    Slider(value: Binding(get: { mood }, set: { mood = $0; touched.insert("mood") }), in: 1...7, step: 1).tint(moodColor)
                    HStack { Text("Very unpleasant"); Spacer(); Text("Very pleasant") }.font(G.mono(10)).foregroundStyle(G.muted)
                }
            }
            section("Stress", field: "stress") { scale($stress, "stress", CheckIn.stressWords, color: G.amber) }
            section("Energy", field: "energy") { scale($energy, "energy", CheckIn.energyWords, color: G.mint) }
            section("Feelings", field: "feelings") { chips(CheckIn.feelingChoices, "feelings", $feelings) }
            section("About", field: "about") { chips(CheckIn.aboutChoices, "about", $about) }
            section(heard == nil ? "Anything on your mind?" : "What you said", field: nil) {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("Optional. Goes to your journal, and reminders become tasks.", text: $note, axis: .vertical)
                        .font(.system(size: 16)).lineLimit(2...8)
                        .padding(12)
                        .background(Color(hex: 0x0F1115), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    micButton
                    if let problem { Text(problem).font(.system(size: 14)).foregroundStyle(G.amber) }
                }
            }
        }
    }

    /// The three levels the speech never touched on.
    private var missing: [String] {
        guard let heard else { return [] }
        var out: [String] = []
        if heard.mood == nil, !touched.contains("mood") { out.append("how you feel") }
        if heard.stress == nil, !touched.contains("stress") { out.append("how stressed you were") }
        if heard.energy == nil, !touched.contains("energy") { out.append("how much energy you have") }
        return out
    }

    private var moodColor: Color {
        mood <= 2 ? G.coral : mood <= 3 ? G.amber : mood < 5 ? G.text2 : G.mint
    }

    /// A section's title and, after speaking, where its value came from.
    private func section<Content: View>(_ title: String, field: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionLabel(text: title)
                Spacer()
                if let field, let tag = source(of: field) {
                    Text(tag.text).font(G.mono(10)).foregroundStyle(tag.color)
                }
            }
            content()
        }
    }

    private func source(of field: String) -> (text: String, color: Color)? {
        guard let heard else { return nil }
        if touched.contains(field) { return ("YOU SET THIS", G.text3) }
        let said: Bool
        switch field {
        case "mood": said = heard.mood != nil
        case "stress": said = heard.stress != nil
        case "energy": said = heard.energy != nil
        case "feelings": said = !heard.feelings.isEmpty
        default: said = !heard.about.isEmpty
        }
        guard said else { return ("NOT MENTIONED", G.amber) }
        return heard.guessed.contains(field) ? ("MY GUESS", G.amber) : ("YOU SAID IT", G.mint)
    }

    private func scale(_ value: Binding<Int>, _ field: String, _ words: [String], color: Color) -> some View {
        HStack(spacing: 6) {
            ForEach(1...5, id: \.self) { n in
                Button {
                    value.wrappedValue = n
                    touched.insert(field)
                } label: {
                    Text(words[n])
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(value.wrappedValue == n ? G.bg : G.title)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(value.wrappedValue == n ? color : G.panel, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(value.wrappedValue == n ? Color.clear : Color(hex: 0x2A2F38), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func chips(_ options: [String], _ field: String, _ selection: Binding<Set<String>>) -> some View {
        FlowLayout(spacing: 8) {
            ForEach(options, id: \.self) { option in
                let on = selection.wrappedValue.contains(option)
                Button {
                    if on { selection.wrappedValue.remove(option) } else { selection.wrappedValue.insert(option) }
                    touched.insert(field)
                } label: {
                    Text(option)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(on ? G.bg : G.title)
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(on ? G.text : G.panel, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(on ? Color.clear : Color(hex: 0x2A2F38), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Talking

    private func toggleRecording() {
        recorder.isRecording ? finishRecording() : startRecording()
    }

    private func startRecording() {
        problem = nil
        transcriber.prepareInBackground()
        Task {
            do { try await recorder.start() } catch { problem = error.localizedDescription }
        }
    }

    private func stopIfRecording() {
        if recorder.isRecording { _ = recorder.stop() }
    }

    private func finishRecording() {
        let audio = recorder.stop()
        guard Double(audio.samples.count) > audio.sampleRate * 1.2 else {
            problem = "That was too short to hear. Tap the mic and try again."
            return
        }
        phase = .transcribing
        Task {
            do {
                let text = try await transcriber.transcribe(samples: audio.samples, sampleRate: audio.sampleRate)
                guard !text.isEmpty else {
                    problem = "I couldn't make out any words. Try again, a little closer to the phone."
                    phase = .idle
                    return
                }
                note = note.isEmpty ? text : note + " " + text
                phase = .reading
                apply(await CheckInParser.read(note, feelings: CheckIn.feelingChoices, about: CheckIn.aboutChoices))
                phase = .idle
                step = .review
            } catch {
                problem = "Couldn't turn that into text: \(error.localizedDescription)"
                phase = .idle
            }
        }
    }

    /// Fills the form from what was said, except what the person has already set by hand.
    private func apply(_ result: HeardCheckIn) {
        heard = result
        if let level = result.mood, !touched.contains("mood") { mood = Double(level) }
        if let level = result.stress, !touched.contains("stress") { stress = level }
        if let level = result.energy, !touched.contains("energy") { energy = level }
        if !result.feelings.isEmpty, !touched.contains("feelings") { feelings = Set(result.feelings) }
        if !result.about.isEmpty, !touched.contains("about") { about = Set(result.about) }
    }

    private func save() {
        saving = true
        let checkin = CheckIn(at: Date().timeIntervalSince1970 * 1000, mood: Int(mood), stress: stress, energy: energy,
                              feelings: CheckIn.feelingChoices.filter(feelings.contains), about: CheckIn.aboutChoices.filter(about.contains),
                              note: note.trimmingCharacters(in: .whitespacesAndNewlines))
        Task {
            await health.add(checkin, evening: evening)
            saving = false
            dismiss()
        }
    }
}
