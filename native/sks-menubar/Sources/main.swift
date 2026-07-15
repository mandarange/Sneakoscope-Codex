import Cocoa
import UserNotifications

enum AppRuntime {
    static let actionScript = __SKS_ACTION_SCRIPT__
    static let projectRoot = __SKS_PROJECT_ROOT__
    static let buildStampPath = __SKS_BUILD_STAMP__
    static let configPath = __SKS_CONFIG_PATH__
    static let lastActionLogPath = __SKS_LAST_LOG__
    static let operationDirectory = __SKS_OPERATION_DIR__
    static let codexBundleId: String? = __SKS_CODEX_BUNDLE_ID__
    static let packageVersion = __SKS_PACKAGE_VERSION__
}

let application = NSApplication.shared
let applicationDelegate = AppDelegate()
application.delegate = applicationDelegate
application.run()
