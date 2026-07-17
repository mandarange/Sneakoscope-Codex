import Cocoa

enum SKSStatusIcon {
    case healthy, working, attention, updateAvailable, warning
}

final class StatusItemController: NSObject, NSMenuDelegate {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let notifications: NotificationCoordinator
    private let openControlCenter: (SidebarItem) -> Void
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let statusLine = NSMenuItem(title: "Status: Starting", action: nil, keyEquivalent: "")
    private let pendingLine = NSMenuItem(title: "Pending approvals (0)", action: nil, keyEquivalent: "")
    private let fastLine = NSMenuItem(title: "Fast: Checking…", action: nil, keyEquivalent: "")
    private var fastOnItem: NSMenuItem?
    private var fastOffItem: NSMenuItem?
    private var timer: Timer?
    private var lastOperationArguments: [String]?
    private var operationFailed = false
    private var operationRunning = false
    private var actionRequired = false
    private var notificationAuthorizationDenied = false
    private var updateRefreshInFlight = false
    private var fastRefreshInFlight = false
    private var fastRefreshPending = false
    private var lastUpdateNotificationFingerprint: String?

    init(processClient: ProcessClient, operations: OperationCoordinator, notifications: NotificationCoordinator, openControlCenter: @escaping (SidebarItem) -> Void) {
        self.processClient = processClient
        self.operations = operations
        self.notifications = notifications
        self.openControlCenter = openControlCenter
        super.init()
    }

    func start() {
        notificationAuthorizationDenied = notifications.authorizationDenied
        statusItem.autosaveName = "com.sneakoscope.sks-menubar"
        statusItem.button?.toolTip = "SKS Control Center"
        statusItem.button?.setAccessibilityLabel("SKS status")
        let menu = NSMenu()
        menu.delegate = self
        let version = NSMenuItem(title: "SKS \(AppRuntime.packageVersion)", action: nil, keyEquivalent: "")
        version.isEnabled = false
        statusLine.isEnabled = false
        pendingLine.isEnabled = false
        fastLine.isEnabled = false
        fastLine.setAccessibilityLabel("Current Fast mode state")
        menu.addItem(version)
        menu.addItem(statusLine)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(item("Open SKS Control Center…", #selector(openCenter)))
        menu.addItem(item("Open Dashboard", #selector(openDashboardAction)))
        menu.addItem(pendingLine)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(fastLine)
        let fastOn = item("Fast Mode On", #selector(fastOn))
        fastOn.setAccessibilityLabel("Turn Fast mode on")
        fastOnItem = fastOn
        menu.addItem(fastOn)
        let fastOff = item("Fast Mode Off", #selector(fastOff))
        fastOff.setAccessibilityLabel("Turn Fast mode off")
        fastOffItem = fastOff
        menu.addItem(fastOff)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(item("Check for Updates", #selector(checkUpdates)))
        menu.addItem(item("View Last Operation", #selector(viewLastOperation)))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(item("Quit SKS Menu", #selector(quit)))
        statusItem.menu = menu
        configureCodexLifecycle()
        refreshLocalState()
        refreshFastState()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in self?.refreshLocalState() }
    }

    func stop() { timer?.invalidate(); timer = nil }

    func menuWillOpen(_ menu: NSMenu) {
        refreshLocalState()
        refreshFastState()
        refreshExpiredUpdateStatusIfNeeded()
    }

    func setNotificationAuthorizationDenied(_ denied: Bool) {
        notificationAuthorizationDenied = denied
        refreshLocalState()
    }

    func retryLastOperation() {
        guard let arguments = lastOperationArguments else { openControlCenter(.overview); return }
        run(arguments, kind: "retry", mutationGroup: nil, summary: "Retry operation")
    }

    func openDashboard() {
        do { try processClient.runDetached(["ui"]) }
        catch { AlertFactory.fatal(title: "Open Dashboard failed", message: String(describing: error)) }
        if let url = URL(string: "http://127.0.0.1:4477") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { NSWorkspace.shared.open(url) }
        }
    }

    private func refreshLocalState() {
        let update = readJson(path: FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".sneakoscope-global/cache/update-status.json").path)
        let sksUpdate = ((update?["sks"] as? [String: Any])?["update_available"] as? Bool) == true
        let codexUpdate = ((update?["codex_cli"] as? [String: Any])?["update_available"] as? Bool) == true
        let menuBar = update?["menubar"] as? [String: Any]
        let signatureBroken = menuBar?["signature_ok"] as? Bool == false
        let resourcesBroken = menuBar?["resources_ok"] as? Bool == false
        let integrityBroken = signatureBroken || resourcesBroken || !FileManager.default.fileExists(atPath: AppRuntime.buildStampPath)
        let icon: SKSStatusIcon
        let summary: String
        if integrityBroken { icon = .warning; summary = "Needs attention — Menu Bar integrity" }
        else if operationFailed { icon = .warning; summary = "Needs attention — last operation failed" }
        else if actionRequired || notificationAuthorizationDenied { icon = .attention; summary = notificationAuthorizationDenied ? "Notifications require attention" : "Input or approval required" }
        else if sksUpdate || codexUpdate { icon = .updateAvailable; summary = "Update available" }
        else if operationRunning { icon = .working; summary = "Working" }
        else { icon = .healthy; summary = "Healthy" }
        apply(icon)
        statusLine.title = "Status: \(summary)"
    }

    private func refreshExpiredUpdateStatusIfNeeded() {
        let update = readJson(path: FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".sneakoscope-global/cache/update-status.json").path)
        guard !updateRefreshInFlight, StatusItemController.updateStatusNeedsRefresh(update) else { return }
        updateRefreshInFlight = true
        processClient.run(["update", "status", "--json"]) { [weak self] result in
            guard let self = self else { return }
            self.updateRefreshInFlight = false
            let fingerprint = self.updateNotificationFingerprint(result.output)
            if result.code == 0 && NotificationCoordinator.updateIsAvailable(in: result.output), fingerprint != self.lastUpdateNotificationFingerprint {
                self.lastUpdateNotificationFingerprint = fingerprint
                self.notifications.send(PublicNotificationEvent(
                    category: "SKS_UPDATE_AVAILABLE",
                    title: "SKS update available",
                    body: "An expired update snapshot was refreshed and a verified update is ready for review."
                ))
            }
            self.refreshLocalState()
        }
    }

    private func refreshFastState() {
        guard !fastRefreshInFlight else { fastRefreshPending = true; return }
        fastRefreshInFlight = true
        fastLine.title = "Fast: Checking…"
        processClient.run(["fast-mode", "status", "--json"]) { [weak self] result in
            guard let self = self else { return }
            self.fastRefreshInFlight = false
            guard result.code == 0, let json = self.readJson(text: result.output),
                  let global = json["global"] as? [String: Any], let on = global["on"] as? Bool else {
                self.fastLine.title = "Fast: Unavailable"
                self.fastOnItem?.state = .off
                self.fastOffItem?.state = .off
                self.fastOnItem?.isEnabled = true
                self.fastOffItem?.isEnabled = true
                self.completeFastRefresh()
                return
            }
            let tier = global["service_tier"] as? String ?? (on ? "fast" : "default")
            self.fastLine.title = "Fast: \(on ? "On" : "Off") · \(tier)"
            self.fastOnItem?.state = on ? .on : .off
            self.fastOffItem?.state = on ? .off : .on
            self.fastOnItem?.isEnabled = !on
            self.fastOffItem?.isEnabled = on
            self.completeFastRefresh()
        }
    }

    private func completeFastRefresh() {
        guard fastRefreshPending else { return }
        fastRefreshPending = false
        refreshFastState()
    }

    private func updateNotificationFingerprint(_ output: String) -> String? {
        guard let data = output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let sks = json["sks"] as? [String: Any]
        let codex = json["codex_cli"] as? [String: Any]
        let menu = json["menubar"] as? [String: Any]
        return [
            json["generated_at"] as? String ?? "",
            sks?["latest"] as? String ?? "",
            codex?["latest"] as? String ?? "",
            menu?["expected_version"] as? String ?? ""
        ].joined(separator: "|")
    }

    static func updateStatusNeedsRefresh(_ update: [String: Any]?, now: Date = Date()) -> Bool {
        guard let update = update else { return true }
        if update["source"] as? String == "disabled" { return false }
        guard update["schema"] as? String == "sks.update-status.v3",
              let expiresAt = update["expires_at"] as? String,
              let expiry = ISO8601DateFormatter().date(from: expiresAt) else { return true }
        return expiry <= now
    }

    private func apply(_ state: SKSStatusIcon) {
        let pair: (String, String)
        switch state {
        case .healthy: pair = ("SKSStatusTemplate", "checkmark.circle")
        case .working: pair = ("SKSStatusTemplate", "ellipsis.circle")
        case .attention: pair = ("SKSStatusAttentionTemplate", "exclamationmark.circle")
        case .updateAvailable: pair = ("SKSStatusUpdateTemplate", "arrow.down.circle")
        case .warning: pair = ("SKSStatusWarningTemplate", "exclamationmark.triangle")
        }
        statusItem.button?.image = AppIdentity.statusImage(resource: pair.0, symbol: pair.1)
        statusItem.button?.imagePosition = .imageOnly
    }

    private func run(_ arguments: [String], kind: String, mutationGroup: String?, summary: String, completion: (() -> Void)? = nil) {
        guard let snapshot = operations.begin(kind: kind, mutationGroup: mutationGroup, summary: summary) else {
            actionRequired = true
            notifications.send(PublicNotificationEvent(
                category: "SKS_ACTION_REQUIRED",
                title: "SKS action requires attention",
                body: "Another guarded mutation is already running. Open Control Center to review the active operation."
            ))
            refreshLocalState()
            completion?()
            return
        }
        actionRequired = false
        lastOperationArguments = arguments
        operationRunning = true
        operationFailed = false
        _ = operations.update(snapshot, state: .running, stage: "running", progress: nil, summary: summary)
        processClient.run(arguments) { [weak self] result in
            guard let self = self else { return }
            self.operationRunning = false
            self.operationFailed = result.code != 0
            _ = self.operations.update(snapshot, state: result.code == 0 ? .succeeded : .failed, stage: "complete", progress: 1, summary: result.code == 0 ? "Operation completed" : "Operation failed")
            let updateOutput = kind == "update-status" ? result.output : nil
            self.notifications.send(PublicNotificationEvent(
                category: NotificationCoordinator.categoryIdentifier(updateStatusOutput: updateOutput, failed: result.code != 0),
                title: updateOutput != nil && NotificationCoordinator.updateIsAvailable(in: result.output)
                    ? "SKS update available"
                    : result.code == 0 ? "SKS operation completed" : "SKS operation needs attention",
                body: updateOutput != nil && NotificationCoordinator.updateIsAvailable(in: result.output)
                    ? "A verified SKS, Codex CLI, or Menu Bar update is ready for review."
                    : result.code == 0 ? "The requested operation completed." : "The requested operation failed. Open Control Center for redacted details."
            ))
            self.refreshLocalState()
            completion?()
        }
    }

    private func configureCodexLifecycle() {
        guard let bundle = AppRuntime.codexBundleId else { return }
        statusItem.isVisible = NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == bundle }
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, app.bundleIdentifier == bundle else { return }
            self?.statusItem.isVisible = true
        }
        center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, app.bundleIdentifier == bundle else { return }
            let config = self?.readJson(path: AppRuntime.configPath)
            if config?["quit_with_codex"] as? Bool == true { NSApplication.shared.terminate(nil) }
            else { self?.statusItem.isVisible = false }
        }
    }

    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let value = NSMenuItem(title: title, action: action, keyEquivalent: "")
        value.target = self
        value.setAccessibilityLabel(title.replacingOccurrences(of: "…", with: ""))
        return value
    }

    private func readJson(path: String) -> [String: Any]? {
        guard let data = FileManager.default.contents(atPath: path) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private func readJson(text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    @objc private func openCenter() { openControlCenter(.overview) }
    @objc private func openDashboardAction() { openDashboard() }
    @objc private func checkUpdates() { run(["update", "status", "--refresh", "--json"], kind: "update-status", mutationGroup: nil, summary: "Check for updates") }
    @objc private func fastOn() {
        fastLine.title = "Fast: Turning On…"
        fastOnItem?.isEnabled = false
        fastOffItem?.isEnabled = false
        run(["fast-mode", "on", "--json"], kind: "fast-mode-on", mutationGroup: "codex-config", summary: "Turn Fast Mode on") { [weak self] in self?.refreshFastState() }
    }
    @objc private func fastOff() {
        fastLine.title = "Fast: Turning Off…"
        fastOnItem?.isEnabled = false
        fastOffItem?.isEnabled = false
        run(["fast-mode", "off", "--json"], kind: "fast-mode-off", mutationGroup: "codex-config", summary: "Turn Fast Mode off") { [weak self] in self?.refreshFastState() }
    }
    @objc private func viewLastOperation() {
        if FileManager.default.fileExists(atPath: AppRuntime.lastActionLogPath) { NSWorkspace.shared.open(URL(fileURLWithPath: AppRuntime.lastActionLogPath)) }
        else { openControlCenter(.overview) }
    }
    @objc private func quit() { NSApplication.shared.terminate(nil) }
}
