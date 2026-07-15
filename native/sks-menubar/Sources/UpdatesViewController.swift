import Cocoa

final class UpdatesViewController: NSViewController {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let notifications: NotificationCoordinator
    private let status = NativeView.detail("Update status has not been checked yet.")
    private let stageStatus = NativeView.detail("Update stages: no update receipt recorded yet.")
    private let remediation = NativeView.detail("Remediation and rollback guidance will appear here when needed.")
    private let progress = NSProgressIndicator()
    private var receiptTimer: Timer?
    private var activeReceiptId: String?

    init(processClient: ProcessClient, operations: OperationCoordinator, notifications: NotificationCoordinator) {
        self.processClient = processClient; self.operations = operations; self.notifications = notifications
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        progress.isIndeterminate = !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        progress.controlSize = .small
        progress.isHidden = true
        let check = NativeView.button("Check Now", target: self, action: #selector(checkNow))
        let review = NativeView.button("Review and Update", target: self, action: #selector(reviewAndUpdate))
        let buttons = NSStackView(views: [check, review, progress])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Updates"),
            NativeView.detail("SKS, Codex CLI, and Menu Bar status share one local snapshot. Network refresh only runs on demand or after expiry."),
            status, stageStatus, remediation, buttons,
            NativeView.detail("Rollback guidance and the previous Menu Bar app remain available if final verification fails. The update receipt records the exact recovery command and stage state.")
        ])
        loadCached()
    }

    deinit { receiptTimer?.invalidate() }

    private func loadCached() {
        reloadSnapshot()
    }

    @objc private func checkNow() { run(["update", "status", "--refresh", "--json"], kind: "update-status", group: nil) }

    @objc private func reviewAndUpdate() {
        run(["update", "review", "--json"], kind: "update-review", group: nil) { [weak self] result in
            guard result.code == 0, let self = self, let window = self.view.window else { return }
            AlertFactory.confirmSheet(window: window, title: "Update SKS?", message: "Review completed. Continue with the verified staged update?", destructive: false) { approved in
                if approved { self.run(["update", "now", "--json"], kind: "update", group: "update") }
            }
        }
    }

    private func run(_ args: [String], kind: String, group: String?, completion: ((ProcessResult) -> Void)? = nil) {
        guard let operation = operations.begin(kind: kind, mutationGroup: group, summary: kind) else {
            status.stringValue = "Another update or MCP mutation is already running."
            notifications.send(PublicNotificationEvent(
                category: "SKS_ACTION_REQUIRED",
                title: "SKS update is waiting",
                body: "Another guarded mutation is already running. Open Control Center to review it before retrying."
            ))
            return
        }
        progress.isHidden = false
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            progress.isIndeterminate = false
            progress.minValue = 0
            progress.maxValue = 1
            progress.doubleValue = 0
        } else {
            progress.isIndeterminate = true
            progress.startAnimation(nil)
        }
        status.stringValue = "\(kind.replacingOccurrences(of: "-", with: " ").capitalized)…"
        _ = operations.update(operation, state: .running, stage: "running", progress: nil, summary: status.stringValue)
        if kind == "update" { startReceiptPolling(for: operation) }
        processClient.run(args) { [weak self] result in
            guard let self = self else { return }
            self.stopReceiptPolling()
            self.progress.stopAnimation(nil); self.progress.isHidden = true
            var authoritativeState: OperationState?
            if kind == "update" {
                if let receipt = self.operations.updateReceipt(fromProcessOutput: result.output) ?? self.operations.latestUpdateReceipt(),
                   self.receipt(receipt, belongsTo: operation) {
                    authoritativeState = OperationCoordinator.authoritativeState(for: receipt, processCompleted: true)
                    _ = self.operations.synchronize(operation, with: receipt, processCompleted: true)
                    self.render(receipt: receipt)
                } else {
                    authoritativeState = .terminalUncertain
                    _ = self.operations.update(
                        operation,
                        state: .terminalUncertain,
                        stage: "receipt",
                        progress: nil,
                        summary: "Update process ended without a readable update receipt",
                        retryable: true
                    )
                    self.stageStatus.stringValue = "Update stages: receipt unavailable; completion cannot be assumed."
                    self.remediation.stringValue = "Remediation: open the last operation log and run sks update status --refresh --json before retrying or rolling back."
                }
            } else {
                let state: OperationState = kind == "update-review" && result.code == 0 ? .waitingForConfirmation : result.code == 0 ? .succeeded : .failed
                _ = self.operations.update(operation, state: state, stage: state == .waitingForConfirmation ? "confirmation" : "complete", progress: 1, summary: state == .waitingForConfirmation ? "Update review is waiting for confirmation" : result.code == 0 ? "Update operation completed" : "Update operation failed")
            }
            let updateOutput = kind == "update-status" ? result.output : nil
            let approvalRequired = kind == "update-review" && result.code == 0
            let updateAvailable = updateOutput != nil && NotificationCoordinator.updateIsAvailable(in: result.output)
            let authoritativeFailure = kind == "update" ? authoritativeState != .succeeded : result.code != 0
            let terminalUncertain = kind == "update" && authoritativeState == .terminalUncertain
            let notificationTitle: String
            let notificationBody: String
            if updateAvailable {
                notificationTitle = "SKS update available"
                notificationBody = "A verified SKS, Codex CLI, or Menu Bar update is ready for review."
            } else if approvalRequired {
                notificationTitle = "SKS update approval required"
                notificationBody = "Review completed. Return to Control Center to approve or cancel the staged update."
            } else if terminalUncertain {
                notificationTitle = "SKS update outcome is uncertain"
                notificationBody = "The authoritative update receipt could not confirm completion. Open Control Center before retrying or rolling back."
            } else if authoritativeFailure {
                notificationTitle = "SKS update needs attention"
                notificationBody = "The authoritative update state did not complete successfully. Open Control Center for redacted remediation."
            } else {
                notificationTitle = "SKS update operation completed"
                notificationBody = "The authoritative update receipt confirmed completion."
            }
            self.notifications.send(PublicNotificationEvent(
                category: NotificationCoordinator.categoryIdentifier(updateStatusOutput: updateOutput, failed: authoritativeFailure, actionRequired: approvalRequired),
                title: notificationTitle,
                body: notificationBody
            ))
            if kind == "update-status" { self.render(statusResult: result) }
            else if kind == "update" { self.reloadSnapshot() }
            completion?(result)
        }
    }

    private func reloadSnapshot() {
        processClient.run(["update", "status", "--json"]) { [weak self] result in self?.render(statusResult: result) }
    }

    private func render(statusResult result: ProcessResult) {
        let receipt = operations.latestUpdateReceipt()
        if result.code != 0 {
            status.stringValue = "Update status unavailable. No success state was assumed."
            if let receipt = receipt { render(receipt: receipt) }
            return
        }
        guard let data = result.output.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            status.stringValue = "Update status output was not valid JSON."
            if let receipt = receipt { render(receipt: receipt) }
            return
        }
        let sks = json["sks"] as? [String: Any]
        let codex = json["codex_cli"] as? [String: Any]
        let menu = json["menubar"] as? [String: Any]
        let generatedAt = json["generated_at"] as? String ?? "unknown"
        let expiresAt = json["expires_at"] as? String ?? "unknown"
        let expired = ISO8601DateFormatter().date(from: expiresAt).map { $0 <= Date() } ?? true
        status.stringValue = [
            "SKS \(sks?["current"] as? String ?? "unknown") → \(sks?["latest"] as? String ?? "unknown") · Codex CLI \(codex?["current"] as? String ?? "unknown") → \(codex?["latest"] as? String ?? "unknown")",
            "Menu Bar expected \(menu?["expected_version"] as? String ?? AppRuntime.packageVersion) · installed \(menu?["installed_version"] as? String ?? "unknown") · rebuild \(menu?["rebuild_required"] as? Bool == true ? "required" : "not required")",
            "Last checked \(formatTimestamp(generatedAt)) · expires \(formatTimestamp(expiresAt))\(expired ? " (expired)" : "") · source \(json["source"] as? String ?? "unknown")"
        ].joined(separator: "\n")
        if let receipt = receipt { render(receipt: receipt) }
        else {
            stageStatus.stringValue = stageChecklist(receipt: nil)
            let publicError = json["public_error"] as? String
            remediation.stringValue = publicError.map { "Remediation: \($0)" } ?? "Rollback: no completed update receipt is available yet."
        }
    }

    private func startReceiptPolling(for operation: OperationSnapshot) {
        stopReceiptPolling()
        activeReceiptId = nil
        progress.isIndeterminate = false
        progress.minValue = 0
        progress.maxValue = Double(OperationCoordinator.updateStageOrder.count)
        progress.doubleValue = 0
        let timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self, let receipt = self.operations.latestUpdateReceipt(), self.receipt(receipt, belongsTo: operation) else { return }
            if let active = self.activeReceiptId, active != receipt.id { return }
            self.activeReceiptId = receipt.id
            _ = self.operations.synchronize(operation, with: receipt)
            self.render(receipt: receipt)
        }
        timer.tolerance = 0.1
        receiptTimer = timer
    }

    private func stopReceiptPolling() {
        receiptTimer?.invalidate()
        receiptTimer = nil
    }

    private func receipt(_ receipt: UpdateOperationReceiptSnapshot, belongsTo operation: OperationSnapshot) -> Bool {
        guard receipt.kind == "update" || receipt.kind == "rollback" else { return false }
        let parser = ISO8601DateFormatter()
        guard let receiptDate = parser.date(from: receipt.startedAt), let operationDate = parser.date(from: operation.startedAt) else { return receipt.startedAt >= operation.startedAt }
        return receiptDate >= operationDate.addingTimeInterval(-1)
    }

    private func render(receipt: UpdateOperationReceiptSnapshot) {
        let completed = Set(receipt.stages.map(\.id)).intersection(Set(OperationCoordinator.updateStageOrder)).count
        progress.isIndeterminate = false
        progress.minValue = 0
        progress.maxValue = Double(OperationCoordinator.updateStageOrder.count)
        progress.doubleValue = Double(completed)
        progress.isHidden = !["queued", "running"].contains(receipt.state)
        stageStatus.stringValue = stageChecklist(receipt: receipt)
        let state = receipt.state.replacingOccurrences(of: "_", with: " ")
        let current = receipt.currentStage ?? receipt.stages.last?.id ?? "not started"
        let rollbackState = receipt.sideEffectsStarted ? "available for \(receipt.previousVersion)" : "not armed before side effects"
        let publicError = receipt.publicError.map { " · \($0)" } ?? ""
        remediation.stringValue = "Receipt \(receipt.id) · \(state) · current stage \(current) · \(completed)/\(OperationCoordinator.updateStageOrder.count)\nRollback \(rollbackState): \(receipt.rollbackCommand)\(publicError)"
    }

    private func stageChecklist(receipt: UpdateOperationReceiptSnapshot?) -> String {
        let byId = Dictionary(uniqueKeysWithValues: (receipt?.stages ?? []).map { ($0.id, $0) })
        let current = receipt?.currentStage
        let rows = OperationCoordinator.updateStageOrder.map { id -> String in
            if let stage = byId[id] { return "\(stage.ok ? "✓" : "✕") \(id) — \(stage.status)" }
            if id == current { return "● \(id) — running" }
            return "○ \(id)"
        }
        return "Update stages (14):\n" + rows.joined(separator: "\n")
    }

    private func formatTimestamp(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .medium
        return formatter.string(from: date)
    }
}
