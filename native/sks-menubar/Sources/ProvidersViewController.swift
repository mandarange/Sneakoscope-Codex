import Cocoa

final class ProvidersViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let providerStatus = NativeView.detail("Provider status unchecked.")
    private let fastStatus = NativeView.detail("Fast Mode: checking current desktop setting…")
    private var actionButtons: [NSButton] = []
    private var busy = false

    init(processClient: ProcessClient, operations: OperationCoordinator) {
        self.processClient = processClient
        self.operations = operations
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        let setDomain = NativeView.button("Set Domain and Key…", target: self, action: #selector(setDomainAndKey))
        let replace = NativeView.button("Replace Key…", target: self, action: #selector(replaceKey))
        let useOAuth = NativeView.button("Use ChatGPT OAuth", target: self, action: #selector(useOAuth))
        let useLb = NativeView.button("Use codex-lb", target: self, action: #selector(useCodexLb))
        let fastOn = NativeView.button("Fast Mode On", target: self, action: #selector(fastOn))
        let fastOff = NativeView.button("Fast Mode Off", target: self, action: #selector(fastOff))
        actionButtons = [setDomain, replace, useOAuth, useLb, fastOn, fastOff]
        let credentials = NSStackView(views: [setDomain, replace])
        credentials.orientation = .horizontal; credentials.spacing = 8
        let buttons = NSStackView(views: [useOAuth, useLb, fastOn, fastOff])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Providers"),
            NativeView.detail("Set Domain and Key only stores credentials. Use codex-lb activates them with a shared OpenAI routing guard so sk-clb keys never hit api.openai.com. Secrets stay on stdin and out of logs."),
            credentials, providerStatus, fastStatus, buttons
        ])
        refresh()
    }

    func refreshOnAppear() { refresh() }

    private func setBusy(_ value: Bool) {
        busy = value
        for button in actionButtons { button.isEnabled = !value }
    }

    private func run(_ args: [String], title: String, kind: String, group: String?, timeout: TimeInterval = NativeView.mutationTimeout, completion: (() -> Void)? = nil) {
        guard !busy else {
            providerStatus.stringValue = "Another provider action is already running."
            return
        }
        guard let snapshot = operations.begin(kind: kind, mutationGroup: group, summary: title) else {
            providerStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        providerStatus.stringValue = "\(title)…"
        _ = operations.update(snapshot, state: .running, stage: "running", progress: nil, summary: title)
        processClient.run(args, timeout: timeout) { [weak self] result in
            guard let self = self else { return }
            self.setBusy(false)
            _ = self.operations.update(
                snapshot,
                state: result.code == 0 ? .succeeded : .failed,
                stage: "complete",
                progress: 1,
                summary: result.code == 0 ? "\(title) completed" : "\(title) failed"
            )
            if result.code != 0 {
                self.providerStatus.stringValue = "\(title) failed · \(NativeView.redactPreview(result.output))"
            }
            self.refresh()
            completion?()
        }
    }

    private func refresh() {
        processClient.run(["codex-lb", "status", "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self = self else { return }
            guard result.code == 0, let json = self.json(result.output) else {
                if !self.busy { self.providerStatus.stringValue = "Provider status unavailable. Retry or open Diagnostics." }
                return
            }
            if !self.busy { self.providerStatus.stringValue = self.describeProviderStatus(json) }
        }
        refreshFastStatus()
    }

    private func describeProviderStatus(_ json: [String: Any]) -> String {
        let configured = json["provider_configured"] as? Bool == true
        let selected = json["selected"] as? Bool == true
        let ok = json["ok"] as? Bool == true
        let authMode = json["auth_mode"] as? String ?? "unknown"
        let coherent = json["auth_routing_coherent"] as? Bool
        let routing = json["shared_openai_routing"] as? [String: Any]
        let routingSafe = routing?["safe"] as? Bool
        let keyInShared = json["codex_lb_key_in_shared_auth"] as? Bool == true

        if !configured {
            return "Codex LB: not configured. Use Set Domain and Key, then Use codex-lb."
        }
        if routingSafe == false || (keyInShared && coherent == false) {
            return "Codex LB: routing unsafe — shared key can hit api.openai.com. Click Use codex-lb to repair."
        }
        if selected && ok {
            return "Codex LB: active (auth=\(authMode), routing guarded)."
        }
        if selected && !ok {
            return "Codex LB: selected but not ready. Click Use codex-lb or check Diagnostics."
        }
        if keyInShared {
            return "Codex LB: credentials in shared auth but provider not selected. Click Use ChatGPT OAuth or Use codex-lb."
        }
        return "Codex LB: credentials stored, not selected (auth=\(authMode)). Click Use codex-lb to activate."
    }

    private func refreshFastStatus() {
        if !busy { fastStatus.stringValue = "Fast Mode: checking current desktop setting…" }
        processClient.run(["fast-mode", "status", "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self = self else { return }
            guard result.code == 0, let json = self.json(result.output),
                  let global = json["global"] as? [String: Any], let on = global["on"] as? Bool else {
                self.fastStatus.stringValue = "Fast Mode: unavailable — no state was assumed."
                return
            }
            let tier = global["service_tier"] as? String ?? (on ? "fast" : "default")
            self.fastStatus.stringValue = "Fast Mode: \(on ? "On" : "Off") (service_tier=\(tier))."
        }
    }

    private func json(_ output: String) -> [String: Any]? {
        guard let data = output.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    @objc private func setDomainAndKey() {
        guard let window = view.window else { return }
        AlertFactory.textSheet(window: window, title: "Codex LB Domain", message: "Enter a codex-lb domain or base URL.") { [weak self] host in
            guard let self = self, let host = host else { return }
            self.promptForKey(window: window, args: ["codex-lb", "setup", "--host", host, "--api-key-stdin", "--yes", "--no-default-provider", "--preserve-auth", "--no-keychain", "--no-restart-app", "--json"], kind: "codex-lb-setup", title: "Save Codex LB credentials")
        }
    }

    @objc private func replaceKey() {
        guard let window = view.window else { return }
        promptForKey(window: window, args: ["codex-lb", "set-key", "--api-key-stdin", "--preserve-auth", "--restart-app", "--json"], kind: "codex-lb-set-key", title: "Replace Codex LB API key")
    }

    private func promptForKey(window: NSWindow, args: [String], kind: String, title: String) {
        AlertFactory.textSheet(window: window, title: "Codex LB API Key", message: "Paste a new key. It is sent through stdin and never shown again.", secure: true) { [weak self] key in
            guard let self = self, let key = key else { return }
            guard !self.busy else {
                self.providerStatus.stringValue = "Another provider action is already running."
                return
            }
            guard let snapshot = self.operations.begin(kind: kind, mutationGroup: "codex-config", summary: title) else {
                self.providerStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
                return
            }
            self.setBusy(true)
            self.providerStatus.stringValue = "Saving Codex LB API key…"
            _ = self.operations.update(snapshot, state: .running, stage: "running", progress: nil, summary: title)
            self.processClient.run(args, stdin: key + "\n", timeout: NativeView.mutationTimeout) { [weak self] result in
                guard let self = self else { return }
                self.setBusy(false)
                _ = self.operations.update(
                    snapshot,
                    state: result.code == 0 ? .succeeded : .failed,
                    stage: "complete",
                    progress: 1,
                    summary: result.code == 0 ? "Codex LB API key saved" : "Codex LB API key save failed"
                )
                if result.code != 0 {
                    self.providerStatus.stringValue = "Codex LB API key save failed · \(NativeView.redactPreview(result.output))"
                }
                self.refresh()
            }
        }
    }

    @objc private func useOAuth() { run(["codex-lb", "use-oauth", "--restart-app", "--json"], title: "Use ChatGPT OAuth", kind: "codex-lb-use-oauth", group: "codex-config") }
    @objc private func useCodexLb() { run(["codex-lb", "use-codex-lb", "--restart-app", "--json"], title: "Use codex-lb", kind: "codex-lb-use-lb", group: "codex-config") }
    @objc private func fastOn() { run(["fast-mode", "on", "--json"], title: "Fast Mode On", kind: "fast-mode-on", group: "codex-config", timeout: NativeView.statusTimeout) { [weak self] in self?.refreshFastStatus() } }
    @objc private func fastOff() { run(["fast-mode", "off", "--json"], title: "Fast Mode Off", kind: "fast-mode-off", group: "codex-config", timeout: NativeView.statusTimeout) { [weak self] in self?.refreshFastStatus() } }
}
