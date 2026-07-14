import Cocoa

private struct McpRow { let name: String; let scope: String; let state: String; let transport: String }

final class MCPServersViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let notifications: NotificationCoordinator
    private let table = NSTableView()
    private let status = NativeView.detail("Loading effective MCP configuration…")
    private var rows: [McpRow] = []

    init(processClient: ProcessClient, operations: OperationCoordinator, notifications: NotificationCoordinator) { self.processClient = processClient; self.operations = operations; self.notifications = notifications; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        for (id, title, width) in [("state", "State", 80.0), ("name", "Name", 170.0), ("transport", "Transport", 110.0), ("scope", "Scope", 100.0)] {
            let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(id)); column.title = title; column.width = width; table.addTableColumn(column)
        }
        table.dataSource = self; table.delegate = self; table.usesAlternatingRowBackgroundColors = true
        table.setAccessibilityLabel("Effective MCP servers")
        let scroll = NSScrollView(); scroll.documentView = table; scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder
        scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 250).isActive = true
        let buttons = NSStackView(views: [
            NativeView.button("Add…", target: self, action: #selector(addServer)),
            NativeView.button("Enable/Disable", target: self, action: #selector(toggleServer)),
            NativeView.button("Remove", target: self, action: #selector(removeServer)),
            NativeView.button("Test Connection", target: self, action: #selector(testConnection)),
            NativeView.button("Refresh", target: self, action: #selector(refresh))
        ])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("MCP Servers"),
            NativeView.detail("Effective view combines global, trusted-project, and plugin servers. Secret values, command arguments, URL paths, queries, and credentials are never displayed."),
            scroll, status, buttons
        ])
        refresh()
    }

    func numberOfRows(in tableView: NSTableView) -> Int { rows.count }
    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard let id = tableColumn?.identifier.rawValue else { return nil }
        let value = rows[row]
        let text = id == "name" ? value.name : id == "scope" ? value.scope : id == "transport" ? value.transport : value.state
        return NSTextField(labelWithString: text)
    }

    @objc private func refresh() {
        processClient.run(["mcp", "config", "list", "--scope", "effective", "--json"]) { [weak self] result in
            guard let self = self else { return }
            guard result.code == 0, let data = result.output.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let servers = json["servers"] as? [[String: Any]] else {
                self.rows = []; self.table.reloadData(); self.status.stringValue = "MCP inventory unavailable. No configuration was changed."; return
            }
            self.rows = servers.compactMap { row in
                guard let name = row["name"] as? String else { return nil }
                return McpRow(name: name, scope: row["scope"] as? String ?? "effective", state: row["enabled"] as? Bool == false ? "Disabled" : "Enabled", transport: row["transport"] as? String ?? "unknown")
            }
            self.table.reloadData(); self.status.stringValue = "\(self.rows.count) effective servers. Select a target scope before mutation."
        }
    }

    @objc private func addServer() {
        guard let window = view.window else { return }
        AlertFactory.textSheet(window: window, title: "Add MCP Server", message: "Enter a server name. The next secure sheet accepts a URL or executable; raw secret values are not accepted.") { [weak self] name in
            guard let self = self, let name = name else { return }
            AlertFactory.textSheet(window: window, title: "Connection", message: "Enter an HTTPS URL or local executable. Authentication must use OAuth or an environment-variable name.") { connection in
                guard let connection = connection else { return }
                let payload: [String: Any] = connection.hasPrefix("http")
                    ? ["name": name, "scope": "global", "transport": "streamable-http", "url": connection]
                    : ["name": name, "scope": "global", "transport": "stdio", "command": connection, "env_vars": []]
                guard let data = try? JSONSerialization.data(withJSONObject: payload), let text = String(data: data, encoding: .utf8) else { return }
                self.mutate(["mcp", "config", "add", "--scope", "global", "--stdin-json", "--json"], stdin: text + "\n")
            }
        }
    }

    @objc private func toggleServer() {
        guard let row = selected() else { return }
        let action = row.state == "Enabled" ? "disable" : "enable"
        mutate(["mcp", "config", action, row.name, "--scope", row.scope, "--json"])
    }

    @objc private func removeServer() {
        guard let row = selected(), let window = view.window else { return }
        AlertFactory.confirmSheet(window: window, title: "Remove \(row.name)?", message: "A protected backup is required before this scoped mutation.", destructive: true) { [weak self] approved in
            if approved { self?.mutate(["mcp", "config", "remove", row.name, "--scope", row.scope, "--json"]) }
        }
    }

    @objc private func testConnection() {
        guard let row = selected() else { return }
        processClient.run(["mcp", "config", "test", row.name, "--scope", row.scope, "--json"]) { [weak self] result in self?.status.stringValue = result.code == 0 ? "Connection test completed." : "Connection test failed or requires OAuth." }
    }

    private func mutate(_ args: [String], stdin: String? = nil) {
        guard let operation = operations.begin(kind: "mcp-config", mutationGroup: "mcp", summary: "MCP configuration change") else { status.stringValue = "An update or MCP mutation is already running."; return }
        _ = operations.update(operation, state: .running, stage: "apply", progress: nil, summary: "Applying MCP change")
        processClient.run(args, stdin: stdin) { [weak self] result in
            _ = self?.operations.update(operation, state: result.code == 0 ? .succeeded : .failed, stage: "complete", progress: 1, summary: result.code == 0 ? "MCP change complete" : "MCP change failed")
            self?.notifications.send(PublicNotificationEvent(
                category: "SKS_OPERATION_RESULT",
                title: result.code == 0 ? "MCP configuration updated" : "MCP configuration needs attention",
                body: result.code == 0 ? "The scoped MCP change completed." : "The MCP change failed. The previous configuration remains authoritative."
            ))
            self?.status.stringValue = result.code == 0 ? "Change complete. Restart or open a new Codex session." : "Change failed. The previous config remains authoritative."
            self?.refresh()
        }
    }

    private func selected() -> McpRow? { let row = table.selectedRow; return row >= 0 && row < rows.count ? rows[row] : nil }
}
