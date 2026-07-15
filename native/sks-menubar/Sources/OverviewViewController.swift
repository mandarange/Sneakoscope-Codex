import Cocoa

enum NativeView {
    static func title(_ value: String) -> NSTextField {
        let field = NSTextField(labelWithString: value)
        field.font = NSFont.systemFont(ofSize: 18, weight: .semibold)
        return field
    }

    static func detail(_ value: String) -> NSTextField {
        let field = NSTextField(wrappingLabelWithString: value)
        field.font = NSFont.systemFont(ofSize: 12)
        field.textColor = .secondaryLabelColor
        return field
    }

    static func button(_ title: String, target: AnyObject, action: Selector) -> NSButton {
        let button = NSButton(title: title, target: target, action: action)
        button.bezelStyle = .rounded
        button.setAccessibilityLabel(title)
        return button
    }

    static func stack(_ views: [NSView]) -> NSStackView {
        let stack = NSStackView(views: views)
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12
        stack.edgeInsets = NSEdgeInsets(top: 22, left: 24, bottom: 22, right: 24)
        return stack
    }
}

final class OverviewViewController: NSViewController {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let status = NativeView.detail("Loading local SKS status…")
    private let notificationInbox = NativeView.detail("Notifications: checking authorization…")
    private var generation = 0

    init(processClient: ProcessClient, operations: OperationCoordinator) {
        self.processClient = processClient
        self.operations = operations
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        let runDoctor = NativeView.button("Run Doctor", target: self, action: #selector(doctor))
        let refresh = NativeView.button("Refresh", target: self, action: #selector(refreshStatus))
        let buttons = NSStackView(views: [runDoctor, refresh])
        buttons.orientation = .horizontal
        buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Overview"),
            NativeView.detail("SKS \(AppRuntime.packageVersion) · Menu Bar build, update, MCP, Remote, and operation health."),
            status,
            notificationInbox,
            buttons
        ])
        refreshStatus()
    }

    func setNotificationAuthorizationDenied(_ denied: Bool) {
        notificationInbox.stringValue = denied
            ? "Notifications: permission denied — operation results remain available in this Control Center inbox."
            : "Notifications: authorized or not yet requested."
    }

    @objc private func refreshStatus() {
        generation += 1
        let requestGeneration = generation
        status.stringValue = "Checking versions, MCP servers, Telegram Hub, connected Macs, and operations…"
        var update: [String: Any]?
        var mcp: [String: Any]?
        var telegram: [String: Any]?
        let group = DispatchGroup()
        group.enter()
        processClient.run(["update", "status", "--json"]) { [weak self] result in
            update = result.code == 0 ? self?.json(result.output) : nil
            group.leave()
        }
        group.enter()
        processClient.run(["mcp", "config", "list", "--scope", "effective", "--json"]) { [weak self] result in
            mcp = result.code == 0 ? self?.json(result.output) : nil
            group.leave()
        }
        group.enter()
        processClient.run(["telegram", "status", "--project-root", AppRuntime.projectRoot, "--json"]) { [weak self] result in
            telegram = result.code == 0 ? self?.json(result.output) : nil
            group.leave()
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self, self.generation == requestGeneration else { return }
            self.status.stringValue = self.summary(update: update, mcp: mcp, telegram: telegram)
        }
    }

    @objc private func doctor() {
        status.stringValue = "Doctor is running…"
        processClient.run(["doctor", "--json"]) { [weak self] result in
            self?.status.stringValue = result.code == 0 ? "Doctor completed. No blocking issue was reported." : "Doctor found an issue. Open Diagnostics or the operation log."
        }
    }

    private func summary(update: [String: Any]?, mcp: [String: Any]?, telegram: [String: Any]?) -> String {
        let sks = update?["sks"] as? [String: Any]
        let codex = update?["codex_cli"] as? [String: Any]
        let menu = update?["menubar"] as? [String: Any]
        let signature = menu?["signature_ok"] as? Bool
        let resources = menu?["resources_ok"] as? Bool
        let codexRunning = AppRuntime.codexBundleId.map { bundle in
            NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == bundle }
        }
        let hub = telegram?["owner"] as? [String: Any]
        let configuredTargets = telegram?["target_count"] as? Int ?? 0
        let connectedMacs = hub == nil ? 0 : configuredTargets
        let operation = operations.latestSnapshot()
        let operationSummary = operation.map { "\($0.kind) · \($0.state.rawValue) · \($0.publicSummary)" } ?? "None recorded"
        let lines = [
            "SKS: \(sks?["current"] as? String ?? AppRuntime.packageVersion) (latest \(sks?["latest"] as? String ?? "unknown"))",
            "Codex CLI: \(codex?["current"] as? String ?? "unknown") (latest \(codex?["latest"] as? String ?? "unknown")) · Codex app: \(codexRunning == true ? "Running" : codexRunning == false ? "Not running" : "Not configured")",
            "Menu Bar: expected \(menu?["expected_version"] as? String ?? AppRuntime.packageVersion) · installed \(menu?["installed_version"] as? String ?? "unknown") · signature \(signature == true ? "Verified" : signature == false ? "Needs attention" : "Unknown") · resources \(resources == true ? "Verified" : resources == false ? "Needs attention" : "Unknown")",
            "Updates: \(update?["update_count"] as? Int ?? 0) · MCP: \(mcp?["enabled_count"] as? Int ?? 0) enabled / \(mcp?["failed_count"] as? Int ?? 0) failed",
            "Telegram Hub: \(hub == nil ? "Stopped" : "Running") · Connected Macs: \(connectedMacs) / \(configuredTargets) configured targets",
            "Last operation: \(operationSummary) · Logs and snapshots use mode 0600"
        ]
        return lines.joined(separator: "\n")
    }

    private func json(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
