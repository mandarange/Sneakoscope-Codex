import Foundation

/// Exact `sks imagegen` argv the Control Center Image Generation page runs.
/// Tests lock these arrays against the CLI contract so a flag cannot drift.
enum ImageGenerationCommand {
    static let statusSchema = "sks.imagegen-status.v1"
    static let modelsSchema = "sks.imagegen-openrouter-models.v1"

    static var status: [String] { ["imagegen", "status", "--json"] }
    /// `refresh` bypasses the CLI's six-hour OpenRouter model cache.
    static func models(refresh: Bool = false) -> [String] {
        refresh ? ["imagegen", "models", "--refresh", "--json"] : ["imagegen", "models", "--json"]
    }
    static func enable(model: String) -> [String] { ["imagegen", "enable", "--model", model, "--json"] }
    static var disable: [String] { ["imagegen", "disable", "--json"] }

    /// Ids come from the CLI's own catalog; still refuse anything its argument
    /// parser could read as a flag, or that carries whitespace or control bytes.
    static func isAcceptableModelId(_ id: String) -> Bool {
        guard !id.isEmpty, id.count <= 200, !id.hasPrefix("-") else { return false }
        let rejected = CharacterSet.whitespacesAndNewlines.union(.controlCharacters)
        return id.unicodeScalars.allSatisfy { !rejected.contains($0) }
    }

    /// enable/disable answer with the status shape plus `changed`.
    static func mutationSucceeded(code: Int32, payload: [String: Any]?) -> Bool {
        code == 0 && payload?["ok"] as? Bool == true && payload?["schema"] as? String == statusSchema
    }
}

/// stdout+stderr are merged by ProcessClient. Prefer the first complete
/// `sks.imagegen…` object over banners, nested braces, or trailing noise.
enum ImageGenerationJSON {
    static func object(from text: String) -> [String: Any]? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let object = parse(trimmed) { return object }
        var search = trimmed.startIndex
        var fallback: [String: Any]?
        while search < trimmed.endIndex, let start = trimmed[search...].firstIndex(of: "{") {
            if let slice = completeObject(in: trimmed, from: start), let object = parse(slice) {
                if (object["schema"] as? String)?.hasPrefix("sks.imagegen") == true { return object }
                if fallback == nil, object["ok"] != nil { fallback = object }
            }
            search = trimmed.index(after: start)
        }
        return fallback
    }

    /// Why status or the model list could not be read, in words a user can act on.
    static func unavailableReason(code: Int32, output: String, payload: [String: Any]?) -> String {
        let text = output.lowercased()
        if code == 127 || text.contains("sks command not found") {
            return "SKS is not on this Menu Bar path. Update SKS, then reopen Image Generation."
        }
        if payload?["reason"] as? String == "unknown_command"
            || text.contains("unknown command") || text.contains("unknown subcommand") {
            return ImageGenerationMessages.describe("unknown_command")
        }
        if let issue = ImageGenerationReceipt.decode(from: payload).primaryIssue { return issue }
        return "SKS returned no readable answer. Update SKS, then reopen this page."
    }

    static func text(_ value: Any?) -> String? {
        guard let string = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !string.isEmpty else { return nil }
        return string
    }

    static func strings(_ value: Any?) -> [String] {
        (value as? [Any] ?? []).compactMap(text)
    }

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

/// Human wording for CLI blocker/warning codes. Unknown codes stay readable.
enum ImageGenerationMessages {
    static func describe(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        let detail = parts.count > 1 && !parts[1].isEmpty ? " (\(parts[1]))" : ""
        switch parts.first ?? "" {
        case "imagegen_model_not_image_capable":
            return "That model cannot create images. Choose one whose output includes images." + detail
        case "imagegen_model_required":
            return "Choose an OpenRouter image model first." + detail
        case "openrouter_models_unavailable":
            return "The OpenRouter model list is unavailable. Check the OpenRouter connection, then choose Refresh." + detail
        case "unknown_command":
            return "This SKS build does not include `imagegen`. Update SKS, then reopen Image Generation."
        case "native_process_timeout":
            return "SKS did not answer in time."
        case "native_process_output_limit":
            return "SKS returned more output than Control Center accepts."
        case "native_process_empty_output":
            return "SKS returned no output."
        default:
            let words = trimmed.replacingOccurrences(of: "_", with: " ")
            guard let first = words.first else { return "Unknown issue." }
            return first.uppercased() + words.dropFirst()
        }
    }
}

/// Schema-agnostic reading of any imagegen answer: enable refusals (ok:false,
/// exit 1), native process failures, and older CLIs without `imagegen`.
struct ImageGenerationReceipt: Equatable {
    let ok: Bool
    let changed: Bool?
    let blockers: [String]
    let warnings: [String]
    let reason: String?

    static func decode(from payload: [String: Any]?) -> ImageGenerationReceipt {
        ImageGenerationReceipt(
            ok: payload?["ok"] as? Bool == true,
            changed: payload?["changed"] as? Bool,
            blockers: ImageGenerationJSON.strings(payload?["blockers"]),
            warnings: ImageGenerationJSON.strings(payload?["warnings"]),
            reason: ImageGenerationJSON.text(payload?["reason"]) ?? ImageGenerationJSON.text(payload?["error"])
        )
    }

    var primaryIssue: String? { (blockers.first ?? reason).map(ImageGenerationMessages.describe) }
}

enum ImageGenerationTone: Equatable { case ready, neutral, attention }

/// Public projection of `sks imagegen status --json`; enable/disable answer
/// with the same shape plus `changed`. Unknown fields are ignored and missing
/// optional fields decode as nil.
struct ImageGenerationStatus: Equatable {
    struct Effective: Equatable {
        let provider: String
        let model: String?
        let label: String?
    }

    let ok: Bool
    let mode: String
    let customModelEnabled: Bool
    let openRouterModel: String?
    /// nil when the CLI did not say; only an explicit `false` shows the key hint.
    let openRouterKeyPresent: Bool?
    let effective: Effective?
    let jevEnabled: Bool
    let blockers: [String]
    let warnings: [String]
    let configPath: String?
    let changed: Bool?

    static let jevNoteText = "Jev picks image size and quality for each request."

    static func decode(from payload: [String: Any]) -> ImageGenerationStatus? {
        guard payload["schema"] as? String == ImageGenerationCommand.statusSchema,
              let customModelEnabled = payload["custom_model_enabled"] as? Bool else { return nil }
        let effective = (payload["effective"] as? [String: Any]).flatMap { row -> Effective? in
            guard let provider = ImageGenerationJSON.text(row["provider"]) else { return nil }
            return Effective(provider: provider, model: ImageGenerationJSON.text(row["model"]), label: ImageGenerationJSON.text(row["label"]))
        }
        return ImageGenerationStatus(
            ok: payload["ok"] as? Bool == true,
            mode: ImageGenerationJSON.text(payload["mode"]) ?? (customModelEnabled ? "openrouter" : "codex"),
            customModelEnabled: customModelEnabled,
            openRouterModel: ImageGenerationJSON.text(payload["openrouter_model"]),
            openRouterKeyPresent: payload["openrouter_key_present"] as? Bool,
            effective: effective,
            jevEnabled: payload["jev_enabled"] as? Bool == true,
            blockers: ImageGenerationJSON.strings(payload["blockers"]),
            warnings: ImageGenerationJSON.strings(payload["warnings"]),
            configPath: ImageGenerationJSON.text(payload["config_path"]),
            changed: payload["changed"] as? Bool
        )
    }

    var effectiveProvider: String { effective?.provider ?? mode }
    private var effectiveModel: String? { effective?.model ?? (effectiveProvider == "openrouter" ? openRouterModel : nil) }

    var badgeText: String {
        if let label = effective?.label { return label }
        if effectiveProvider == "openrouter" { return "OpenRouter · \(effectiveModel ?? "no model selected")" }
        return "Codex default image generation"
    }

    var tone: ImageGenerationTone {
        if !ok || !blockers.isEmpty { return .attention }
        guard customModelEnabled else { return .neutral }
        let routed = effectiveProvider == "openrouter" && effectiveModel != nil
        return routed && openRouterKeyPresent != false ? .ready : .attention
    }

    var routeDetail: String {
        let route = effectiveProvider == "openrouter"
            ? "OpenRouter through the SKS Desktop Bridge"
            : effectiveProvider == "codex" ? "Codex built-in image generation" : effectiveProvider
        return effectiveModel.map { "\(route) · model \($0)" } ?? route
    }

    var keyHint: String? {
        openRouterKeyPresent == false
            ? "A custom image model needs an OpenRouter key. Add it under Accounts → OpenRouter on the Connections page."
            : nil
    }

    var jevNote: String? { jevEnabled ? Self.jevNoteText : nil }
    var blockerMessages: [String] { blockers.map(ImageGenerationMessages.describe) }
    var warningMessages: [String] { warnings.map(ImageGenerationMessages.describe) }
}

/// One row of `sks imagegen models --json`.
struct ImageGenerationModel: Equatable {
    let id: String
    let name: String
    let inputModalities: [String]
    let outputModalities: [String]
    let promptPrice: String?
    let completionPrice: String?
    let imagePrice: String?
    let contextLength: Int?
    let selected: Bool

    /// Rows without an id (including JSON null rows) are skipped.
    static func decode(from value: Any) -> ImageGenerationModel? {
        guard let row = value as? [String: Any], let id = ImageGenerationJSON.text(row["id"]) else { return nil }
        let pricing = row["pricing"] as? [String: Any]
        return ImageGenerationModel(
            id: id,
            name: ImageGenerationJSON.text(row["name"]) ?? id,
            inputModalities: ImageGenerationJSON.strings(row["input_modalities"]),
            outputModalities: ImageGenerationJSON.strings(row["output_modalities"]),
            promptPrice: price(pricing?["prompt"]),
            completionPrice: price(pricing?["completion"]),
            imagePrice: price(pricing?["image"]),
            contextLength: (row["context_length"] as? NSNumber)?.intValue,
            selected: row["selected"] as? Bool == true
        )
    }

    /// Popup title: display name and exact id; the saved model is marked.
    func menuTitle(current: Bool) -> String {
        let base = name == id ? id : "\(name)  ·  \(id)"
        return current ? "\(base)  ·  current" : base
    }

    var capabilityLine: String {
        let input = inputModalities.isEmpty ? "not reported" : inputModalities.joined(separator: ", ")
        let output = outputModalities.isEmpty ? "not reported" : outputModalities.joined(separator: ", ")
        return "Input: \(input) · Output: \(output)"
    }

    private static func price(_ value: Any?) -> String? {
        if let number = value as? NSNumber { return number.stringValue }
        return ImageGenerationJSON.text(value)
    }
}

/// Projection of `sks imagegen models --json` in CLI order, ids de-duplicated.
struct ImageGenerationModelCatalog: Equatable {
    let ok: Bool
    let source: String?
    let fetchedAt: String?
    let models: [ImageGenerationModel]
    let blockers: [String]

    static func decode(from payload: [String: Any]) -> ImageGenerationModelCatalog? {
        guard payload["schema"] as? String == ImageGenerationCommand.modelsSchema else { return nil }
        var seen = Set<String>()
        let models = (payload["models"] as? [Any] ?? [])
            .compactMap { ImageGenerationModel.decode(from: $0) }
            .filter { seen.insert($0.id).inserted }
        return ImageGenerationModelCatalog(
            ok: payload["ok"] as? Bool == true,
            source: ImageGenerationJSON.text(payload["source"]),
            fetchedAt: ImageGenerationJSON.text(payload["fetched_at"]),
            models: models,
            blockers: ImageGenerationJSON.strings(payload["blockers"])
        )
    }

    var selectedModelId: String? { models.first(where: \.selected)?.id }
    func model(id: String?) -> ImageGenerationModel? { models.first { $0.id == id } }

    func summary(formatDate: (String) -> String = { $0 }) -> String {
        let count = "\(models.count) image model\(models.count == 1 ? "" : "s")"
        let origin = source == "cache" ? "cached list" : source == "openrouter" ? "live from OpenRouter" : nil
        return [count, origin, fetchedAt.map { "fetched \(formatDate($0))" }].compactMap { $0 }.joined(separator: " · ")
    }
}

struct ImageGenerationPopupEntry: Equatable {
    let id: String
    let title: String
}

enum ImageGenerationPopup {
    /// Catalog rows in CLI order. A saved model missing from the list stays
    /// visible first so the popup never misstates the saved choice.
    static func entries(models: [ImageGenerationModel], currentId: String?) -> [ImageGenerationPopupEntry] {
        var rows = models.map { ImageGenerationPopupEntry(id: $0.id, title: $0.menuTitle(current: $0.id == currentId)) }
        if let currentId, !models.contains(where: { $0.id == currentId }) {
            rows.insert(ImageGenerationPopupEntry(id: currentId, title: "\(currentId)  ·  current"), at: 0)
        }
        return rows
    }

    /// An unapplied pick wins, then the saved model, then the CLI's selected
    /// flag, then the first row.
    static func preferredId(entries: [ImageGenerationPopupEntry], pending: String?, current: String?, catalogSelected: String?) -> String? {
        for candidate in [pending, current, catalogSelected] {
            if let candidate, entries.contains(where: { $0.id == candidate }) { return candidate }
        }
        return entries.first?.id
    }
}
