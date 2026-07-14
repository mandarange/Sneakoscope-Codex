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
    private let status = NativeView.detail("Loading local SKS status…")
    private let notificationInbox = NativeView.detail("Notifications: checking authorization…")

    init(processClient: ProcessClient) { self.processClient = processClient; super.init(nibName: nil, bundle: nil) }
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
        status.stringValue = "Checking versions, MCP servers, and operations…"
        processClient.run(["update", "status", "--json"]) { [weak self] result in
            self?.status.stringValue = result.code == 0 ? self?.summary(result.output) ?? "Healthy" : "Update status unavailable. Run Doctor for details."
        }
    }

    @objc private func doctor() {
        status.stringValue = "Doctor is running…"
        processClient.run(["doctor", "--json"]) { [weak self] result in
            self?.status.stringValue = result.code == 0 ? "Doctor completed. No blocking issue was reported." : "Doctor found an issue. Open Diagnostics or the operation log."
        }
    }

    private func summary(_ text: String) -> String {
        guard let data = text.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return "Local status loaded." }
        let count = json["update_count"] as? Int ?? 0
        let menu = json["menubar"] as? [String: Any]
        let signature = menu?["signature_ok"] as? Bool
        return "Updates: \(count) · Menu signature: \(signature == true ? "Verified" : signature == false ? "Needs attention" : "Unknown") · Last operation log is protected with mode 0600."
    }
}
