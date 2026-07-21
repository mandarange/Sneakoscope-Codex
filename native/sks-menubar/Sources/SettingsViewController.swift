import Cocoa

final class SettingsViewController: NSViewController, ControlCenterPage {
    private let notifications: NotificationCoordinator
    private let quitWithCodex = NSButton(checkboxWithTitle: "Quit SKS Menu when Codex quits (otherwise keep icon, hide only after a Codex session ends)", target: nil, action: nil)
    private let status = NativeView.detail("Settings use the native app configuration file.")
    init(notifications: NotificationCoordinator) { self.notifications = notifications; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        quitWithCodex.target = self; quitWithCodex.action = #selector(save)
        quitWithCodex.state = readConfig()["quit_with_codex"] as? Bool == true ? .on : .off
        quitWithCodex.setAccessibilityLabel("Quit SKS Menu when Codex quits")
        let authorize = NativeView.button("Enable Notifications", target: self, action: #selector(enableNotifications))
        view = NativeView.stack([
            NativeView.title("Settings"),
            NativeView.detail("These options stay on this Mac. Notification permission and Codex lifecycle behavior never leave the machine."),
            quitWithCodex, authorize, status
        ])
        refreshOnAppear()
    }

    func refreshOnAppear() {
        quitWithCodex.state = readConfig()["quit_with_codex"] as? Bool == true ? .on : .off
        if notifications.authorizationDenied {
            status.stringValue = "Notifications are denied in macOS Settings. Operation results still appear in Control Center."
        } else if FileManager.default.fileExists(atPath: AppRuntime.configPath) {
            status.stringValue = "Settings loaded from the native app configuration file."
        } else {
            status.stringValue = "No settings file yet. Changing an option creates one with owner-only permissions."
        }
    }

    @objc private func enableNotifications() {
        notifications.requestAuthorizationFromSettings()
        status.stringValue = "Notification authorization was requested from macOS."
    }

    @objc private func save() {
        var config = readConfig()
        config["schema"] = "sks.sks-menubar-config.v1"
        config["codex_bundle_id"] = AppRuntime.codexBundleId as Any
        config["quit_with_codex"] = quitWithCodex.state == .on
        guard JSONSerialization.isValidJSONObject(config), let data = try? JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted]) else {
            status.stringValue = "Settings could not be encoded."
            return
        }
        let target = URL(fileURLWithPath: AppRuntime.configPath)
        let directory = target.deletingLastPathComponent()
        let temporary = directory.appendingPathComponent(".config.\(UUID().uuidString).tmp")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: temporary, options: .atomic)
            if FileManager.default.fileExists(atPath: target.path) {
                _ = try FileManager.default.replaceItemAt(target, withItemAt: temporary)
            } else {
                try FileManager.default.moveItem(at: temporary, to: target)
            }
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
            status.stringValue = quitWithCodex.state == .on
                ? "Saved. SKS Menu will quit when Codex quits."
                : "Saved. SKS Menu stays available on cold start; after a Codex session ends it hides until Codex returns."
        } catch {
            try? FileManager.default.removeItem(at: temporary)
            status.stringValue = "Settings could not be saved. Confirm \(directory.path) is writable."
        }
    }

    private func readConfig() -> [String: Any] {
        guard let data = FileManager.default.contents(atPath: AppRuntime.configPath) else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }
}
