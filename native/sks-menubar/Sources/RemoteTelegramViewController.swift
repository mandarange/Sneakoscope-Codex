import Cocoa

final class RemoteTelegramViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let status = NativeView.detail("Remote readiness has not been checked.")
    private var generation = 0
    private var checkButton: NSButton!

    init(processClient: ProcessClient) { self.processClient = processClient; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        checkButton = NativeView.button("Check Readiness", target: self, action: #selector(check))
        view = NativeView.stack([
            NativeView.title("Remote & Telegram"),
            NativeView.detail("OpenAI Remote remains the high-fidelity coding surface. Telegram is limited to proof-aware fleet status and typed approvals; arbitrary remote shell is never enabled."),
            status, checkButton
        ])
        check()
    }

    func refreshOnAppear() { check() }

    @objc private func check() {
        generation += 1
        let requestGeneration = generation
        checkButton?.isEnabled = false
        status.stringValue = "Checking official Remote compatibility and Telegram Hub state…"
        var remote: [String: Any]?
        var telegram: [String: Any]?
        var remoteFailed = false
        var telegramFailed = false
        let group = DispatchGroup()
        group.enter()
        processClient.run(["remote", "readiness", "--project-root", AppRuntime.projectRoot, "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            remote = self?.json(result.output)
            remoteFailed = result.code != 0 || remote == nil
            group.leave()
        }
        group.enter()
        processClient.run(["telegram", "status", "--project-root", AppRuntime.projectRoot, "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            telegram = result.code == 0 ? self?.json(result.output) : nil
            telegramFailed = result.code != 0 || telegram == nil
            group.leave()
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self, self.generation == requestGeneration else { return }
            self.checkButton?.isEnabled = true
            self.status.stringValue = self.summary(remote: remote, telegram: telegram, remoteFailed: remoteFailed, telegramFailed: telegramFailed)
        }
    }

    private func summary(remote: [String: Any]?, telegram: [String: Any]?, remoteFailed: Bool, telegramFailed: Bool) -> String {
        if remoteFailed && telegramFailed {
            return "Remote readiness and Telegram status are unavailable. Retry Check Readiness, or open Diagnostics for the redacted log."
        }
        var lines: [String] = []
        if remoteFailed || remote == nil {
            lines.append("Official Remote compatibility: unavailable — probe failed or returned no readable JSON.")
        } else if let remote = remote {
            let host = remote["host"] as? [String: Any]
            let project = remote["project"] as? [String: Any]
            let mcp = remote["mcp"] as? [String: Any]
            let sks = remote["sks"] as? [String: Any]
            let remoteBlockers = remote["blockers"] as? [String] ?? []
            let remoteWarnings = remote["warnings"] as? [String] ?? []
            lines.append("Official Remote compatibility: \(remote["ok"] as? Bool == true ? "Ready" : "Needs attention") · Codex app \(host?["codex_app_found"] as? Bool == true ? "found" : "missing") · CLI \(host?["codex_cli_found"] as? Bool == true ? "found" : "missing")")
            lines.append("Project: Git \(project?["git_repo"] as? Bool == true ? "ready" : "missing") · worktree \(project?["worktree"] as? Bool == true ? "yes" : "no") · dirty \(project?["dirty"] as? Bool == true ? "yes" : "no") · allowlist \(project?["allowed"] as? Bool == true ? "ready" : "blocked")")
            lines.append("MCP: \(mcp?["effective_count"] as? Int ?? 0) effective · \(mcp?["failed_count"] as? Int ?? 0) failed · SKS proof \(sks?["proof_surfaces_ready"] as? Bool == true ? "ready" : "missing")")
            if !remoteBlockers.isEmpty {
                lines.append("Remote blockers: \(remoteBlockers.prefix(3).joined(separator: "; "))\(remoteBlockers.count > 3 ? "…" : "")")
            } else if !remoteWarnings.isEmpty {
                lines.append("Remote warnings: \(remoteWarnings.prefix(3).joined(separator: "; "))\(remoteWarnings.count > 3 ? "…" : "")")
            } else {
                lines.append("Remote blockers 0 · warnings 0")
            }
        }

        if telegramFailed || telegram == nil {
            lines.append("Telegram Hub: unavailable — status probe failed.")
            lines.append("Remote fleet: unavailable until Telegram status succeeds.")
        } else if let telegram = telegram {
            let owner = telegram["owner"] as? [String: Any]
            let configured = telegram["configured"] as? Bool
            let hubState = owner != nil ? "Running" : configured == true ? "Stopped" : configured == false ? "Not configured" : "Unknown"
            let telegramIssues = (telegram["config_issues"] as? [String] ?? []) + (telegram["remote_config_issues"] as? [String] ?? [])
            lines.append("Telegram Hub: \(hubState) · \(telegram["topic_count"] as? Int ?? 0) topics · \(telegram["machine_count"] as? Int ?? 0) machines · \(telegram["target_count"] as? Int ?? 0) targets")
            if telegramIssues.isEmpty {
                lines.append("Telegram issues 0")
            } else {
                lines.append("Telegram issues \(telegramIssues.count): \(telegramIssues.prefix(2).joined(separator: "; "))\(telegramIssues.count > 2 ? "…" : "")")
            }
        }
        return lines.joined(separator: "\n")
    }

    private func json(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
