import Foundation

/// One `available` row of `sks bridge subagent-models list --json`: an
/// OpenRouter model the bridge catalog knows.
struct SubagentModelOption: Equatable {
    let publicId: String
    let displayName: String
    /// false for a saved or drafted model the catalog no longer lists.
    var listed = true

    var menuTitle: String {
        guard listed else { return "\(publicId)  ·  not in the current catalog" }
        return displayName == publicId ? publicId : "\(displayName)  ·  \(publicId)"
    }
}

/// `subagent-models.list` / `subagent-models.set` answers: the mode with its
/// saved list, and (when reported) the models the row popups can offer.
struct SubagentModelsSnapshot: Equatable {
    static let operations: Set<String> = ["subagent-models.list", "subagent-models.set"]

    let mode: OpenRouterOnlyState
    /// nil when the answer did not include `available` (keep the previous list).
    let available: [SubagentModelOption]?

    static func decode(_ payload: [String: Any]) -> SubagentModelsSnapshot? {
        guard payload["schema"] as? String == OpenRouterOnlyCommand.resultSchema,
              let operation = payload["operation"] as? String, operations.contains(operation),
              let mode = OpenRouterOnlyState.decode(payload) else { return nil }
        let result = payload["result"] as? [String: Any]
        var seen = Set<String>()
        let available = (result?["available"] as? [Any]).map { rows in
            rows.compactMap { value -> SubagentModelOption? in
                guard let row = value as? [String: Any],
                      let id = OpenRouterOnlyJSON.text(row["public_id"]),
                      SubagentModelRules.isModelId(id),
                      seen.insert(id.lowercased()).inserted else { return nil }
                return SubagentModelOption(publicId: id, displayName: OpenRouterOnlyJSON.text(row["display_name"]) ?? id)
            }
        }
        return SubagentModelsSnapshot(mode: mode, available: available)
    }
}

/// Pure edits of the unapplied list. The page keeps one draft array and
/// always sends the complete list, never a patch.
enum SubagentModelDraft {
    static let effortTitles = ["Default", "low", "medium", "high", "xhigh"]

    /// Popup rows: every available model, then saved or drafted models the CLI
    /// no longer lists, so a popup never misstates a choice.
    static func popupOptions(available: [SubagentModelOption], entries: [SubagentModelEntry]) -> [SubagentModelOption] {
        var seen = Set(available.map { $0.publicId.lowercased() })
        let missing = entries.filter { seen.insert($0.model.lowercased()).inserted }
            .map { SubagentModelOption(publicId: $0.model, displayName: $0.model, listed: false) }
        return available + missing
    }

    /// A new row takes the first available model not already on the list.
    static func adding(_ entries: [SubagentModelEntry], available: [SubagentModelOption]) -> [SubagentModelEntry]? {
        guard entries.count < SubagentModelRules.maxModels else { return nil }
        let used = Set(entries.map { $0.model.lowercased() })
        guard let next = available.first(where: { !used.contains($0.publicId.lowercased()) }) else { return nil }
        return entries + [SubagentModelEntry(model: next.publicId, criteria: "", reasoningEffort: nil, isDefault: entries.isEmpty, routable: nil)]
    }

    static func removing(_ entries: [SubagentModelEntry], at index: Int) -> [SubagentModelEntry] {
        guard entries.indices.contains(index) else { return entries }
        var next = entries
        next.remove(at: index)
        return withOneDefault(next)
    }

    static func settingDefault(_ entries: [SubagentModelEntry], at index: Int) -> [SubagentModelEntry] {
        guard entries.indices.contains(index) else { return entries }
        return entries.enumerated().map { offset, entry in
            var copy = entry
            copy.isDefault = offset == index
            return copy
        }
    }

    /// Same rule as the CLI: the first default wins, else the first row.
    static func withOneDefault(_ entries: [SubagentModelEntry]) -> [SubagentModelEntry] {
        let first = entries.firstIndex(where: \.isDefault) ?? 0
        return entries.enumerated().map { offset, entry in
            var copy = entry
            copy.isDefault = offset == first
            return copy
        }
    }

    static func effort(title: String?) -> String? {
        guard let title, SubagentModelRules.efforts.contains(title) else { return nil }
        return title
    }

    /// The CLI caps criteria at 240 UTF-16 units (JavaScript `slice`). Capping
    /// whole characters to the same budget keeps its slice a no-op, so the
    /// saved text reads back exactly. While typing, spaces are kept.
    static func limitCriteria(_ text: String) -> String {
        let limit = SubagentModelRules.maxCriteriaCharacters
        guard text.utf16.count > limit else { return text }
        var kept = ""
        for character in text {
            guard kept.utf16.count + String(character).utf16.count <= limit else { break }
            kept.append(character)
        }
        return kept
    }

    /// JavaScript `\s` plus the C0 controls and DEL the CLI folds into spaces.
    private static let criteriaSeparators: CharacterSet = {
        var set = CharacterSet(charactersIn: "\u{0}"..."\u{20}")
        set.insert(charactersIn: "\u{7F}\u{A0}\u{1680}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}")
        set.insert(charactersIn: "\u{2000}"..."\u{200A}")
        return set
    }()

    /// Same cleanup as the CLI's cleanCriteria: controls and whitespace runs
    /// become one space, then trim and cap.
    static func cleanCriteria(_ text: String) -> String {
        let collapsed = text.components(separatedBy: criteriaSeparators)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return limitCriteria(collapsed)
    }

    static func normalizedForSubmit(_ entries: [SubagentModelEntry]) -> [SubagentModelEntry] {
        withOneDefault(entries.map { entry in
            var copy = entry.submitted
            copy.model = entry.model.trimmingCharacters(in: .whitespacesAndNewlines)
            copy.criteria = cleanCriteria(entry.criteria)
            return copy
        })
    }

    /// Local mirror of normalizeSubagentModelList; codes carry the row index.
    static func issues(_ entries: [SubagentModelEntry]) -> [String] {
        var seen = Set<String>()
        var issues: [String] = []
        for (index, entry) in entries.enumerated() {
            let model = entry.model.trimmingCharacters(in: .whitespacesAndNewlines)
            if !SubagentModelRules.isModelId(model) {
                issues.append("subagent_model_id_invalid:\(index)")
            } else if !seen.insert(model.lowercased()).inserted {
                issues.append("subagent_model_duplicate:\(index)")
            } else if let effort = entry.reasoningEffort, !SubagentModelRules.efforts.contains(effort) {
                issues.append("subagent_model_effort_invalid:\(index)")
            } else if entry.criteriaUnreadable {
                issues.append("subagent_model_criteria_redacted:\(index)")
            } else if index >= SubagentModelRules.maxModels {
                issues.append("subagent_model_list_too_long:\(index)")
            }
        }
        return issues
    }

    /// A redacted answer row takes the text this page already holds when that
    /// text redacts to exactly the answer; any other redacted row stays
    /// unreadable, and `issues` keeps it from being applied.
    static func restoringCriteria(_ incoming: [SubagentModelEntry], known: [SubagentModelEntry], redact: (String) -> String) -> [SubagentModelEntry] {
        incoming.map { entry in
            guard entry.criteriaUnreadable, let match = known.first(where: {
                $0.model.lowercased() == entry.model.lowercased() && !$0.criteriaUnreadable
                    && (redact(cleanCriteria($0.criteria)) == entry.criteria || fitsRedacted(cleanCriteria($0.criteria), answer: entry.criteria))
            }) else { return entry }
            var copy = entry
            copy.criteria = cleanCriteria(match.criteria)
            return copy
        }
    }

    /// The CLI and Control Center redact with different patterns; either way
    /// each "[redacted]" stands for some text the known criteria must supply.
    static func fitsRedacted(_ text: String, answer: String) -> Bool {
        let marker = NSRegularExpression.escapedPattern(for: "[redacted]")
        let pattern = "^" + NSRegularExpression.escapedPattern(for: answer).replacingOccurrences(of: marker, with: ".+?") + "$"
        guard answer.contains("[redacted]"), let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) else { return false }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    static func isDirty(draft: [SubagentModelEntry], saved: [SubagentModelEntry]) -> Bool {
        normalizedForSubmit(draft) != normalizedForSubmit(saved)
    }

    /// stdin for `bridge subagent-models set --stdin --json`.
    static func stdinPayload(_ entries: [SubagentModelEntry]) -> String? {
        let rows: [[String: Any]] = normalizedForSubmit(entries).map { entry in
            [
                "model": entry.model,
                "criteria": entry.criteria,
                "reasoning_effort": entry.reasoningEffort.map { $0 as Any } ?? NSNull(),
                "default": entry.isDefault
            ]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: ["subagent_models": rows], options: [.sortedKeys, .withoutEscapingSlashes]),
              let text = String(data: data, encoding: .utf8) else { return nil }
        return text + "\n"
    }
}
