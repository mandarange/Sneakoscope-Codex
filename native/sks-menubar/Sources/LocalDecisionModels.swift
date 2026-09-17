import Foundation

/// Public projection of `sks decision status --json`. Pure parsing so the
/// Control Center page and its tests share one reading of the CLI contract.
struct LocalDecisionStatus: Equatable {
    enum NextStep: String { case unsupported, install, start, waitReady = "wait_ready", chooseMode = "choose_mode", ready }

    let mode: String
    let supported: Bool
    let platformReason: String?
    let installed: Bool
    let modelId: String?
    let modelRevision: String?
    let quantization: String?
    let realModelVerified: Bool
    let serviceRunning: Bool
    let serviceReady: Bool
    let recommendedModelId: String?
    let nextStep: NextStep

    static let schema = "sks.local-decision-status.v1"

    static func decode(from payload: [String: Any]) -> LocalDecisionStatus? {
        guard payload["schema"] as? String == schema, payload["ok"] as? Bool == true,
              let mode = payload["mode"] as? String,
              let platform = payload["platform"] as? [String: Any],
              let supported = platform["supported"] as? Bool,
              let installed = payload["installed"] as? Bool,
              let service = payload["service"] as? [String: Any],
              let running = service["running"] as? Bool else { return nil }
        let install = payload["install"] as? [String: Any]
        let readiness = payload["readiness"] as? [String: Any]
        let verified = readiness?["realModelVerified"] as? Bool == true && readiness?["receiptMatches"] as? Bool == true
        let recommended = payload["recommended"] as? [String: Any]
        let step = NextStep(rawValue: payload["nextStep"] as? String ?? "") ?? .install
        return LocalDecisionStatus(
            mode: mode,
            supported: supported,
            platformReason: platform["reason"] as? String,
            installed: installed,
            modelId: install?["modelId"] as? String,
            modelRevision: install?["modelRevision"] as? String,
            quantization: install?["quantization"] as? String,
            realModelVerified: verified,
            serviceRunning: running,
            serviceReady: service["ready"] as? Bool == true,
            recommendedModelId: recommended?["modelId"] as? String,
            nextStep: step
        )
    }

    var modeTitle: String {
        switch mode {
        case "shadow": return "Shadow"
        case "advisory": return "Advisory"
        default: return "Off"
        }
    }

    /// One-line human state for the status badge.
    var badgeText: String {
        if !supported { return "Not available on this Mac" }
        if !installed { return "Not installed" }
        if !serviceRunning { return "Installed · service stopped" }
        if !serviceReady { return "Installed · service starting" }
        return "Ready · mode \(modeTitle)"
    }

    var modelLabel: String {
        guard let modelId else { return "No model installed." }
        let revision = modelRevision.map { String($0.prefix(12)) } ?? "unknown"
        let quant = quantization ?? "unknown"
        return "\(modelId) @ \(revision) · \(quant) · verified on this Mac: \(realModelVerified ? "yes" : "not yet")"
    }

    /// The single most useful next action; the page renders it as guidance.
    var guidance: String {
        switch nextStep {
        case .unsupported: return "The local model needs macOS on Apple Silicon. Every SKS route keeps its normal behaviour here."
        case .install: return "Step 1 · Install the recommended model (about 0.9 GB download plus a private Python environment)."
        case .start: return "Step 2 · Start the service so the model is loaded and warmed up."
        case .waitReady: return "Service is loading the model; this usually takes a few seconds."
        case .chooseMode: return "Step 3 · Choose Shadow to record samples only, or Advisory to let Naruto planning see short non-authoritative advice."
        case .ready: return "Everything is set. Advice never changes models, agent counts, effort, or verification gates."
        }
    }
}

/// Builds the exact install invocation from an `inspect` payload. The revision
/// must be the resolved immutable commit; anything else yields no command.
enum LocalDecisionInstallPlan {
    static let inspectSchema = "sks.local-decision-inspect.v1"

    struct Preview: Equatable {
        let modelId: String
        let revision: String
        let license: String?
        let downloadBytes: Int
        let quantization: String?
    }

    static func preview(from payload: [String: Any]) -> Preview? {
        guard payload["schema"] as? String == inspectSchema,
              payload["compatible"] as? Bool == true,
              payload["kind"] as? String == "weights",
              let modelId = payload["modelId"] as? String,
              let revision = payload["resolvedRevision"] as? String,
              revision.count == 40, revision.allSatisfy({ $0.isHexDigit && !$0.isUppercase }) else { return nil }
        let config = payload["config"] as? [String: Any]
        return Preview(
            modelId: modelId,
            revision: revision,
            license: payload["license"] as? String,
            downloadBytes: payload["downloadBytes"] as? Int ?? 0,
            quantization: config?["quantization"] as? String
        )
    }

    static func installArguments(_ preview: Preview) -> [String] {
        ["decision", "install", "--model", preview.modelId, "--revision", preview.revision, "--accept-license", "--yes", "--json"]
    }

    static func blockerSummary(from payload: [String: Any]) -> String {
        let blockers = (payload["blockers"] as? [String]) ?? []
        let kind = payload["kind"] as? String ?? "unknown"
        let mentioned = (payload["cardMentionedRepos"] as? [String]) ?? []
        var text = "This repository cannot be installed (\(kind)"
        if !blockers.isEmpty { text += ": " + blockers.joined(separator: ", ") }
        text += ")."
        if !mentioned.isEmpty { text += " Its model card names: " + mentioned.joined(separator: ", ") + "." }
        return text
    }

    static func formatBytes(_ bytes: Int) -> String {
        guard bytes > 0 else { return "unknown size" }
        let gb = Double(bytes) / 1_000_000_000
        if gb >= 1 { return String(format: "%.2f GB", gb) }
        return String(format: "%.0f MB", Double(bytes) / 1_000_000)
    }
}
