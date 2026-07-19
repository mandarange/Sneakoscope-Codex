import Cocoa

final class DiagnosticsViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let status = NativeView.detail("Diagnostics are idle.")
    private var busy = false

    init(processClient: ProcessClient, operations: OperationCoordinator) {
        self.processClient = processClient
        self.operations = operations
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        let buttons = NSStackView(views: [
            NativeView.button("Run Doctor", target: self, action: #selector(doctor)),
            NativeView.button("Open Last Log", target: self, action: #selector(openLog)),
            NativeView.button("Restart Menu Bar", target: self, action: #selector(restart))
        ])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Diagnostics"),
            NativeView.detail("Diagnostic output is bounded, redacted, and written with owner-only permissions. Use this page when another Center action reports a blocker."),
            status, buttons
        ])
        refreshOnAppear()
    }

    func refreshOnAppear() {
        guard !busy else { return }
        if let latest = operations.latestSnapshot() {
            status.stringValue = "Last operation: \(latest.kind) · \(latest.state.rawValue) · \(latest.publicSummary)"
        } else if FileManager.default.fileExists(atPath: AppRuntime.lastActionLogPath) {
            status.stringValue = "Diagnostics idle. A previous action log is available via Open Last Log."
        } else {
            status.stringValue = "Diagnostics are idle. No operation log exists yet."
        }
    }

    @objc private func doctor() {
        busy = true
        status.stringValue = "Doctor is running…"
        processClient.run(["doctor", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.busy = false
            if result.code == 0 {
                self.status.stringValue = "Doctor completed with no blocking issue."
                return
            }
            if let json = self.json(result.output) {
                let ok = json["ok"] as? Bool
                let blockers = (json["blockers"] as? [String])?.count ?? (json["issues"] as? [Any])?.count
                if let blockers = blockers {
                    self.status.stringValue = "Doctor reported \(blockers) issue\(blockers == 1 ? "" : "s"). Open Last Log for redacted detail."
                    return
                }
                if ok == false {
                    self.status.stringValue = "Doctor reported a blocker. Open Last Log for redacted detail."
                    return
                }
            }
            self.status.stringValue = "Doctor reported a blocker · \(NativeView.redactPreview(result.output))"
        }
    }

    @objc private func openLog() {
        if FileManager.default.fileExists(atPath: AppRuntime.lastActionLogPath) {
            NSWorkspace.shared.open(URL(fileURLWithPath: AppRuntime.lastActionLogPath))
            status.stringValue = "Opened the latest redacted action log."
        } else {
            status.stringValue = "No operation log exists yet. Run Doctor or another Center action first."
        }
    }

    @objc private func restart() {
        busy = true
        status.stringValue = "Restarting Menu Bar…"
        processClient.run(["menubar", "restart", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.busy = false
            self.status.stringValue = result.code == 0
                ? "Restart requested. Control Center will reopen after the Menu Bar process returns."
                : "Restart failed · \(NativeView.redactPreview(result.output))"
        }
    }

    private func json(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
