import Foundation

// Ordered by expected use frequency: provider/model work first, then updates,
// then integrations, then maintenance.
enum SidebarItem: String, CaseIterable {
    case overview = "Overview"
    case providers = "Providers"
    case updates = "Updates"
    case mcpServers = "MCP Servers"
    case remoteTelegram = "Remote & Telegram"
    case diagnostics = "Diagnostics"
    case settings = "Settings"

    var symbolName: String {
        switch self {
        case .overview: return "gauge"
        case .providers: return "cpu"
        case .updates: return "arrow.down.circle"
        case .mcpServers: return "server.rack"
        case .remoteTelegram: return "paperplane"
        case .diagnostics: return "stethoscope"
        case .settings: return "gearshape"
        }
    }
}
