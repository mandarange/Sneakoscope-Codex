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
        // Prefer the validated custom status PDFs; fall back to SF Symbols only when missing.
        let image = Bundle.main.image(forResource: resource)
            ?? NSImage(systemSymbolName: symbol, accessibilityDescription: "SKS status")
        image?.isTemplate = true
        return image
    }
}
