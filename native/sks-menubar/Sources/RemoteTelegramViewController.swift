import Cocoa

final class RemoteTelegramViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let readinessStatus = NativeView.detail("Remote readiness has not been checked.")
    private let setupStatus = NativeView.detail("Telegram setup has not been checked.")
    private let hubStatus = NativeView.detail("Telegram Hub status has not been checked.")
    private var generation = 0
    private var busy = false
    private var setupReady = false
    private var hubRunning = false
    private var checkButton: NSButton!
    private var connectButton: NSButton!
    private var startButton: NSButton!
    private var stopButton: NSButton!
    private var restartButton: NSButton!

    init(processClient: ProcessClient, operations: OperationCoordinator) {
        self.processClient = processClient
        self.operations = operations
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        connectButton = NativeView.button("Connect Bot & Register Coding Session…", target: self, action: #selector(connectBot))
        startButton = NativeView.button("Start Hub", target: self, action: #selector(startHub))
        stopButton = NativeView.button("Stop Hub", target: self, action: #selector(stopHub))
        restartButton = NativeView.button("Restart Hub", target: self, action: #selector(restartHub))
        checkButton = NativeView.button("Refresh Status", target: self, action: #selector(check))

        let setupCard = NativeView.card(
            title: "1. Connect your private Telegram bot",
            subtitle: "Create a bot with BotFather, open that bot in Telegram, send /start, then paste the bot token here. SKS verifies the bot, detects only that private chat/user, saves the token in macOS Keychain, and registers one dedicated coding session for this project.",
            views: [setupStatus, NativeView.row([connectButton])]
        )
        let hubCard = NativeView.card(
            title: "2. Keep remote coding available",
            subtitle: "The LaunchAgent keeps the Hub running and prevents idle system sleep while this Mac user is logged in. Closing the lid or logging out can still stop access. It uses a local in-process worker on this Mac; SSH remains available only for explicitly configured remote machines.",
            views: [hubStatus, NativeView.row([startButton, stopButton, restartButton, checkButton])]
        )
        let usageCard = NativeView.card(
            title: "3. Code from Telegram",
            subtitle: "Send ordinary text in the paired private chat. The first message creates and persists the Codex thread with its first turn; later messages resume that exact thread, wait for completion, and return Codex’s final answer. /status, /diff, /proof, and /verify remain available. Arbitrary remote shell and unpaired chats stay blocked.",
            views: [readinessStatus]
        )
        view = NativeView.page([
            NativeView.title("Remote & Telegram"),
            NativeView.detail("Telegram remote coding is isolated to this project, uses workspace-write with network disabled, and never exposes the bot token in config, arguments, or logs."),
            setupCard, hubCard, usageCard
        ])
        updateButtons()
        check()
    }

    func refreshOnAppear() { check() }

    @objc private func connectBot() {
        guard let window = view.window else { return }
        AlertFactory.textSheet(
            window: window,
            title: "Telegram Bot Token",
            message: "First send /start to your bot from the private Telegram account you want to pair. Paste the BotFather token below. It is sent through stdin, stored in macOS Keychain, and never logged.",
            secure: true,
            placeholder: "123456789:ABC…"
        ) { [weak self] token in
            guard let self = self, let token = token else { return }
            self.runMutation(
                args: ["telegram", "setup", "--bot-token-stdin", "--project-root", AppRuntime.projectRoot, "--json"],
                stdin: token + "\n",
                kind: "telegram-setup",
                summary: "Connect Telegram bot and register dedicated Codex session"
            )
        }
    }

    @objc private func startHub() {
        runMutation(
            args: ["telegram", "hub", "start", "--project-root", AppRuntime.projectRoot, "--json"],
            kind: "telegram-hub-start",
            summary: "Start Telegram Hub"
        )
    }

    @objc private func stopHub() {
        runMutation(
            args: ["telegram", "hub", "stop", "--project-root", AppRuntime.projectRoot, "--json"],
            kind: "telegram-hub-stop",
            summary: "Stop Telegram Hub"
        )
    }

    @objc private func restartHub() {
        runMutation(
            args: ["telegram", "hub", "restart", "--project-root", AppRuntime.projectRoot, "--json"],
            kind: "telegram-hub-restart",
            summary: "Restart Telegram Hub"
        )
    }

    @objc private func check() {
        guard !busy else { return }
        generation += 1
        let requestGeneration = generation
        checkButton?.isEnabled = false
        readinessStatus.stringValue = "Checking project readiness…"
        setupStatus.stringValue = "Checking Keychain, pairing, and dedicated Codex session…"
        hubStatus.stringValue = "Checking LaunchAgent state…"
        var remote: [String: Any]?
        var telegram: [String: Any]?
        let group = DispatchGroup()
        group.enter()
        processClient.run(["remote", "readiness", "--project-root", AppRuntime.projectRoot, "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            remote = self?.json(result.output)
            group.leave()
        }
        group.enter()
        processClient.run(["telegram", "status", "--project-root", AppRuntime.projectRoot, "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            telegram = self?.json(result.output)
            group.leave()
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self, self.generation == requestGeneration else { return }
            self.render(remote: remote, telegram: telegram)
            self.updateButtons()
        }
    }

    private func runMutation(args: [String], stdin: String? = nil, kind: String, summary: String) {
        guard !busy else {
            hubStatus.stringValue = "Another Telegram operation is already running."
            return
        }
        guard let operation = operations.begin(kind: kind, mutationGroup: "telegram", summary: summary) else {
            hubStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        _ = operations.update(operation, state: .running, stage: "running", progress: nil, summary: summary)
        hubStatus.stringValue = "\(summary)…"
        processClient.run(args, stdin: stdin, timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            let ok = result.code == 0
            _ = self.operations.update(
                operation,
                state: ok ? .succeeded : .failed,
                stage: "complete",
                progress: 1,
                summary: ok ? "\(summary) completed" : "\(summary) failed"
            )
            self.setBusy(false)
            if !ok {
                self.hubStatus.stringValue = kind == "telegram-setup"
                    ? "Setup failed. Confirm you sent /start to this bot, then retry. The token was not written to logs."
                    : "\(summary) failed · \(NativeView.redactPreview(result.output))"
            }
            self.check()
        }
    }

    private func setBusy(_ value: Bool) {
        busy = value
        updateButtons()
    }

    private func updateButtons() {
        connectButton?.isEnabled = !busy
        startButton?.isEnabled = !busy && setupReady && !hubRunning
        stopButton?.isEnabled = !busy && hubRunning
        restartButton?.isEnabled = !busy && setupReady && hubRunning
        checkButton?.isEnabled = !busy
    }

    private func render(remote: [String: Any]?, telegram: [String: Any]?) {
        if let remote = remote {
            let host = remote["host"] as? [String: Any]
            let project = remote["project"] as? [String: Any]
            let blockers = remote["blockers"] as? [String] ?? []
            readinessStatus.stringValue = "Project readiness: \(remote["ok"] as? Bool == true ? "Ready" : "Needs attention") · Codex app \(host?["codex_app_found"] as? Bool == true ? "found" : "missing") · CLI \(host?["codex_cli_found"] as? Bool == true ? "found" : "missing") · Git \(project?["git_repo"] as? Bool == true ? "ready" : "missing")" + (blockers.isEmpty ? "" : " · \(blockers.prefix(2).joined(separator: "; "))")
        } else {
            readinessStatus.stringValue = "Project readiness is unavailable. Open Diagnostics for the redacted log."
        }

        guard let telegram = telegram else {
            setupReady = false
            hubRunning = false
            setupStatus.stringValue = "Telegram setup status is unavailable."
            hubStatus.stringValue = "Telegram Hub status is unavailable."
            return
        }
        let token = telegram["token_configured"] as? Bool == true
        let pairing = telegram["pairing_valid"] as? Bool == true
        let sessions = telegram["registered_session_count"] as? Int ?? 0
        setupReady = token && pairing && sessions > 0
        hubRunning = telegram["hub_running"] as? Bool == true
        setupStatus.stringValue = "Keychain token \(token ? "ready" : "missing") · private pairing \(pairing ? "ready" : "missing") · dedicated Codex sessions \(sessions)" + (setupReady ? " · ready to start" : " · connect the bot to continue")
        let service = telegram["service"] as? [String: Any]
        let installed = service?["installed"] as? Bool == true
        let state = service?["state"] as? String
        hubStatus.stringValue = "Hub \(hubRunning ? "Running" : installed ? "Stopped" : "Not installed")" + (state.map { " · launchd \($0)" } ?? "") + (hubRunning ? " · send a Telegram message to code" : setupReady ? " · click Start Hub" : "")
    }

    private func json(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { return object }
        guard let start = text.range(of: "{", options: [.backwards])?.lowerBound else { return nil }
        let slice = String(text[start...])
        guard let sliced = slice.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: sliced) as? [String: Any]
    }
}
