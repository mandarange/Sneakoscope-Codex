import Foundation

/// Exact `sks bridge …` argv for OpenRouter Only and its subagent model list.
/// Criteria are free text, so `set` sends the whole list on stdin, never argv.
enum OpenRouterOnlyCommand {
    static let resultSchema = "sks.desktop-bridge-command-result.v1"

    static var status: [String] { ["bridge", "openrouter-only", "status", "--json"] }
    static func set(enabled: Bool) -> [String] { ["bridge", "openrouter-only", enabled ? "on" : "off", "--json"] }
    static var listSubagentModels: [String] { ["bridge", "subagent-models", "list", "--json"] }
    static var setSubagentModels: [String] { ["bridge", "subagent-models", "set", "--stdin", "--json"] }
}

/// Mirrors src/core/subagents/child-model-allowlist.ts so a bad list is caught
/// before Apply; the CLI validates again and stays authoritative.
enum SubagentModelRules {
    static let maxModels = 16
    static let maxCriteriaCharacters = 240
    static let efforts = ["low", "medium", "high", "xhigh"]

    /// Same pattern as isOpenRouterModelId: `vendor/model[:variant]`, at most 160 characters.
    static func isModelId(_ id: String) -> Bool {
        guard id.count <= 160 else { return false }
        return id.range(of: #"^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }
}

/// One row of `result.openrouter_only.subagent_models`.
struct SubagentModelEntry: Equatable {
    var model: String
    var criteria: String
    var reasoningEffort: String?
    var isDefault: Bool
    /// The CLI's answer: the model has an OpenRouter route now. nil for local drafts.
    var routable: Bool?

    static func decode(_ value: Any) -> SubagentModelEntry? {
        guard let row = value as? [String: Any], let model = OpenRouterOnlyJSON.text(row["model"]) else { return nil }
        let effort = OpenRouterOnlyJSON.text(row["reasoning_effort"]).flatMap { SubagentModelRules.efforts.contains($0) ? $0 : nil }
        return SubagentModelEntry(
            model: model,
            criteria: row["criteria"] as? String ?? "",
            reasoningEffort: effort,
            isDefault: row["default"] as? Bool == true,
            routable: row["routable"] as? Bool
        )
    }

    /// ProcessClient redacts text that looks like a secret in every answer, so
    /// these criteria are not the saved text and must never be sent back.
    var criteriaUnreadable: Bool { criteria.range(of: "[redacted]", options: .caseInsensitive) != nil }

    /// The user-editable part; routability never counts as an edit.
    var submitted: SubagentModelEntry {
        var copy = self
        copy.routable = nil
        return copy
    }
}

/// `result.openrouter_only` of the openrouter-only and subagent-models answers
/// (and of `auth-priority on`, which turns this mode off first). Like the
/// Codex-LB preference, "on but unavailable" is a distinct saved state.
struct OpenRouterOnlyState: Equatable {
    let enabled: Bool
    let state: String
    let error: String?
    let mainModel: String?
    let defaultSubagentModel: String?
    let subagentModels: [SubagentModelEntry]
    let jevEnabled: Bool
    let warnings: [String]

    static func decode(_ payload: [String: Any]) -> OpenRouterOnlyState? {
        let result = payload["result"] as? [String: Any]
        guard let raw = (result?["openrouter_only"] ?? payload["openrouter_only"]) as? [String: Any],
              let enabled = raw["enabled"] as? Bool,
              let state = raw["state"] as? String,
              ["off", "active", "unavailable"].contains(state),
              !(enabled && state == "off") else { return nil }
        return OpenRouterOnlyState(
            enabled: enabled,
            state: enabled ? state : "off",
            error: OpenRouterOnlyJSON.text(raw["error"]),
            mainModel: OpenRouterOnlyJSON.text(raw["main_model"]),
            defaultSubagentModel: OpenRouterOnlyJSON.text(raw["default_subagent_model"]),
            subagentModels: (raw["subagent_models"] as? [Any] ?? []).compactMap(SubagentModelEntry.decode),
            jevEnabled: raw["jev_enabled"] as? Bool == true,
            warnings: OpenRouterOnlyJSON.strings(raw["warnings"])
        )
    }

    var message: String {
        switch state {
        case "active": return "On · Codex and its subagents use OpenRouter models only"
        case "off":
            // A mode that is off can still report why turning it on would fail.
            return error.map { "Off · before turning on: " + OpenRouterOnlyMessages.describe($0) }
                ?? "Off · Codex uses its configured model routes"
        default:
            return "On, unavailable · " + OpenRouterOnlyMessages.describe(error ?? "openrouter_only_unavailable")
        }
    }

    var modelSummary: String? {
        guard enabled else { return nil }
        let main = mainModel ?? "not set"
        let child = defaultSubagentModel ?? "none"
        return "Main model: \(main) · default subagent model: \(child) · Jev routing \(jevEnabled ? "on" : "off")"
    }

    var unroutableModels: [String] { subagentModels.filter { $0.routable == false }.map(\.model) }
    /// `unroutableModels` already names each unroutable list model; its
    /// per-model warning would say the same thing again.
    var warningMessages: [String] {
        warnings.filter { !$0.hasPrefix(OpenRouterOnlyMessages.unroutableWarningPrefix) }.map(OpenRouterOnlyMessages.describe)
    }
}

/// Human wording for blocker, error and warning codes. Unknown codes stay readable.
enum OpenRouterOnlyMessages {
    /// Codes an SKS build without these commands answers with.
    static let olderCliCodes: Set<String> = ["bridge_command_invalid", "bridge_command_unknown_option", "unknown_command"]
    static let unroutableWarningPrefix = "openrouter_only_subagent_model_unroutable:"

    static func describe(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: ":", maxSplits: 1).map(String.init)
        let code = parts.first ?? trimmed
        let row = parts.count > 1 ? Int(parts[1]).map { "Row \($0 + 1): " } ?? "" : ""
        switch code {
        case "openrouter_only_provider_disabled":
            return "OpenRouter is turned off. Enable it under Accounts on the Connections page."
        case "openrouter_only_credential_missing":
            return "OpenRouter is not connected. Connect it under Accounts on the Connections page."
        case "openrouter_only_no_openrouter_models":
            return "No OpenRouter model is selected. Choose models under Models in Codex on the Connections page first."
        case "openrouter_only_subagent_list_empty":
            return "The subagent model list is empty. Add at least one model on the Subagent Models page."
        case "openrouter_only_main_model_not_openrouter":
            return "Codex's main model is not an OpenRouter model. Turn OpenRouter Only off and on again to reapply it."
        case "desktop_bridge_not_running", "desktop_bridge_runtime_not_ready":
            return "The Desktop Bridge is not running. Open Bridge diagnostics on the Connections page and repair it."
        case "openrouter_only_no_routable_subagent_model":
            return "No model on the subagent list has an OpenRouter route. Add a model Codex offers under Models in Codex, then try again."
        case "codex_restart_failed_manual_restart_required":
            return "Codex could not be restarted. Quit and reopen Codex to load the change."
        case "openrouter_only_main_model_unparsed":
            return "SKS cannot read the model line in ~/.codex/config.toml. Write it as model = \"vendor/model\", then turn OpenRouter Only on again."
        case "openrouter_only_main_model_unexposed":
            return "Codex's main model is not in the Codex model list. Add it under Models in Codex on the Connections page."
        case "openrouter_only_main_model_switch_failed", "openrouter_only_main_model_write_not_applied":
            return "SKS could not change Codex's main model. Pick an OpenRouter model in Codex's model picker."
        case "openrouter_only_read_only_role_install_failed":
            return "SKS could not install the read-only subagent role in ~/.codex/agents. Check that folder's permissions."
        case let value where value.hasPrefix("openrouter_only_main_model_write_"):
            return "SKS did not change Codex's model line because config.toml changed at the same time. Try again."
        case "openrouter_only_codex_image_mode_unavailable":
            return "Codex's built-in image generation does not work on OpenRouter models. Choose a custom image model on the Image Generation page."
        case "subagent_model_id_invalid":
            return row + "not an OpenRouter model id (vendor/model)."
        case "subagent_model_duplicate":
            return row + "this model is already on the list."
        case "subagent_model_effort_invalid":
            return row + "effort must be Default, low, medium, high, or xhigh."
        case "subagent_model_list_too_long":
            return row + "the list holds at most \(SubagentModelRules.maxModels) models."
        case "subagent_model_criteria_redacted":
            return row + "part of these criteria looks like a secret, so SKS output hid it. Type the criteria again before applying."
        case let value where olderCliCodes.contains(value):
            return "This SKS build does not include OpenRouter Only. Update SKS, then reopen this page."
        case "native_process_timeout":
            return "SKS did not answer in time."
        case "native_process_output_limit":
            return "SKS returned more output than Control Center accepts."
        case "native_process_empty_output":
            return "SKS returned no output."
        default:
            // Only the code is humanized; a value after ':' (a model id) stays exact.
            let words = code.replacingOccurrences(of: "_", with: " ")
            guard let first = words.first else { return "Unknown issue." }
            let text = first.uppercased() + words.dropFirst()
            return parts.count > 1 ? text + ": " + parts[1] : text
        }
    }
}

/// Schema-agnostic reading of any answer: command results carry blockers in
/// `execution`, CLI refusals and native process failures at the top level.
struct OpenRouterOnlyReceipt: Equatable {
    let ok: Bool
    let blockers: [String]

    static func decode(_ payload: [String: Any]?) -> OpenRouterOnlyReceipt {
        let execution = payload?["execution"] as? [String: Any]
        var seen = Set<String>()
        let blockers = (OpenRouterOnlyJSON.strings(execution?["blockers"])
            + OpenRouterOnlyJSON.strings(payload?["blockers"])
            + [OpenRouterOnlyJSON.text(payload?["reason"]), OpenRouterOnlyJSON.text(payload?["error"])].compactMap { $0 })
            .filter { seen.insert($0).inserted }
        return OpenRouterOnlyReceipt(ok: payload?["ok"] as? Bool == true, blockers: blockers)
    }

    var primaryIssue: String? { blockers.first.map(OpenRouterOnlyMessages.describe) }
}

/// Command execution and the saved mode are separate facts, exactly as for the
/// Codex-LB preference: a setup failure after the write is not a rollback.
enum OpenRouterOnlyMutationOutcome: Equatable {
    case saved(OpenRouterOnlyState)
    case savedWithSetupIssue(OpenRouterOnlyState)
    case notApplied(OpenRouterOnlyState)
    case unconfirmed

    static func resolve(payload: [String: Any]?, desired: Bool, commandSucceeded: Bool, responseComplete: Bool) -> OpenRouterOnlyMutationOutcome {
        guard responseComplete, let payload = payload, let state = OpenRouterOnlyState.decode(payload) else { return .unconfirmed }
        guard state.enabled == desired else { return .notApplied(state) }
        return commandSucceeded ? .saved(state) : .savedWithSetupIssue(state)
    }

    var observedState: OpenRouterOnlyState? {
        switch self {
        case .saved(let state), .savedWithSetupIssue(let state), .notApplied(let state): return state
        case .unconfirmed: return nil
        }
    }

    var succeeded: Bool {
        if case .saved = self { return true }
        return false
    }

    var operationSummary: String {
        switch self {
        case .saved: return "OpenRouter Only setting saved"
        case .savedWithSetupIssue: return "OpenRouter Only setting saved; setup needs attention"
        case .notApplied: return "Requested OpenRouter Only setting was not saved; current setting confirmed"
        case .unconfirmed: return "OpenRouter Only setting could not be confirmed"
        }
    }
}

/// ProcessClient merges stdout and stderr, and a timeout appends a native
/// failure object. Prefer the command result over banners or trailing noise.
enum OpenRouterOnlyJSON {
    private static let preferredSchemas = [OpenRouterOnlyCommand.resultSchema, "sks.bridge-command-error.v1", "sks.native-process-error.v1"]

    static func object(from text: String) -> [String: Any]? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let whole = parse(trimmed) { return whole }
        var objects: [[String: Any]] = []
        var search = trimmed.startIndex
        while search < trimmed.endIndex, let start = trimmed[search...].firstIndex(of: "{") {
            if let slice = completeObject(in: trimmed, from: start), let object = parse(slice) {
                objects.append(object)
                search = trimmed.index(start, offsetBy: slice.count)
            } else {
                search = trimmed.index(after: start)
            }
        }
        for schema in preferredSchemas {
            if let match = objects.first(where: { $0["schema"] as? String == schema }) { return match }
        }
        return objects.first { $0["ok"] != nil }
    }

    /// Why a read failed, in words a user can act on; an older CLI says "update SKS".
    static func unavailableReason(code: Int32, output: String, payload: [String: Any]?) -> String {
        let lower = output.lowercased()
        if code == 127 || lower.contains("sks command not found") {
            return "SKS is not on this Menu Bar path. Update SKS, then reopen this page."
        }
        let receipt = OpenRouterOnlyReceipt.decode(payload)
        if receipt.blockers.contains(where: OpenRouterOnlyMessages.olderCliCodes.contains)
            || lower.contains("unknown command") || lower.contains("unknown subcommand") {
            return OpenRouterOnlyMessages.describe("unknown_command")
        }
        return receipt.primaryIssue ?? "SKS returned no readable answer. Update SKS, then reopen this page."
    }

    static func text(_ value: Any?) -> String? {
        guard let string = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !string.isEmpty else { return nil }
        return string
    }

    static func strings(_ value: Any?) -> [String] { (value as? [Any] ?? []).compactMap(text) }

    private static func parse(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private static func completeObject(in text: String, from start: String.Index) -> String? {
        var depth = 0
        var inString = false
        var escape = false
        var index = start
        while index < text.endIndex {
            let ch = text[index]
            if inString {
                if escape { escape = false } else if ch == "\\" { escape = true } else if ch == "\"" { inString = false }
            } else if ch == "\"" {
                inString = true
            } else if ch == "{" {
                depth += 1
            } else if ch == "}" {
                depth -= 1
                if depth == 0 { return String(text[start...index]) }
            }
            index = text.index(after: index)
        }
        return nil
    }
}
