import Cocoa

final class UpdatesViewController: NSViewController {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let notifications: NotificationCoordinator
    private let status = NativeView.detail("Update status has not been checked yet.")
    private let progress = NSProgressIndicator()

    init(processClient: ProcessClient, operations: OperationCoordinator, notifications: NotificationCoordinator) {
        self.processClient = processClient; self.operations = operations; self.notifications = notifications
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        progress.isIndeterminate = true
        progress.controlSize = .small
        progress.isHidden = true
        let check = NativeView.button("Check Now", target: self, action: #selector(checkNow))
        let review = NativeView.button("Review and Update", target: self, action: #selector(reviewAndUpdate))
        let buttons = NSStackView(views: [check, review, progress])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Updates"),
            NativeView.detail("SKS, Codex CLI, and Menu Bar status share one local snapshot. Network refresh only runs on demand or after expiry."),
            status, buttons,
            NativeView.detail("Rollback guidance and the previous Menu Bar app remain available if final verification fails.")
        ])
        loadCached()
    }

    private func loadCached() {
        processClient.run(["update", "status", "--json"]) { [weak self] result in self?.render(result) }
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
        guard let operation = operations.begin(kind: kind, mutationGroup: group, summary: kind) else { status.stringValue = "Another update or MCP mutation is already running."; return }
        progress.isHidden = false; progress.startAnimation(nil)
        status.stringValue = "\(kind.replacingOccurrences(of: "-", with: " ").capitalized)…"
        _ = operations.update(operation, state: .running, stage: "running", progress: nil, summary: status.stringValue)
        processClient.run(args) { [weak self] result in
            self?.progress.stopAnimation(nil); self?.progress.isHidden = true
            _ = self?.operations.update(operation, state: result.code == 0 ? .succeeded : .failed, stage: "complete", progress: 1, summary: result.code == 0 ? "Update operation completed" : "Update operation failed")
            self?.notifications.send(PublicNotificationEvent(
                category: "SKS_OPERATION_RESULT",
                title: result.code == 0 ? "SKS update operation completed" : "SKS update needs attention",
                body: result.code == 0 ? "The staged update operation completed." : "The update did not complete. Open Control Center for redacted remediation."
            ))
            self?.render(result); completion?(result)
        }
    }

    private func render(_ result: ProcessResult) {
        if result.code != 0 { status.stringValue = "Update status unavailable. No success state was assumed."; return }
        guard let data = result.output.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { status.stringValue = "Update operation completed."; return }
        let sks = json["sks"] as? [String: Any]
        let codex = json["codex_cli"] as? [String: Any]
        status.stringValue = "SKS \(sks?["current"] as? String ?? "unknown") → \(sks?["latest"] as? String ?? "unknown") · Codex CLI \(codex?["current"] as? String ?? "unknown") → \(codex?["latest"] as? String ?? "unknown") · Source: \(json["source"] as? String ?? "unknown")"
    }
}
