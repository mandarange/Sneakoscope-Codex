import Cocoa

enum AlertFactory {
    static func fatal(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = String(message.prefix(700))
        alert.alertStyle = .critical
        AppIdentity.applyIcon(to: alert)
        if let window = NSApp.keyWindow { alert.beginSheetModal(for: window) }
        else {
            NSApp.activate(ignoringOtherApps: true)
            alert.window.center()
            alert.window.orderFrontRegardless()
        }
    }

    static func confirmSheet(window: NSWindow, title: String, message: String, destructive: Bool, completion: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = destructive ? .warning : .informational
        alert.addButton(withTitle: destructive ? "Remove" : "Continue")
        alert.addButton(withTitle: "Cancel")
        AppIdentity.applyIcon(to: alert)
        alert.beginSheetModal(for: window) { completion($0 == .alertFirstButtonReturn) }
    }

    static func textSheet(window: NSWindow, title: String, message: String, secure: Bool = false, completion: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: "Apply")
        alert.addButton(withTitle: "Cancel")
        let field: NSTextField = secure ? NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24)) : NSTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        field.setAccessibilityLabel(title)
        alert.accessoryView = field
        AppIdentity.applyIcon(to: alert)
        alert.beginSheetModal(for: window) { response in
            let value = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            completion(response == .alertFirstButtonReturn && !value.isEmpty ? value : nil)
        }
    }
}
