import Foundation

/// Where a chat stands, from your point of view.
enum ChatState: Equatable {
    /// Claude is blocked until you answer. The string says what it is waiting for.
    case needsInput(String)
    case running
    case done
}

struct Chat: Identifiable, Equatable {
    /// The Claude Code session id.
    let id: String
    let pid: pid_t
    let title: String
    let cwd: String
    let project: String
    let state: ChatState
    /// When the chat entered its current state.
    let since: Date
    /// The Claude app's id for the chat (`local_…`), used to open it there.
    let hostSessionId: String?
    let isDesktop: Bool
    let isBackground: Bool
    /// The last thing Claude said, for finished chats.
    let preview: String?
    /// What a running chat is busy with, from the last tool it used ("Running commands").
    let activity: String?
}

enum Activity {
    /// A plain description of what a chat is doing, from a Claude Code tool name.
    static func describe(_ tool: String) -> String? {
        switch tool {
        case "Bash", "BashOutput", "KillShell", "Monitor": return "Running commands"
        case "Edit", "Write", "MultiEdit", "NotebookEdit": return "Editing files"
        case "Read", "Grep", "Glob", "LS": return "Reading files"
        case "WebSearch", "WebFetch": return "Searching the web"
        case "Task", "Agent", "Workflow": return "Working with helpers"
        case "TodoWrite": return "Planning"
        case "Skill": return "Using a skill"
        default: break
        }
        guard tool.hasPrefix("mcp__") else { return nil }
        let server = tool.dropFirst(5).components(separatedBy: "__").first ?? ""
        switch server {
        case "Claude_Browser", "claude-in-chrome": return "Using the browser"
        case "computer-use": return "Using your computer"
        case "local-mcp": return "Using your Mac apps"
        case _ where server.hasPrefix("ccd_"): return nil // the app's own bookkeeping
        case _ where server.count == 36 && server.filter({ $0 == "-" }).count == 4: return "Using a connector"
        default: return "Using " + server.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
        }
    }
}

// MARK: - Files written by Claude Code

/// One file in `~/.claude/sessions/`, which Claude Code keeps current for every live session.
struct RegistryEntry: Decodable {
    let pid: Int32
    let sessionId: String?
    let cwd: String?
    let startedAt: Double?
    let kind: String?
    let entrypoint: String?
    let hostSessionId: String?
    let name: String?
    /// "busy", "idle" or "waiting".
    let status: String?
    let waitingFor: String?
    let needs: String?
    let statusUpdatedAt: Double?
    let updatedAt: Double?
    let spare: Bool?
}

/// The latest hook event for a session, written by `hooks/claude-status-hook.sh`.
struct HookEvent: Decodable {
    let event: String
    let notificationType: String?
    let tool: String?
    let message: String?
    var date: Date = .distantPast

    enum CodingKeys: String, CodingKey {
        case event
        case notificationType = "notification_type"
        case tool
        case message
    }

    /// What a running chat is doing, when this event is a tool it just used.
    var activity: String? {
        guard ["PostToolUse", "PostToolUseFailure", "PreToolUse"].contains(event), let tool = tool?.nonEmpty else { return nil }
        return Activity.describe(tool)
    }

    /// What Claude is waiting for when this event means it is blocked on you, or nil.
    var attentionReason: String? {
        switch event {
        case "PermissionRequest":
            return tool.flatMap(\.nonEmpty).map { "Wants to use \($0)" } ?? "Needs your permission"
        case "Elicitation":
            return "Needs your input"
        case "PreToolUse":
            switch tool {
            case "AskUserQuestion": return "Has a question for you"
            case "ExitPlanMode": return "Plan is ready for review"
            default: return nil
            }
        case "Notification":
            switch notificationType {
            case "idle_prompt", "auth_success": return nil
            default:
                guard let message = message?.nonEmpty else { return "Needs your attention" }
                let prefix = "Claude needs your permission to use "
                return message.hasPrefix(prefix) ? "Wants to use " + message.dropFirst(prefix.count) : message
            }
        default:
            return nil
        }
    }
}

extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    var capitalizedFirst: String {
        prefix(1).uppercased() + dropFirst()
    }
}
