import Cocoa

final class SettingsViewController: NSViewController {
    private let notifications: NotificationCoordinator
    private let quitWithCodex = NSButton(checkboxWithTitle: "Quit SKS Menu when Codex quits (otherwise hide)", target: nil, action: nil)
    private let status = NativeView.detail("Settings use the native app configuration file.")
    init(notifications: NotificationCoordinator) { self.notifications = notifications; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        quitWithCodex.target = self; quitWithCodex.action = #selector(save)
        quitWithCodex.state = readConfig()["quit_with_codex"] as? Bool == true ? .on : .off
        let authorize = NativeView.button("Enable Notifications", target: self, action: #selector(enableNotifications))
        view = NativeView.stack([
            NativeView.title("Settings"),
            NativeView.detail("Use system typography, focus behavior, notification authorization, and explicit consequential changes."),
            quitWithCodex, authorize, status
        ])
    }

    @objc private func enableNotifications() { notifications.requestAuthorizationFromSettings(); status.stringValue = "Notification authorization was requested from macOS." }

    @objc private func save() {
        var config = readConfig()
        config["schema"] = "sks.sks-menubar-config.v1"
        config["codex_bundle_id"] = AppRuntime.codexBundleId as Any
        config["quit_with_codex"] = quitWithCodex.state == .on
        guard JSONSerialization.isValidJSONObject(config), let data = try? JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted]) else { return }
        let target = URL(fileURLWithPath: AppRuntime.configPath)
        let temporary = target.deletingLastPathComponent().appendingPathComponent(".config.\(UUID().uuidString).tmp")
        do { try data.write(to: temporary, options: .atomic); _ = try FileManager.default.replaceItemAt(target, withItemAt: temporary); status.stringValue = "Settings saved." }
        catch { status.stringValue = "Settings could not be saved." }
    }

    private func readConfig() -> [String: Any] {
        guard let data = FileManager.default.contents(atPath: AppRuntime.configPath) else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }
}
