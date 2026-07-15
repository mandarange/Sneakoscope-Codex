import Foundation

enum OperationState: String, Codable {
    case queued, running, waitingForConfirmation, succeeded, failed, cancelled, terminalUncertain
}

struct OperationSnapshot: Codable {
    let schema: String
    let id: String
    let kind: String
    let state: OperationState
    let stage: String?
    let progress: Double?
    let startedAt: String
    let updatedAt: String
    let publicSummary: String
    let logPath: String?
    let retryable: Bool
}

struct UpdateOperationStageSnapshot: Codable {
    let id: String
    let ok: Bool
    let status: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, ok, status
        case updatedAt = "updated_at"
    }
}

struct UpdateOperationReceiptSnapshot: Codable {
    let schema: String
    let id: String
    let kind: String
    let state: String
    let currentStage: String?
    let startedAt: String
    let updatedAt: String
    let fromVersion: String
    let targetVersion: String?
    let previousVersion: String
    let rollbackCommand: String
    let sideEffectsStarted: Bool
    let stages: [UpdateOperationStageSnapshot]
    let resultStatus: String?
    let publicError: String?
    let receiptPath: String

    enum CodingKeys: String, CodingKey {
        case schema, id, kind, state, stages
        case currentStage = "current_stage"
        case startedAt = "started_at"
        case updatedAt = "updated_at"
        case fromVersion = "from_version"
        case targetVersion = "target_version"
        case previousVersion = "previous_version"
        case rollbackCommand = "rollback_command"
        case sideEffectsStarted = "side_effects_started"
        case resultStatus = "result_status"
        case publicError = "public_error"
        case receiptPath = "receipt_path"
    }
}

final class OperationCoordinator {
    static let updateStageOrder = [
        "preflight", "download_or_registry_check", "temporary_install_smoke", "global_install",
        "resolve_new_binary", "version_probe", "new_version_doctor", "hook_trust_repair",
        "global_skills_reconcile", "native_capability_setup", "menubar_rebuild",
        "menubar_signature_verify", "final_self_verification", "snapshot_refresh"
    ]
    private let directory: URL
    private let queue = DispatchQueue(label: "com.sneakoscope.sks-menubar.operations")
    private var activeMutation: (id: String, group: String)?
    private var cancelled = Set<String>()

    init(directory: String) {
        self.directory = URL(fileURLWithPath: directory, isDirectory: true)
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    func begin(kind: String, mutationGroup: String?, summary: String) -> OperationSnapshot? {
        queue.sync {
            if mutationGroup != nil, activeMutation != nil { return nil }
            let now = ISO8601DateFormatter().string(from: Date())
            let snapshot = OperationSnapshot(
                schema: "sks.operation.v1", id: UUID().uuidString, kind: kind,
                state: .queued, stage: "queued", progress: 0, startedAt: now,
                updatedAt: now, publicSummary: summary, logPath: AppRuntime.lastActionLogPath,
                retryable: true
            )
            if let group = mutationGroup { activeMutation = (snapshot.id, group) }
            write(snapshot)
            return snapshot
        }
    }

    func update(_ snapshot: OperationSnapshot, state: OperationState, stage: String?, progress: Double?, summary: String, retryable: Bool = true) -> OperationSnapshot {
        queue.sync {
            let next = OperationSnapshot(
                schema: snapshot.schema, id: snapshot.id, kind: snapshot.kind, state: state,
                stage: stage, progress: progress, startedAt: snapshot.startedAt,
                updatedAt: ISO8601DateFormatter().string(from: Date()),
                publicSummary: summary, logPath: snapshot.logPath, retryable: retryable
            )
            write(next)
            if [.succeeded, .failed, .cancelled, .terminalUncertain].contains(state) {
                if activeMutation?.id == snapshot.id { activeMutation = nil }
                cancelled.remove(snapshot.id)
            }
            return next
        }
    }

    func cancel(_ operationId: String) { _ = queue.sync { cancelled.insert(operationId) } }
    func isCancelled(_ operationId: String) -> Bool { queue.sync { cancelled.contains(operationId) } }

    func latestSnapshot() -> OperationSnapshot? {
        queue.sync {
            let files = (try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )) ?? []
            let decoder = JSONDecoder()
            return files.compactMap { url -> OperationSnapshot? in
                guard url.pathExtension == "json", let data = try? Data(contentsOf: url) else { return nil }
                return try? decoder.decode(OperationSnapshot.self, from: data)
            }.max { $0.updatedAt < $1.updatedAt }
        }
    }

    func latestUpdateReceipt() -> UpdateOperationReceiptSnapshot? {
        queue.sync { readUpdateReceipt(directory.appendingPathComponent("update-latest.json")) }
    }

    func updateReceipt(fromProcessOutput output: String) -> UpdateOperationReceiptSnapshot? {
        queue.sync {
            guard let data = output.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rawPath = json["operation_receipt_path"] as? String else { return nil }
            let candidate = URL(fileURLWithPath: rawPath).standardizedFileURL
            let root = directory.standardizedFileURL.path
            let relative = candidate.path.replacingOccurrences(of: root + "/", with: "")
            guard candidate.path.hasPrefix(root + "/"), !relative.contains("../") else { return nil }
            return readUpdateReceipt(candidate)
        }
    }

    static func authoritativeState(for receipt: UpdateOperationReceiptSnapshot, processCompleted: Bool = false) -> OperationState {
        let state: OperationState
        switch receipt.state {
        case "queued": state = processCompleted ? .terminalUncertain : .queued
        case "running": state = processCompleted ? .terminalUncertain : .running
        case "succeeded":
            switch receipt.resultStatus {
            case "terminal_uncertain": state = .terminalUncertain
            case "failed", "updated_with_issues": state = .failed
            default: state = .succeeded
            }
        case "rolled_back": state = receipt.kind == "rollback" ? .succeeded : .failed
        case "terminal_uncertain": state = .terminalUncertain
        case "failed": state = .failed
        case "cancelled": state = .cancelled
        default: state = .terminalUncertain
        }
        return state
    }

    static func receiptRequiresAction(_ receipt: UpdateOperationReceiptSnapshot, processCompleted: Bool = false) -> Bool {
        let state = authoritativeState(for: receipt, processCompleted: processCompleted)
        return state == .failed || state == .terminalUncertain || state == .cancelled
    }

    func synchronize(_ snapshot: OperationSnapshot, with receipt: UpdateOperationReceiptSnapshot, processCompleted: Bool = false) -> OperationSnapshot {
        let state = OperationCoordinator.authoritativeState(for: receipt, processCompleted: processCompleted)
        let completed = Set(receipt.stages.map(\.id)).intersection(Set(OperationCoordinator.updateStageOrder)).count
        let progress = min(1, Double(completed) / Double(OperationCoordinator.updateStageOrder.count))
        let result = receipt.resultStatus ?? receipt.state
        let stage = receipt.currentStage ?? receipt.stages.last?.id
        return update(
            snapshot,
            state: state,
            stage: stage,
            progress: progress,
            summary: "\(result.replacingOccurrences(of: "_", with: " ")) · stage \(completed)/\(OperationCoordinator.updateStageOrder.count)",
            retryable: state == .failed || state == .terminalUncertain
        )
    }

    private func write(_ snapshot: OperationSnapshot) {
        let target = directory.appendingPathComponent("\(snapshot.id).json")
        let temporary = directory.appendingPathComponent(".\(snapshot.id).\(UUID().uuidString).tmp")
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        do {
            try data.write(to: temporary, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: temporary.path)
            _ = try FileManager.default.replaceItemAt(target, withItemAt: temporary)
        } catch {
            try? FileManager.default.removeItem(at: target)
            try? FileManager.default.moveItem(at: temporary, to: target)
        }
    }

    private func readUpdateReceipt(_ url: URL) -> UpdateOperationReceiptSnapshot? {
        let permissions = (try? FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as? NSNumber)?.intValue
        guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]),
              values.isRegularFile == true,
              values.isSymbolicLink != true,
              (values.fileSize ?? 0) <= 1024 * 1024,
              permissions.map({ $0 & 0o077 == 0 }) != false,
              let data = try? Data(contentsOf: url),
              let receipt = try? JSONDecoder().decode(UpdateOperationReceiptSnapshot.self, from: data),
              receipt.schema == "sks.update-operation.v1",
              receiptPathIsAllowed(receipt.receiptPath, for: url),
              receipt.stages.count <= OperationCoordinator.updateStageOrder.count else { return nil }
        return receipt
    }

    private func receiptPathIsAllowed(_ claimedPath: String, for loadedURL: URL) -> Bool {
        let claimed = URL(fileURLWithPath: claimedPath).standardizedFileURL
        let loaded = loadedURL.standardizedFileURL
        if claimed == loaded { return true }
        return loaded.lastPathComponent == "update-latest.json"
            && claimed.deletingLastPathComponent() == directory.standardizedFileURL
            && claimed.pathExtension == "json"
    }
}
