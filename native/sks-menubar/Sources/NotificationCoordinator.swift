import Cocoa
import UserNotifications

struct PublicNotificationEvent {
    let category: String
    let title: String
    let body: String
}

final class NotificationCoordinator: NSObject, UNUserNotificationCenterDelegate {
    var onOpenControlCenter: (() -> Void)?
    var onOpenLog: (() -> Void)?
    var onRetryOperation: (() -> Void)?
    var onOpenDashboard: (() -> Void)?
    var onAuthorizationChanged: ((Bool) -> Void)?
    private(set) var authorizationDenied = false

    func configure() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories([
            category("SKS_OPERATION_RESULT", actions: ["OPEN_CONTROL_CENTER", "OPEN_LOG", "RETRY_OPERATION"]),
            category("SKS_UPDATE_AVAILABLE", actions: ["OPEN_CONTROL_CENTER"]),
            category("SKS_ACTION_REQUIRED", actions: ["OPEN_CONTROL_CENTER", "OPEN_DASHBOARD"])
        ])
        refreshAuthorizationState()
    }

    func requestAuthorizationFromSettings() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] _, _ in
            self?.refreshAuthorizationState()
        }
    }

    func send(_ event: PublicNotificationEvent) {
        let content = UNMutableNotificationContent()
        content.title = safe(event.title)
        content.body = safe(event.body)
        content.categoryIdentifier = event.category
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)) { [weak self] error in
            if error != nil { self?.refreshAuthorizationState() }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            switch response.actionIdentifier {
            case "OPEN_LOG": self.onOpenLog?()
            case "RETRY_OPERATION": self.onRetryOperation?()
            case "OPEN_DASHBOARD": self.onOpenDashboard?()
            default: self.onOpenControlCenter?()
            }
            completionHandler()
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    private func category(_ id: String, actions: [String]) -> UNNotificationCategory {
        let mapped = actions.map { UNNotificationAction(identifier: $0, title: $0.replacingOccurrences(of: "_", with: " ").capitalized, options: [.foreground]) }
        return UNNotificationCategory(identifier: id, actions: mapped, intentIdentifiers: [], options: [])
    }

    private func safe(_ value: String) -> String {
        var singleLine = value.replacingOccurrences(of: "\n", with: " ")
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        singleLine = singleLine.replacingOccurrences(of: home, with: "~")
        for pattern in [
            #"sk-(?:proj|or-v1|clb)?-?[A-Za-z0-9_-]{12,}"#,
            #"(?i)(api[_-]?key|secret|token|authorization)\s*[:=]\s*[^\s\"',}]+"#,
            #"(?i)bearer\s+[A-Za-z0-9._~-]+"#
        ] {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(singleLine.startIndex..<singleLine.endIndex, in: singleLine)
            singleLine = regex.stringByReplacingMatches(in: singleLine, range: range, withTemplate: "[redacted]")
        }
        return String(singleLine.prefix(400))
    }

    private func refreshAuthorizationState() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            let denied = settings.authorizationStatus == .denied
            DispatchQueue.main.async {
                self?.authorizationDenied = denied
                self?.onAuthorizationChanged?(denied)
            }
        }
    }
}
