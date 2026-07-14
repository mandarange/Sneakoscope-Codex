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

final class OperationCoordinator {
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
}
