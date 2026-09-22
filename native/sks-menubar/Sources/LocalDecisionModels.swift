import Foundation

/// Exact `sks decision` argv the Control Center page runs. Tests lock this
/// against the CLI contract so enable/disable cannot silently drift.
enum LocalDecisionCommand {
    static let provider = "openrouter"
    static let pinnedModel = "typesafe/jev-1.13"
    static let statusSchema = "sks.jev-decision-status.v1"
    static let enableSchema = "sks.jev-decision-enable.v1"
    static let disableSchema = "sks.jev-decision-disable.v1"

    static var status: [String] { ["decision", "status", "--json"] }
    static var enable: [String] {
        [
            "decision", "enable",
            "--provider", provider,
            "--model", pinnedModel,
            "--consent-cloud",
            "--json"
        ]
    }
    static var disable: [String] { ["decision", "disable", "--json"] }

    static func mutationSucceeded(_ payload: [String: Any]?, schema: String) -> Bool {
        payload?["ok"] as? Bool == true && payload?["schema"] as? String == schema
    }
}

/// stdout+stderr are merged by ProcessClient. Prefer the first complete object
/// whose schema is a Jev decision payload, not the last nested `{`.
enum LocalDecisionJSON {
    static func object(from text: String) -> [String: Any]? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let object = parseEntire(trimmed) { return object }
        var search = trimmed.startIndex
        var fallback: [String: Any]?
        while search < trimmed.endIndex, let start = trimmed[search...].firstIndex(of: "{") {
            if let slice = completeObject(in: trimmed, from: start), let object = parseEntire(slice) {
                if let schema = object["schema"] as? String, schema.hasPrefix("sks.jev-decision") {
                    return object
                }
                if fallback == nil, object["ok"] != nil { fallback = object }
            }
            search = trimmed.index(after: start)
        }
        return fallback
    }

    static func statusFailureReason(code: Int32, output: String) -> String {
        let text = output.lowercased()
        if code == 127 || text.contains("sks command not found") {
            return "SKS is not on this Menu Bar path. Update SKS, then reopen Decisions."
        }
        if text.contains("unknown subcommand") || text.contains("unknown command")
            || (text.contains("usage: sks") && !text.contains("jev-decision") && !text.contains("sks decision")) {
            return "This SKS build does not include `decision`. Update SKS, then reopen Decisions."
        }
        return "Status unavailable · update SKS, then reopen this page."
    }

    private static func parseEntire(_ text: String) -> [String: Any]? {
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
                if escape { escape = false }
                else if ch == "\\" { escape = true }
                else if ch == "\"" { inString = false }
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

/// Public projection of `sks decision status --json`. Pure parsing so the
/// Control Center page and its tests share one reading of the CLI contract.
struct LocalDecisionStatus: Equatable {
    enum NextStep: String { case missingKey = "missing_key", enable, ready }

    let mode: String
    let provider: String
    let model: String
    let consentCloud: Bool
    let credentialPresent: Bool
    let credentialSource: String?
    let recoverySupported: Bool
    let recoveryReason: String?
    let nextStep: NextStep

    static let schema = LocalDecisionCommand.statusSchema

    static func decode(from payload: [String: Any]) -> LocalDecisionStatus? {
        guard payload["schema"] as? String == schema, payload["ok"] as? Bool == true,
              let mode = payload["mode"] as? String,
              let provider = payload["provider"] as? String,
              let model = payload["model"] as? String,
              let consentCloud = payload["consentCloud"] as? Bool,
              let credential = payload["credential"] as? [String: Any],
              let present = credential["present"] as? Bool else { return nil }
        let recovery = payload["recovery"] as? [String: Any]
        let step = NextStep(rawValue: payload["nextStep"] as? String ?? "") ?? .enable
        return LocalDecisionStatus(
            mode: mode,
            provider: provider,
            model: model,
            consentCloud: consentCloud,
            credentialPresent: present,
            credentialSource: credential["source"] as? String,
            recoverySupported: recovery?["supported"] as? Bool == true,
            recoveryReason: recovery?["reason"] as? String,
            nextStep: step
        )
    }

    var modeTitle: String { mode == "jev" ? "Jev" : "Off" }
    var canEnable: Bool { mode != "jev" }
    var canDisable: Bool { mode == "jev" }

    var badgeText: String {
        if mode == "jev", consentCloud {
            return credentialPresent ? "Ready · Jev via OpenRouter" : "Jev on · add OpenRouter key"
        }
        return "Off · deterministic baseline"
    }

    var badgeReady: Bool { mode == "jev" && consentCloud && credentialPresent }

    var modelLabel: String {
        let credential = credentialPresent ? (credentialSource ?? "present") : "missing"
        return "\(model) via \(provider) · credential \(credential)"
    }

    var guidance: String {
        switch nextStep {
        case .missingKey:
            return "Add an OpenRouter key in Connections first. SKS reuses that credential; there is no Jev-specific secret. You can still turn the mode on from this page; preparation stays on the deterministic baseline until a key is present."
        case .enable:
            return "Turn Jev on here to use it in official-subagent preparation. Off makes no network call. Jev may choose an automatic plan variant or optional context; recovery is unsupported."
        case .ready:
            return "Jev is on. Eligible Naruto/official preparation may send one bounded Decisions request and compile the answer into the SKS plan. Recovery remains unsupported, and a saved plan is not proof that Codex spawned a child."
        }
    }

    static let enableConsentBody = "SKS will send bounded task evidence to OpenRouter's Decisions endpoint using your existing OpenRouter credential. A valid answer is compiled into an existing plan or context selection. This is not a measured performance claim, and recovery stays unsupported."

    var enableConsentMessage: String {
        if credentialPresent { return Self.enableConsentBody }
        return "\(Self.enableConsentBody) No OpenRouter key is saved yet — add one in Connections or Jev stays on the deterministic baseline."
    }
}
