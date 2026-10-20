import SwiftUI

/// Every task on the hub: suggestions from email to keep or dismiss, filters, steps, and adding.
struct TasksView: View {
    enum Filter: String, CaseIterable, Identifiable {
        case open = "Open", today = "Due today", school = "School", payit = "PayIt", personal = "Personal", done = "Done"
        var id: String { rawValue }
    }

    @EnvironmentObject private var hub: HubStore
    @State private var filter: Filter = .open
    @State private var adding = false
    @State private var expanded: Set<String> = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    ScreenHeader(title: "To do") {
                        Button { adding = true } label: {
                            Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).foregroundStyle(G.text)
                                .frame(width: 40, height: 40)
                                .background(G.control, in: Circle())
                                .overlay(Circle().strokeBorder(G.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("New task")
                    }
                    if let d = hub.dashboard {
                        if !d.suggestedTodos.isEmpty { SuggestedCard(todos: d.suggestedTodos) }
                        chips
                        Card {
                            let list = shown(d)
                            if list.isEmpty {
                                Text(filter == .done ? "Nothing finished yet." : "Nothing here. Nice.")
                                    .font(.system(size: 15)).foregroundStyle(G.text2)
                            }
                            ForEach(list) { todo in
                                TaskRow(todo: todo, expanded: expanded.contains(todo.id)) {
                                    withAnimation(.snappy) {
                                        if expanded.contains(todo.id) { expanded.remove(todo.id) } else { expanded.insert(todo.id) }
                                    }
                                }
                                if todo.id != list.last?.id { Divider().overlay(G.lineSoft) }
                            }
                        }
                    } else {
                        StatusBanner(signingIn: .constant(false))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            }
            .refreshable { await hub.refresh() }
            .graphiteRoot()
            .sheet(isPresented: $adding) { AddTaskSheet() }
        }
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Filter.allCases) { f in
                    Button { filter = f } label: {
                        Text(f.rawValue)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(filter == f ? G.bg : G.title)
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                            .background(filter == f ? G.text : G.panel, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(filter == f ? Color.clear : Color(hex: 0x2A2F38), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func shown(_ d: Dashboard) -> [Todo] {
        let open = d.openTodos.sorted { a, b in
            if (a.star == true) != (b.star == true) { return a.star == true }
            return (a.due ?? .greatestFiniteMagnitude) < (b.due ?? .greatestFiniteMagnitude)
        }
        switch filter {
        case .open: return open
        case .today: return open.filter { $0.due.map { Fmt.dayOffset(Fmt.date($0)) <= 0 } ?? false }
        case .school: return open.filter { $0.tag == "School" }
        case .payit: return open.filter { $0.tag == "PayIt" }
        case .personal: return open.filter { $0.tag == "Personal" }
        case .done: return (d.todos ?? []).filter(\.isDone)
        }
    }
}

struct TaskRow: View {
    @EnvironmentObject private var hub: HubStore
    let todo: Todo
    let expanded: Bool
    let toggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Button { Task { await hub.setDone(todo, !todo.isDone) } } label: { CheckCircle(done: todo.isDone) }
                    .buttonStyle(.plain)
                VStack(alignment: .leading, spacing: 5) {
                    Text(todo.text)
                        .strikethrough(todo.isDone, color: G.muted)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(todo.isDone ? G.muted : G.text)
                        .fixedSize(horizontal: false, vertical: true)
                    meta
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture(perform: toggle)
                Button { Task { await hub.setStar(todo, todo.star != true) } } label: {
                    Image(systemName: todo.star == true ? "star.fill" : "star")
                        .font(.system(size: 15))
                        .foregroundStyle(todo.star == true ? Color(hex: 0xFFC65C) : Color(hex: 0x5C6370))
                }
                .buttonStyle(.plain)
            }
            if expanded { details.padding(.leading, 38) }
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button(todo.isDone ? "Mark not done" : "Mark done") { Task { await hub.setDone(todo, !todo.isDone) } }
            Button("Delete", role: .destructive) { Task { await hub.remove(todo) } }
        }
    }

    private var meta: some View {
        HStack(spacing: 8) {
            if let tag = todo.tag {
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2).fill(G.tag(tag)).frame(width: 8, height: 8)
                    Text(tag)
                }
            }
            if let due = Fmt.due(todo.due) { Text(due.text).foregroundStyle(due.color) }
            if let steps = todo.subtasks, !steps.isEmpty {
                Text("\(steps.filter { $0.done == true }.count)/\(steps.count) steps")
            }
            if let why = todo.source?.why { Text(why).lineLimit(1) }
        }
        .font(G.mono(11))
        .foregroundStyle(G.muted)
    }

    @ViewBuilder private var details: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(todo.subtasks ?? []) { step in
                Button { Task { await hub.setStep(todo, step, done: step.done != true) } } label: {
                    HStack(spacing: 10) {
                        CheckCircle(done: step.done == true, size: 20)
                        Text(step.text)
                            .strikethrough(step.done == true, color: G.muted)
                            .font(.system(size: 14))
                            .foregroundStyle(step.done == true ? G.muted : G.text2)
                        Spacer(minLength: 0)
                    }
                }
                .buttonStyle(.plain)
            }
            if let notes = todo.notes, !notes.isEmpty {
                Text(notes).font(.system(size: 14)).foregroundStyle(G.text2)
            }
            if let source = todo.source, let subject = source.subject {
                Text("From \(source.from ?? "email"): \(subject)").font(G.mono(11)).foregroundStyle(G.muted)
            }
            if (todo.subtasks ?? []).isEmpty, (todo.notes ?? "").isEmpty, todo.source?.subject == nil {
                Text("No steps or notes.").font(.system(size: 13)).foregroundStyle(G.muted)
            }
        }
    }
}

/// Tasks Claude spotted in email, waiting for a yes or no.
struct SuggestedCard: View {
    @EnvironmentObject private var hub: HubStore
    let todos: [Todo]

    var body: some View {
        Card(outline: G.aiMail) {
            CardHeader(icon: "sparkles", title: "Suggested from email", gradient: G.mail, meta: "\(todos.count)")
            ForEach(todos) { todo in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(todo.text).font(.system(size: 15, weight: .medium)).foregroundStyle(G.text).fixedSize(horizontal: false, vertical: true)
                        if let why = todo.source?.why { Text(why).font(G.mono(11)).foregroundStyle(G.muted).lineLimit(1) }
                    }
                    Spacer(minLength: 6)
                    Button("Keep") { Task { await hub.keep(todo) } }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(G.bg)
                        .padding(.horizontal, 14)
                        .frame(height: 34)
                        .background(G.text, in: Capsule())
                        .buttonStyle(.plain)
                    Button { Task { await hub.remove(todo) } } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(G.text3)
                            .frame(width: 34, height: 34).background(G.control, in: Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct AddTaskSheet: View {
    enum Due: String, CaseIterable, Identifiable {
        case none = "No date", today = "Today", tomorrow = "Tomorrow", pick = "Pick"
        var id: String { rawValue }
    }

    @EnvironmentObject private var hub: HubStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var tag: String?
    @State private var due: Due = .none
    @State private var date = Date()
    @FocusState private var focused: Bool

    private var tags: [String] { hub.dashboard?.settings?.tags ?? ["School", "PayIt", "Personal"] }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                TextField("What needs doing?", text: $text, axis: .vertical)
                    .font(.system(size: 19, weight: .medium))
                    .lineLimit(1...4)
                    .focused($focused)
                    .padding(14)
                    .background(Color(hex: 0x0F1115), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                SectionLabel(text: "Tag")
                HStack(spacing: 8) {
                    ForEach(tags, id: \.self) { t in
                        choice(t, selected: tag == t, color: G.tag(t)) { tag = tag == t ? nil : t }
                    }
                }
                SectionLabel(text: "Due")
                HStack(spacing: 8) {
                    ForEach(Due.allCases) { d in
                        choice(d.rawValue, selected: due == d, color: G.amber) { due = d }
                    }
                }
                if due == .pick {
                    DatePicker("Date", selection: $date, displayedComponents: .date).datePickerStyle(.graphical).tint(G.amber)
                }
                Spacer()
            }
            .padding(20)
            .graphitePage()
            .navigationTitle("New task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { save() }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium, .large])
    }

    private func choice(_ label: String, selected: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(selected ? G.bg : G.title)
                .padding(.horizontal, 12)
                .frame(height: 34)
                .background(selected ? color : G.panel, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(selected ? Color.clear : Color(hex: 0x2A2F38), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func save() {
        let when: Date?
        switch due {
        case .none: when = nil
        case .today: when = Date()
        case .tomorrow: when = Date().addingTimeInterval(86_400)
        case .pick: when = date
        }
        let task = text.trimmingCharacters(in: .whitespacesAndNewlines)
        Task { await hub.add(text: task, tag: tag, due: when) }
        dismiss()
    }
}
