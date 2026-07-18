import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var processClient: ProcessClient!
    private var operations: OperationCoordinator!
    private var notifications: NotificationCoordinator!
    private var controlCenter: ControlCenterWindowController!
    private var statusItemController: StatusItemController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        AppIdentity.configure()
        processClient = ProcessClient(actionScript: AppRuntime.actionScript, logPath: AppRuntime.lastActionLogPath, projectRoot: AppRuntime.projectRoot)
        operations = OperationCoordinator(directory: AppRuntime.operationDirectory)
        notifications = NotificationCoordinator()
        controlCenter = ControlCenterWindowController(
            processClient: processClient,
            operations: operations,
            notifications: notifications
        )
        statusItemController = StatusItemController(
            processClient: processClient,
            operations: operations,
            notifications: notifications,
            openControlCenter: { [weak self] section in self?.controlCenter.show(section: section) }
        )
        notifications.onOpenControlCenter = { [weak self] in self?.controlCenter.show(section: .overview) }
        notifications.onOpenLog = { NSWorkspace.shared.open(URL(fileURLWithPath: AppRuntime.lastActionLogPath)) }
        notifications.onRetryOperation = { [weak self] in self?.statusItemController.retryLastOperation() }
        notifications.onAuthorizationChanged = { [weak self] denied in
            self?.statusItemController.setNotificationAuthorizationDenied(denied)
            self?.controlCenter.setNotificationAuthorizationDenied(denied)
        }
        notifications.configure()
        statusItemController.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        statusItemController?.stop()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        controlCenter?.show(section: .overview)
        return true
    }
}
