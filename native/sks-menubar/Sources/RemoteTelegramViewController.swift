import Cocoa

final class RemoteTelegramViewController: NSViewController {
    private let processClient: ProcessClient
    private let status = NativeView.detail("Remote readiness has not been checked.")
    private var generation = 0
    init(processClient: ProcessClient) { self.processClient = processClient; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        let refresh = NativeView.button("Check Readiness", target: self, action: #selector(check))
        view = NativeView.stack([
            NativeView.title("Remote & Telegram"),
            NativeView.detail("OpenAI Remote remains the high-fidelity coding surface. Telegram is limited to proof-aware fleet status and typed approvals; arbitrary remote shell is never enabled."),
            status, refresh
        ])
        check()
    }

    @objc private func check() {
        generation += 1
        let requestGeneration = generation
        status.stringValue = "Checking official Remote compatibility and Telegram Hub state…"
        var remote: [String: Any]?
        var telegram: [String: Any]?
        let group = DispatchGroup()
        group.enter()
        processClient.run(["remote", "readiness", "--project-root", AppRuntime.projectRoot, "--json"]) { [weak self] result in
            remote = self?.json(result.output)
            group.leave()
        }
        group.enter()
        processClient.run(["telegram", "status", "--project-root", AppRuntime.projectRoot, "--json"]) { [weak self] result in
            telegram = self?.json(result.output)
            group.leave()
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self, self.generation == requestGeneration else { return }
            self.status.stringValue = self.summary(remote: remote, telegram: telegram)
        }
    }

    private func summary(remote: [String: Any]?, telegram: [String: Any]?) -> String {
        let host = remote?["host"] as? [String: Any]
        let project = remote?["project"] as? [String: Any]
        let mcp = remote?["mcp"] as? [String: Any]
        let sks = remote?["sks"] as? [String: Any]
        let remoteBlockers = remote?["blockers"] as? [String] ?? []
        let remoteWarnings = remote?["warnings"] as? [String] ?? []
        let owner = telegram?["owner"] as? [String: Any]
        let telegramIssues = (telegram?["config_issues"] as? [String] ?? []) + (telegram?["remote_config_issues"] as? [String] ?? [])
        let lines = [
            "Official Remote compatibility: \(remote?["ok"] as? Bool == true ? "Ready" : "Needs attention") · Codex app \(host?["codex_app_found"] as? Bool == true ? "found" : "missing") · CLI \(host?["codex_cli_found"] as? Bool == true ? "found" : "missing")",
            "Project: Git \(project?["git_repo"] as? Bool == true ? "ready" : "missing") · worktree \(project?["worktree"] as? Bool == true ? "yes" : "no") · dirty \(project?["dirty"] as? Bool == true ? "yes" : "no") · allowlist \(project?["allowed"] as? Bool == true ? "ready" : "blocked")",
            "MCP: \(mcp?["effective_count"] as? Int ?? 0) effective · \(mcp?["failed_count"] as? Int ?? 0) failed · SKS proof \(sks?["proof_surfaces_ready"] as? Bool == true ? "ready" : "missing")",
            "Telegram Hub: \(owner == nil ? "Stopped" : "Running") · \(telegram?["topic_count"] as? Int ?? 0) topics · \(telegram?["machine_count"] as? Int ?? 0) machines · \(telegram?["target_count"] as? Int ?? 0) targets",
            "Remote blockers \(remoteBlockers.count) · warnings \(remoteWarnings.count) · Telegram issues \(telegramIssues.count)"
        ]
        return lines.joined(separator: "\n")
    }

    private func json(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
