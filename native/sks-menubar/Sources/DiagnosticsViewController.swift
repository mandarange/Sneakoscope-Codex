import Cocoa

final class DiagnosticsViewController: NSViewController {
    private let processClient: ProcessClient
    private let status = NativeView.detail("Diagnostics are idle.")
    init(processClient: ProcessClient) { self.processClient = processClient; super.init(nibName: nil, bundle: nil) }
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
            NativeView.detail("Diagnostic output is bounded, redacted, and written with owner-only permissions."),
            status, buttons
        ])
    }

    @objc private func doctor() { status.stringValue = "Doctor is running…"; processClient.run(["doctor", "--json"]) { [weak self] result in self?.status.stringValue = result.code == 0 ? "Doctor completed." : "Doctor reported a blocker." } }
    @objc private func openLog() {
        if FileManager.default.fileExists(atPath: AppRuntime.lastActionLogPath) { NSWorkspace.shared.open(URL(fileURLWithPath: AppRuntime.lastActionLogPath)) }
        else { status.stringValue = "No operation log exists yet." }
    }
    @objc private func restart() { processClient.run(["menubar", "restart", "--json"]) { [weak self] result in self?.status.stringValue = result.code == 0 ? "Restart requested." : "Restart failed." } }
}
