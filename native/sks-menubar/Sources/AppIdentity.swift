import Cocoa

enum AppIdentity {
    static func configure() {
        if let url = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
           let image = NSImage(contentsOf: url) {
            NSApplication.shared.applicationIconImage = image
        }
    }

    static func applyIcon(to alert: NSAlert) {
        alert.icon = NSApplication.shared.applicationIconImage
    }

    static func statusImage(resource: String, symbol: String) -> NSImage? {
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: "SKS status") ?? Bundle.main.image(forResource: resource)
        image?.isTemplate = true
        return image
    }
}
