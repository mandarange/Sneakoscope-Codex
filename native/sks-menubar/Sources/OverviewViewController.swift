import Cocoa

/// Pages that should reload local status whenever the Control Center section becomes visible.
protocol ControlCenterPage: AnyObject {
    func refreshOnAppear()
}

enum NativeView {
    static let statusTimeout: TimeInterval = 8
    static let mutationTimeout: TimeInterval = 90

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

    static func scrollable(_ document: NSView) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.hasHorizontalScroller = false
        scroll.borderType = .noBorder
        scroll.autohidesScrollers = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        document.translatesAutoresizingMaskIntoConstraints = false
        scroll.documentView = document
        if let content = scroll.contentView.documentView {
            NSLayoutConstraint.activate([
                content.leadingAnchor.constraint(equalTo: scroll.contentView.leadingAnchor),
                content.trailingAnchor.constraint(equalTo: scroll.contentView.trailingAnchor),
                content.topAnchor.constraint(equalTo: scroll.contentView.topAnchor)
            ])
        }
        return scroll
    }

    static func redactPreview(_ output: String, limit: Int = 160) -> String {
        let compact = output
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !compact.isEmpty else { return "No public detail was returned." }
        if compact.count <= limit { return compact }
        return String(compact.prefix(limit)) + "…"
    }
}

enum OverviewSummary {
    static func render(
        update: [String: Any]?,
        mcp: [String: Any]?,
        telegram: [String: Any]?,
        menuBarBuild: String,
        codexRunning: Bool?,
        operationSummary: String
    ) -> String {
        let codexAppState = codexRunning.map { $0 ? "Running" : "Not running" } ?? "Not configured"
        var lines: [String] = []
        let update = validatedUpdate(update)
        let mcp = validatedMCP(mcp)
        let telegram = validatedTelegram(telegram)

        if let update = update {
            let sks = update["sks"] as? [String: Any]
            let codex = update["codex_cli"] as? [String: Any]
            let menu = update["menubar"] as? [String: Any]
            lines.append("SKS install: \(versionSummary(sks))")
            lines.append("Codex CLI: \(versionSummary(codex)) · Codex app: \(codexAppState)")

            var menuParts = ["running build \(menuBarBuild)"]
            if let expected = menu?["expected_version"] as? String { menuParts.append("expected \(expected)") }
            if let installed = menu?["installed_version"] as? String, installed != menuBarBuild {
                menuParts.append("snapshot installed \(installed)")
            }
            if let rebuildRequired = menu?["rebuild_required"] as? Bool {
                menuParts.append(rebuildRequired ? "rebuild required" : "current")
            } else {
                menuParts.append("rebuild state unknown")
            }
            menuParts.append("signature \(verificationState(menu?["signature_ok"]))")
            menuParts.append("resources \(verificationState(menu?["resources_ok"]))")
            lines.append("Menu Bar: \(menuParts.joined(separator: " · "))")

            let source = snapshotSource(update["source"] as? String)
            var updateParts = [integer(update["update_count"]).map { "\($0) pending" } ?? "pending count unknown", "\(source) snapshot"]
            if let error = diagnosticNotice(update["public_error"] as? String, update: update) {
                updateParts.append("notice: \(error)")
            } else if let warnings = update["warnings"] as? [String], !warnings.isEmpty {
                updateParts.append("\(warnings.count) warning\(warnings.count == 1 ? "" : "s")")
            }
            lines.append("Updates: \(updateParts.joined(separator: " · "))")
        } else {
            lines.append("SKS install: unavailable")
            lines.append("Codex CLI: unavailable · Codex app: \(codexAppState)")
            lines.append("Menu Bar: running build \(menuBarBuild) · update status unavailable")
            lines.append("Updates: unavailable")
        }

        if let mcp = mcp,
           let enabled = integer(mcp["enabled_count"]),
           let failed = integer(mcp["failed_count"]) {
            lines.append("MCP: \(enabled) enabled · \(failed) failed")
        } else {
            lines.append("MCP: unavailable")
        }

        if let telegram = telegram {
            let owner = telegram["owner"] as? [String: Any]
            let configured = telegram["configured"] as? Bool
            let hubState = owner != nil ? "Running" : configured == true ? "Stopped" : configured == false ? "Not configured" : "Unknown"
            let machines = integer(telegram["machine_count"]).map { "\($0) registered Macs" } ?? "registered Macs unknown"
            let targets = integer(telegram["target_count"]).map { "\($0) configured targets" } ?? "configured targets unknown"
            let issues = ((telegram["config_issues"] as? [String]) ?? []).count
                + ((telegram["remote_config_issues"] as? [String]) ?? []).count
            var fleet = "Remote fleet: \(machines) · \(targets)"
            if issues > 0 { fleet += " · \(issues) issue\(issues == 1 ? "" : "s")" }
            lines.append("Telegram Hub: \(hubState) · \(fleet)")
        } else {
            lines.append("Telegram Hub: unavailable · Remote fleet: unavailable")
        }

        lines.append("Last operation: \(operationSummary) · Logs and snapshots use mode 0600")
        return lines.joined(separator: "\n")
    }

    private static func validatedUpdate(_ value: [String: Any]?) -> [String: Any]? {
        guard value?["schema"] as? String == "sks.update-status.v3",
              value?["source"] is String,
              integer(value?["update_count"]) != nil,
              let sks = value?["sks"] as? [String: Any],
              let codex = value?["codex_cli"] as? [String: Any],
              let menu = value?["menubar"] as? [String: Any],
              sks["update_available"] is Bool,
              codex["update_available"] is Bool,
              menu["expected_version"] is String,
              menu["rebuild_required"] is Bool else { return nil }
        return value
    }

    private static func validatedMCP(_ value: [String: Any]?) -> [String: Any]? {
        guard value?["schema"] as? String == "sks.mcp-inventory.v2",
              integer(value?["enabled_count"]) != nil,
              integer(value?["failed_count"]) != nil else { return nil }
        return value
    }

    private static func validatedTelegram(_ value: [String: Any]?) -> [String: Any]? {
        guard value?["schema"] as? String == "sks.telegram-status.v1",
              value?["configured"] is Bool,
              integer(value?["machine_count"]) != nil,
              integer(value?["target_count"]) != nil,
              value?["config_issues"] is [String],
              value?["remote_config_issues"] is [String] else { return nil }
        return value
    }

    private static func versionSummary(_ value: [String: Any]?) -> String {
        guard let current = nonEmpty(value?["current"] as? String) else { return "not detected" }
        guard let latest = nonEmpty(value?["latest"] as? String) else { return current }
        if value?["update_available"] as? Bool == true, latest != current { return "\(current) → \(latest) available" }
        if latest == current { return "\(current) (current)" }
        return "\(current) · latest \(latest)"
    }

    private static func verificationState(_ value: Any?) -> String {
        guard let value = value as? Bool else { return "unknown" }
        return value ? "verified" : "needs attention"
    }

    private static func snapshotSource(_ value: String?) -> String {
        guard let value = nonEmpty(value) else { return "unknown" }
        return value.replacingOccurrences(of: "_", with: " ")
    }

    private static func diagnosticNotice(_ value: String?, update: [String: Any]) -> String? {
        guard let value = nonEmpty(value) else { return nil }
        let versions = [
            (update["sks"] as? [String: Any])?["current"] as? String,
            (update["sks"] as? [String: Any])?["latest"] as? String,
            (update["codex_cli"] as? [String: Any])?["current"] as? String,
            (update["codex_cli"] as? [String: Any])?["latest"] as? String
        ].compactMap { $0 }
        if versions.contains(value) { return nil }
        if value.range(of: #"^v?\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$"#, options: .regularExpression) != nil { return nil }
        return value
    }

    private static func integer(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        return (value as? NSNumber)?.intValue
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}

final class OverviewViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let status = NativeView.detail("Loading local SKS status…")
    private let notificationInbox = NativeView.detail("Notifications: checking authorization…")
    private var generation = 0
    private var doctorButton: NSButton!
    private var refreshButton: NSButton!

    init(processClient: ProcessClient, operations: OperationCoordinator) {
        self.processClient = processClient
        self.operations = operations
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        doctorButton = NativeView.button("Run Doctor", target: self, action: #selector(doctor))
        refreshButton = NativeView.button("Refresh", target: self, action: #selector(refreshStatus))
        let buttons = NSStackView(views: [doctorButton, refreshButton])
        buttons.orientation = .horizontal
        buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Overview"),
            NativeView.detail("Menu Bar build \(AppRuntime.packageVersion) · Local health for SKS, Codex CLI, MCP, Remote, and operations."),
            status,
            notificationInbox,
            buttons
        ])
        loadStatus(forceUpdateRefresh: false)
    }

    func refreshOnAppear() {
        loadStatus(forceUpdateRefresh: false)
    }

    func setNotificationAuthorizationDenied(_ denied: Bool) {
        notificationInbox.stringValue = denied
            ? "Notifications: permission denied — operation results remain available in this Control Center inbox."
            : "Notifications: authorized or not yet requested."
    }

    @objc private func refreshStatus() {
        loadStatus(forceUpdateRefresh: true)
    }

    private func loadStatus(forceUpdateRefresh: Bool) {
        generation += 1
        let requestGeneration = generation
        refreshButton?.isEnabled = false
        status.stringValue = "Checking versions, MCP servers, Telegram Hub, remote fleet, and operations…"
        var update: [String: Any]?
        var mcp: [String: Any]?
        var telegram: [String: Any]?
        let group = DispatchGroup()
        group.enter()
        var updateArguments = ["update", "status"]
        if forceUpdateRefresh { updateArguments.append("--refresh") }
        updateArguments.append("--json")
        processClient.run(updateArguments, timeout: NativeView.statusTimeout) { [weak self] result in
            update = result.code == 0 ? self?.json(result.output) : nil
            group.leave()
        }
        group.enter()
        processClient.run([
            "mcp", "config", "list", "--scope", "effective",
            "--project-root", AppRuntime.projectRoot, "--trusted-project", "--json"
        ], timeout: 3) { [weak self] result in
            mcp = self?.json(result.output)
            group.leave()
        }
        group.enter()
        processClient.run(["telegram", "status", "--project-root", AppRuntime.projectRoot, "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            telegram = result.code == 0 ? self?.json(result.output) : nil
            group.leave()
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self, self.generation == requestGeneration else { return }
            self.refreshButton?.isEnabled = true
            self.status.stringValue = self.summary(update: update, mcp: mcp, telegram: telegram)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard let self = self, self.generation == requestGeneration else { return }
            self.refreshButton?.isEnabled = true
            self.status.stringValue = self.summary(update: update, mcp: mcp, telegram: telegram)
        }
    }

    @objc private func doctor() {
        doctorButton?.isEnabled = false
        status.stringValue = "Doctor is running…"
        processClient.run(["doctor", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.doctorButton?.isEnabled = true
            if result.code == 0 {
                self.status.stringValue = "Doctor completed. No blocking issue was reported."
            } else {
                self.status.stringValue = "Doctor found an issue. Open Diagnostics · \(NativeView.redactPreview(result.output))"
            }
        }
    }

    private func summary(update: [String: Any]?, mcp: [String: Any]?, telegram: [String: Any]?) -> String {
        let codexRunning = AppRuntime.codexBundleId.map { bundle in
            NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == bundle }
        }
        let operation = operations.latestSnapshot()
        let operationSummary = recentOperationSummary(operation)
        return OverviewSummary.render(
            update: update,
            mcp: mcp,
            telegram: telegram,
            menuBarBuild: AppRuntime.packageVersion,
            codexRunning: codexRunning,
            operationSummary: operationSummary
        )
    }

    private func recentOperationSummary(_ operation: OperationSnapshot?) -> String {
        guard let operation = operation else { return "None recorded" }
        guard let updatedAt = ISO8601DateFormatter().date(from: operation.updatedAt) else {
            return "\(operation.kind) · \(operation.state.rawValue) · \(operation.publicSummary)"
        }
        let age = Date().timeIntervalSince(updatedAt)
        if age > 24 * 60 * 60 { return "None in the last 24 hours" }
        let activeStates = ["queued", "running", "waitingForConfirmation"]
        if age > 15 * 60, activeStates.contains(operation.state.rawValue) {
            return "\(operation.kind) · stale \(operation.state.rawValue) record · review operation log"
        }
        return "\(operation.kind) · \(operation.state.rawValue) · \(operation.publicSummary)"
    }

    private func json(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { return object }
        // Child processes may print banner lines before JSON (for example a
        // migration gate message). Prefer the last top-level object payload.
        guard let start = text.range(of: "{", options: [.backwards])?.lowerBound else { return nil }
        let slice = String(text[start...])
        guard let sliced = slice.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: sliced) as? [String: Any]
    }
}
