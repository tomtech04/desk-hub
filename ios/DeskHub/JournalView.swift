import SwiftUI

/// Talk or type about your day. Recordings are transcribed on the phone with Parakeet; the hub
/// sorts what you said into tasks, notes and reflections, exactly like a note from the ring.
struct JournalView: View {
    enum Stage: Equatable {
        case idle, recording, transcribing, review, sending, sent
        case failed(String)
    }

    @EnvironmentObject private var hub: HubStore
    @EnvironmentObject private var nav: AppNav
    @EnvironmentObject private var transcriber: Transcriber
    @EnvironmentObject private var ring: RingController
    @StateObject private var recorder = PhoneRecorder()
    @State private var stage: Stage = .idle
    @State private var transcript = ""
    @State private var recordedAt = Date()
    @State private var note = ""
    @State private var savingNote = false
    @FocusState private var noteFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    recordCard
                    writeCard
                    checkInRow
                    if let d = hub.dashboard {
                        RecapCard(recap: d.recap)
                        TodayEntriesCard(entries: d.todayJournal)
                    }
                    NavigationLink { PastDaysView() } label: {
                        HStack {
                            Label("Past days", systemImage: "calendar.badge.clock").font(.system(size: 16, weight: .medium)).foregroundStyle(G.text)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(G.muted)
                        }
                        .padding(16)
                        .background(G.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(G.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            }
            .refreshable { await hub.refresh() }
            .navigationTitle("Journal")
            .graphitePage()
            .onAppear(perform: takeRequests)
            .onChange(of: nav.wantsRecording) { _, _ in takeRequests() }
            .onChange(of: nav.wantsNote) { _, _ in takeRequests() }
        }
    }

    private func takeRequests() {
        if nav.wantsRecording {
            nav.wantsRecording = false
            if stage != .recording { startRecording() }
        }
        if nav.wantsNote {
            nav.wantsNote = false
            noteFocused = true
        }
    }

    // MARK: Recording

    private var recordCard: some View {
        Card(outline: G.aiJournal) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.system(size: 20, weight: .semibold)).foregroundStyle(G.text)
                    Text(subtitle).font(.system(size: 14)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if ring.pairedId != nil {
                    Label("Ring", systemImage: "circle.circle").font(G.mono(11)).foregroundStyle(G.muted)
                }
            }
            stageBody
        }
    }

    private var title: String {
        switch stage {
        case .recording: return "Listening"
        case .transcribing: return "Transcribing"
        case .review: return "Here's what you said"
        case .sending: return "Sending"
        case .sent: return "Sent to the hub"
        default: return "Talk it through"
        }
    }

    private var subtitle: String {
        switch stage {
        case .recording: return "Tap stop when you're done."
        case .transcribing: return modelLine ?? "On this iPhone, with Parakeet."
        case .review: return "Fix anything it misheard, then send."
        case .sending: return "The hub sorts it into tasks, notes and reflections."
        case .sent: return "The hub is sorting it now; it shows up below in a few seconds."
        case .failed(let message): return message
        default: return "Tasks, reminders and how the day went. Audio stays on this phone; only the words go to the hub."
        }
    }

    private var modelLine: String? {
        switch transcriber.modelState {
        case .downloading(let f): return "Downloading Parakeet the first time (about 500 MB): \(Int(f * 100))%"
        case .loading: return "Getting Parakeet ready…"
        default: return nil
        }
    }

    @ViewBuilder private var stageBody: some View {
        switch stage {
        case .idle, .sent, .failed:
            HStack(spacing: 16) {
                Button(action: startRecording) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(G.bg)
                        .frame(width: 76, height: 76)
                        .background(G.journal, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Record")
                Text(stage == .idle ? "Tap to record" : "Record another")
                    .font(.system(size: 15, weight: .medium)).foregroundStyle(G.text2)
            }
        case .recording:
            HStack(spacing: 16) {
                Button(action: stopRecording) {
                    ZStack {
                        Circle().fill(G.pink.opacity(0.25)).scaleEffect(1 + CGFloat(recorder.level) * 0.5)
                        Image(systemName: "stop.fill")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(G.bg)
                            .frame(width: 76, height: 76)
                            .background(G.journal, in: Circle())
                    }
                    .frame(width: 96, height: 96)
                    .animation(.easeOut(duration: 0.12), value: recorder.level)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Stop")
                TimelineView(.periodic(from: .now, by: 0.5)) { context in
                    Text(elapsed(at: context.date)).font(G.mono(28, .medium)).foregroundStyle(G.text)
                }
            }
        case .transcribing, .sending:
            HStack(spacing: 12) {
                ProgressView().tint(G.pink)
                Text(stage == .sending ? "Sending…" : "Working…").font(.system(size: 15)).foregroundStyle(G.text2)
            }
        case .review:
            VStack(alignment: .leading, spacing: 12) {
                TextField("", text: $transcript, axis: .vertical)
                    .font(.system(size: 16))
                    .foregroundStyle(G.text)
                    .lineLimit(3...10)
                    .padding(12)
                    .background(Color(hex: 0x0F1115), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                HStack(spacing: 10) {
                    Button("Send to the hub", action: send).buttonStyle(GraphiteButton())
                    Button("Discard") { transcript = ""; stage = .idle }.buttonStyle(GraphiteButton(primary: false))
                }
            }
        }
    }

    private func elapsed(at date: Date) -> String {
        let s = Int(date.timeIntervalSince(recorder.startedAt ?? date))
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    private func startRecording() {
        transcriber.prepareInBackground()
        Task {
            do {
                try await recorder.start()
                recordedAt = Date()
                stage = .recording
            } catch {
                stage = .failed(error.localizedDescription)
            }
        }
    }

    private func stopRecording() {
        let audio = recorder.stop()
        guard Double(audio.samples.count) > audio.sampleRate * 0.7 else {
            stage = .failed("That was too short. Hold on a little longer.")
            return
        }
        stage = .transcribing
        Task {
            do {
                let text = try await transcriber.transcribe(samples: audio.samples, sampleRate: audio.sampleRate)
                if text.isEmpty {
                    stage = .failed("Didn't catch anything. Try again a little closer to the phone.")
                } else {
                    transcript = text
                    stage = .review
                }
            } catch {
                stage = .failed("Couldn't transcribe: \(error.localizedDescription)")
            }
        }
    }

    private func send() {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        stage = .sending
        Task {
            if await hub.sendSpoken(text, recordedAt: recordedAt) {
                transcript = ""
                stage = .sent
            } else {
                stage = .failed(hub.problem ?? "The hub didn't take the note.")
            }
        }
    }

    // MARK: Check-in

    /// Mood, stress and energy in a few taps (the evening reminder opens the same sheet).
    private var checkInRow: some View {
        Button { nav.checkIn() } label: {
            HStack(spacing: 12) {
                IconTile(icon: "face.smiling", gradient: G.heart)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Calendar.current.component(.hour, from: Date()) >= 17 ? "How was today?" : "How are you doing?")
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(G.text)
                    Text("Check in: mood, stress, energy").font(.system(size: 13)).foregroundStyle(G.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(G.muted)
            }
            .padding(16)
            .background(G.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(G.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: Writing

    private var writeCard: some View {
        Card {
            CardHeader(icon: "square.and.pencil", title: "Write a note", gradient: G.journal)
            TextField("Kept just as you write it", text: $note, axis: .vertical)
                .font(.system(size: 16))
                .lineLimit(2...6)
                .focused($noteFocused)
                .padding(12)
                .background(Color(hex: 0x0F1115), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            if !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button(savingNote ? "Saving…" : "Save to today") {
                    savingNote = true
                    Task {
                        if await hub.addNote(note.trimmingCharacters(in: .whitespacesAndNewlines)) {
                            note = ""
                            noteFocused = false
                        }
                        savingNote = false
                    }
                }
                .buttonStyle(GraphiteButton())
                .disabled(savingNote)
            }
        }
    }
}

struct RecapCard: View {
    @EnvironmentObject private var hub: HubStore
    let recap: Recap?
    @State private var asked = false

    var body: some View {
        Card(outline: G.aiJournal) {
            CardHeader(icon: "moon.stars.fill", title: "Today's recap", gradient: G.journal)
            if let recap, let headline = recap.headline {
                Text(headline).font(.system(size: 17, weight: .medium)).foregroundStyle(G.text).fixedSize(horizontal: false, vertical: true)
                ForEach(Array((recap.bullets ?? []).enumerated()), id: \.offset) { _, line in
                    bullet(line, G.pink)
                }
                if let tomorrow = recap.tomorrow, !tomorrow.isEmpty {
                    SectionLabel(text: "Tomorrow")
                    ForEach(Array(tomorrow.enumerated()), id: \.offset) { _, line in bullet(line, G.amber) }
                }
            } else {
                Text("Claude writes it in the evening from your notes, tasks and focus time.").font(.system(size: 14)).foregroundStyle(G.text2)
                Button(asked ? "Writing…" : "Write it now") {
                    asked = true
                    Task { await hub.runRecap() }
                }
                .buttonStyle(GraphiteButton(primary: false))
                .disabled(asked)
            }
        }
    }

    private func bullet(_ text: String, _ color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Circle().fill(color).frame(width: 5, height: 5).offset(y: -2)
            Text(text).font(.system(size: 14)).foregroundStyle(G.text2).fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct TodayEntriesCard: View {
    let entries: [JournalEntry]

    var body: some View {
        Card {
            CardHeader(icon: "text.book.closed.fill", title: "Today", gradient: G.journal, meta: entries.isEmpty ? nil : "\(entries.count)")
            if entries.isEmpty {
                Text("Nothing yet. Notes from the ring, this phone and the desk show up here.").font(.system(size: 14)).foregroundStyle(G.text2)
            }
            ForEach(entries) { entry in
                EntryRow(entry: entry)
                if entry.id != entries.last?.id { Divider().overlay(G.lineSoft) }
            }
        }
    }
}

struct EntryRow: View {
    let entry: JournalEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(kind).font(G.mono(11, .medium)).foregroundStyle(entry.kind == "reflection" ? G.pink : G.text3)
                Spacer()
                Text(Fmt.time(Fmt.date(entry.at))).font(G.mono(11)).foregroundStyle(G.muted)
            }
            Text(entry.shown).font(.system(size: 15)).foregroundStyle(G.text).fixedSize(horizontal: false, vertical: true)
            let acts = (entry.actions ?? []).filter { $0.kind != "note" && $0.kind != "reflection" }
            if !acts.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(acts.enumerated()), id: \.offset) { _, act in
                        Label(act.text ?? "", systemImage: icon(act.kind))
                            .font(.system(size: 13))
                            .foregroundStyle(act.kind == "done" ? G.mint : G.amber)
                    }
                }
            }
        }
    }

    private var kind: String {
        let source: String
        switch entry.trigger {
        case "typed": source = "Typed"
        case "phone": source = "Phone"
        case "computer": source = "Computer"
        default: source = "Ring"
        }
        return entry.kind == "reflection" ? "Reflection · \(source)" : "Note · \(source)"
    }

    private func icon(_ kind: String?) -> String {
        switch kind {
        case "done": return "checkmark.circle.fill"
        case "task": return "plus.circle.fill"
        default: return "arrow.right.circle.fill"
        }
    }
}

/// Every recorded day, newest first, searchable.
struct PastDaysView: View {
    @EnvironmentObject private var hub: HubStore
    @State private var days: [JournalDay] = []
    @State private var search = ""
    @State private var loaded = false

    var body: some View {
        List {
            if loaded, days.isEmpty {
                Text(search.isEmpty ? "No days recorded yet." : "Nothing matches “\(search)”.").foregroundStyle(G.text2).listRowBackground(G.panel)
            }
            ForEach(days) { day in
                NavigationLink { DayView(day: day) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(day.label ?? day.date).font(.system(size: 16, weight: .semibold)).foregroundStyle(G.text)
                            Spacer()
                            Text("\(day.entries?.count ?? 0) notes").font(G.mono(11)).foregroundStyle(G.muted)
                        }
                        if let summary = day.summary, !summary.isEmpty {
                            Text(summary).font(.system(size: 14)).foregroundStyle(G.text2).lineLimit(2)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowBackground(G.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .graphitePage()
        .navigationTitle("Past days")
        .searchable(text: $search, prompt: "Search your journal")
        .task(id: search) {
            try? await Task.sleep(for: .milliseconds(search.isEmpty ? 0 : 350))
            days = await hub.journalDays(search: search)
            loaded = true
        }
    }
}

struct DayView: View {
    let day: JournalDay

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let summary = day.summary, !summary.isEmpty {
                    Card(outline: G.aiJournal) {
                        CardHeader(icon: "moon.stars.fill", title: "Recap", gradient: G.journal)
                        Text(summary).font(.system(size: 15)).foregroundStyle(G.text)
                    }
                }
                if let note = day.note, !note.isEmpty {
                    Card {
                        CardHeader(icon: "square.and.pencil", title: "Day note", gradient: G.journal)
                        Text(note).font(.system(size: 15)).foregroundStyle(G.text)
                    }
                }
                Card {
                    CardHeader(icon: "text.book.closed.fill", title: "Notes", gradient: G.journal, meta: "\(Int(day.focusMinutes ?? 0)) min focus · \(day.tasksDone ?? 0) done")
                    ForEach(day.entries ?? []) { e in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Fmt.time(Fmt.date(e.at))).font(G.mono(11)).foregroundStyle(G.muted)
                            Text(e.text ?? "").font(.system(size: 15)).foregroundStyle(G.text)
                            if let action = e.action, !action.isEmpty {
                                Text(action).font(.system(size: 13)).foregroundStyle(G.amber)
                            }
                        }
                    }
                    if (day.entries ?? []).isEmpty {
                        Text("No notes this day.").font(.system(size: 14)).foregroundStyle(G.text2)
                    }
                }
            }
            .padding(16)
        }
        .graphitePage()
        .navigationTitle(day.label ?? day.date)
        .navigationBarTitleDisplayMode(.inline)
    }
}
