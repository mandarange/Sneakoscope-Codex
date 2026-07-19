import Cocoa

final class ProvidersViewController: NSViewController, ControlCenterPage {
    private struct CodexLbReadiness {
        let selected: Bool
        let providerReady: Bool
        let authRoutingCoherent: Bool
        let sharedOpenAiRoutingSafe: Bool

        var ready: Bool {
            selected && providerReady && authRoutingCoherent && sharedOpenAiRoutingSafe
        }
    }

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
        let testConnection = NativeView.button("Test Connection", target: self, action: #selector(testConnection))
        let useOAuth = NativeView.button("Restore Chat / Pro (OAuth)", target: self, action: #selector(useOAuth))
        let useLb = NativeView.button("Use codex-lb", target: self, action: #selector(useCodexLb))
        let fastOn = NativeView.button("Fast Mode On", target: self, action: #selector(fastOn))
        let fastOff = NativeView.button("Fast Mode Off", target: self, action: #selector(fastOff))
        actionButtons = [setDomain, replace, testConnection, useOAuth, useLb, fastOn, fastOff]
        let credentials = NSStackView(views: [setDomain, replace, testConnection])
        credentials.orientation = .horizontal; credentials.spacing = 8
        let buttons = NSStackView(views: [useOAuth, useLb, fastOn, fastOff])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Providers"),
            NativeView.detail("Saving stores credentials only. Use codex-lb activates them with a routing guard so sk-clb keys cannot reach api.openai.com. Keys travel through stdin and stay out of logs."),
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
        let codexLb = codexLbPayload(json)
        let configured = codexLb["provider_configured"] as? Bool == true
        let readiness = codexLbReadiness(codexLb)
        let ok = codexLb["ok"] as? Bool == true
        let authMode = codexLb["auth_mode"] as? String ?? "unknown"
        let keyInShared = codexLb["codex_lb_key_in_shared_auth"] as? Bool == true

        if !configured {
            return "Codex LB: not configured. Use Set Domain and Key, then Use codex-lb."
        }
        if !readiness.sharedOpenAiRoutingSafe || (keyInShared && !readiness.authRoutingCoherent) {
            return "Codex LB: routing unsafe — shared key can hit api.openai.com. Click Use codex-lb to repair."
        }
        if readiness.ready && ok {
            return "Codex LB: active (auth=\(authMode), routing guarded). Restore Chat / Pro switches to ChatGPT OAuth."
        }
        if readiness.selected && (!readiness.providerReady || !ok) {
            return "Codex LB: selected but not ready. Click Use codex-lb or Test Connection."
        }
        if keyInShared {
            return "Codex LB: credentials in shared auth but provider not selected. Click Use ChatGPT OAuth or Use codex-lb."
        }
        return "Codex LB: credentials stored, not selected (auth=\(authMode)). Click Use codex-lb to activate."
    }

    private func codexLbPayload(_ json: [String: Any]) -> [String: Any] {
        if let codexLb = json["codex_lb"] as? [String: Any] { return codexLb }
        return json
    }

    private func codexLbReadiness(_ codexLb: [String: Any]) -> CodexLbReadiness {
        let sharedOpenAiRouting = codexLb["shared_openai_routing"] as? [String: Any]
        return CodexLbReadiness(
            selected: codexLb["selected"] as? Bool == true,
            providerReady: codexLb["provider_ready"] as? Bool == true,
            authRoutingCoherent: codexLb["auth_routing_coherent"] as? Bool == true,
            sharedOpenAiRoutingSafe: sharedOpenAiRouting?["safe"] as? Bool == true
        )
    }

    private func modelSelectionSummary(_ json: [String: Any]) -> String? {
        guard let modelSelection = json["model_selection"] as? [String: Any] else { return nil }
        let model = modelSelection["model"] as? String
        let source = modelSelection["source"] as? String
        if let model = model, !model.isEmpty, let source = source, !source.isEmpty {
            return "model \(model) via \(source)"
        }
        if let model = model, !model.isEmpty { return "model \(model)" }
        return nil
    }

    private func structuredReason(_ json: [String: Any], codexLb: [String: Any], readiness: CodexLbReadiness) -> String {
        if codexLb["env_key_configured"] as? Bool != true { return "API key is missing" }
        if (codexLb["base_url"] as? String)?.isEmpty != false { return "base URL is missing" }
        if let status = json["status"] as? String,
           ["transport_blocked", "first_request_failed", "missing_response_id", "second_request_failed", "previous_response_not_found", "tool_output_recovery_blocked"].contains(status) {
            return status.replacingOccurrences(of: "_", with: " ")
        }
        if !readiness.selected { return "saved credentials are not selected" }
        if !readiness.providerReady { return "provider configuration is not ready" }
        if !readiness.authRoutingCoherent { return "provider and authentication routing disagree" }
        if !readiness.sharedOpenAiRoutingSafe { return "shared OpenAI routing guard is unsafe" }
        if let reason = json["reason"] as? String, !reason.isEmpty { return reason.replacingOccurrences(of: "_", with: " ") }
        return "response-chain verification did not pass"
    }

    private func nextAction(status: String, codexLb: [String: Any], readiness: CodexLbReadiness) -> String {
        let credentialsSaved = codexLb["env_key_configured"] as? Bool == true
            && (codexLb["base_url"] as? String)?.isEmpty == false
        if status == "not_configured" {
            return credentialsSaved
                ? "click Use codex-lb to activate the saved credentials"
                : "click Set Domain and Key"
        }
        if status == "missing_env_key" || status == "missing_base_url" || !credentialsSaved {
            return "click Set Domain and Key"
        }
        if status == "model_unselected" { return "select a Codex model, then retry" }
        if !readiness.ready { return "click Use codex-lb; if it still fails, open Diagnostics" }
        return "verify the domain, key, and network, then retry"
    }

    private func describeConnectionResult(_ json: [String: Any], processCode: Int32) -> (ok: Bool, message: String) {
        let codexLb = codexLbPayload(json)
        let readiness = codexLbReadiness(codexLb)
        let chainOk = processCode == 0 && json["ok"] as? Bool == true
        let status = json["status"] as? String ?? (processCode == 0 ? "unknown" : "command_failed")
        let model = modelSelectionSummary(json).map { " · \($0)" } ?? ""
        if chainOk {
            if readiness.ready {
                return (true, "Connection test passed (\(status)) · provider ready · routing safe\(model).")
            }
            return (true, "Connection test passed (\(status)) · saved credentials reached codex-lb\(model) · Activation required: click Use codex-lb.")
        }
        let reason = structuredReason(json, codexLb: codexLb, readiness: readiness)
        let next = nextAction(status: status, codexLb: codexLb, readiness: readiness)
        return (false, "Connection test: \(status) · Reason: \(reason) · Next: \(next)\(model).")
    }

    private func describeActivationResult(_ activation: [String: Any]?, status: [String: Any]?, activationCode: Int32, statusCode: Int32) -> (ok: Bool, message: String) {
        let authoritative = status ?? activation ?? [:]
        let codexLb = codexLbPayload(authoritative)
        let readiness = codexLbReadiness(codexLb)
        let activationOk = activationCode == 0 && activation?["ok"] as? Bool == true
        let postRestart = activation?["post_restart"] as? [String: Any]
        let activationStatus = postRestart?["status"] as? String
            ?? activation?["status"] as? String
            ?? (activationCode == 0 ? "unknown" : "command_failed")
        let postStatusOk = status == nil ? activationOk : statusCode == 0
        let ready = activationOk && postStatusOk && readiness.ready
        if ready {
            return (true, "Use codex-lb: active after restart · provider, auth, and routing ready.")
        }
        let reason = structuredReason(authoritative, codexLb: codexLb, readiness: readiness)
        let next = nextAction(status: activationStatus, codexLb: codexLb, readiness: readiness)
        return (false, "Use codex-lb: \(activationStatus) · Reason: \(reason) · Next: \(next).")
    }

    private func describeOAuthResult(_ json: [String: Any]?, processCode: Int32) -> (ok: Bool, message: String) {
        let noSwitch = "No OAuth switch was assumed."
        guard let json = json else {
            return (false, "Restore Chat / Pro failed · Invalid JSON. Retry or open Diagnostics. \(noSwitch)")
        }
        let status = json["status"] as? String ?? (processCode == 0 ? "unknown" : "command_failed")
        let mode = json["mode"] as? String
        let restartRequired = json["restart_required"] as? Bool == true
        let restartPerformed = json["restart_performed"] as? Bool == true
        let commandOk = processCode == 0 && json["ok"] as? Bool == true
        let ok = commandOk && mode == "oauth" && restartRequired && restartPerformed
        if ok {
            return (true, "Chat / Pro restored with ChatGPT OAuth · Codex App restarted · codex-lb credentials kept.")
        }
        if status == "no_backup" {
            return (false, "Restore Chat / Pro failed (no_backup) · Run codex login, then retry. \(noSwitch)")
        }
        if status == "auth_in_use" {
            return (false, "Restore Chat / Pro failed (auth_in_use) · Open Diagnostics; auth was not replaced. \(noSwitch)")
        }
        if !restartPerformed {
            return (false, "Restore Chat / Pro failed (restart_not_performed) · Retry, then reopen Codex App. \(noSwitch)")
        }
        return (false, "Restore Chat / Pro failed (\(status)) · Retry or open Diagnostics. \(noSwitch)")
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
        AlertFactory.textSheet(
            window: window,
            title: "Codex LB Domain",
            message: "Enter a hostname or full base URL. https:// is optional — SKS adds https:// and /backend-api/codex when missing.\nExamples: lb.example.com  or  https://lb.example.com",
            secure: false,
            placeholder: "https://lb.example.com"
        ) { [weak self] host in
            guard let self = self, let host = host else { return }
            self.promptForKey(window: window, args: ["codex-lb", "setup", "--host", host, "--api-key-stdin", "--yes", "--no-default-provider", "--preserve-auth", "--no-keychain", "--no-restart-app", "--json"], kind: "codex-lb-setup", title: "Save Codex LB credentials")
        }
    }

    @objc private func replaceKey() {
        guard let window = view.window else { return }
        promptForKey(window: window, args: ["codex-lb", "set-key", "--api-key-stdin", "--preserve-auth", "--restart-app", "--json"], kind: "codex-lb-set-key", title: "Replace Codex LB API key")
    }

    private func promptForKey(window: NSWindow, args: [String], kind: String, title: String) {
        AlertFactory.textSheet(
            window: window,
            title: "Codex LB API Key",
            message: "Paste your Codex LB API key (usually starts with sk-clb-). It is shown here so you can verify the paste, then sent through stdin and never logged.",
            secure: false,
            placeholder: "sk-clb-…"
        ) { [weak self] key in
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

    @objc private func testConnection() {
        guard !busy else {
            providerStatus.stringValue = "Another provider action is already running."
            return
        }
        guard let snapshot = operations.begin(kind: "codex-lb-health", mutationGroup: nil, summary: "Test Codex LB connection") else {
            providerStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        providerStatus.stringValue = "Testing Codex LB connection…"
        _ = operations.update(snapshot, state: .running, stage: "running", progress: nil, summary: "Test Codex LB connection")
        processClient.run(["codex-lb", "health", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.setBusy(false)
            let parsed = self.json(result.output)
            let outcome = parsed.map { self.describeConnectionResult($0, processCode: result.code) }
                ?? (ok: false, message: "Connection test: invalid response · Reason: health output was not structured JSON · Next: retry or open Diagnostics.")
            _ = self.operations.update(
                snapshot,
                state: outcome.ok ? .succeeded : .failed,
                stage: "complete",
                progress: 1,
                summary: outcome.ok ? "Codex LB connection ready" : "Codex LB connection needs action"
            )
            self.providerStatus.stringValue = outcome.message
        }
    }

    @objc private func useOAuth() {
        guard !busy else {
            providerStatus.stringValue = "Another provider action is already running."
            return
        }
        guard let snapshot = operations.begin(kind: "codex-lb-use-oauth", mutationGroup: "codex-config", summary: "Restore Chat / Pro") else {
            providerStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        providerStatus.stringValue = "Restoring Chat / Pro with ChatGPT OAuth and restarting Codex App…"
        _ = operations.update(snapshot, state: .running, stage: "switching", progress: nil, summary: "Restore Chat / Pro")
        processClient.run(["codex-lb", "use-oauth", "--restart-app", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.setBusy(false)
            let outcome = self.describeOAuthResult(self.json(result.output), processCode: result.code)
            _ = self.operations.update(
                snapshot,
                state: outcome.ok ? .succeeded : .failed,
                stage: "complete",
                progress: 1,
                summary: outcome.ok ? "Chat / Pro restored after restart" : "Chat / Pro restore needs action"
            )
            self.providerStatus.stringValue = outcome.message
            self.refreshFastStatus()
        }
    }
    @objc private func useCodexLb() {
        guard !busy else {
            providerStatus.stringValue = "Another provider action is already running."
            return
        }
        guard let snapshot = operations.begin(kind: "codex-lb-use-lb", mutationGroup: "codex-config", summary: "Use codex-lb") else {
            providerStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        providerStatus.stringValue = "Activating codex-lb and restarting Codex App…"
        _ = operations.update(snapshot, state: .running, stage: "activating", progress: nil, summary: "Use codex-lb")
        processClient.run(["codex-lb", "use-codex-lb", "--restart-app", "--json"], timeout: NativeView.mutationTimeout) { [weak self] activationResult in
            guard let self = self else { return }
            let activationJson = self.json(activationResult.output)
            _ = self.operations.update(snapshot, state: .running, stage: "verifying", progress: nil, summary: "Verify codex-lb after restart")
            self.providerStatus.stringValue = "Verifying codex-lb readiness after restart…"
            self.processClient.run(["codex-lb", "status", "--json"], timeout: NativeView.statusTimeout) { [weak self] statusResult in
                guard let self = self else { return }
                self.setBusy(false)
                let statusJson = self.json(statusResult.output)
                let outcome = self.describeActivationResult(
                    activationJson,
                    status: statusJson,
                    activationCode: activationResult.code,
                    statusCode: statusResult.code
                )
                _ = self.operations.update(
                    snapshot,
                    state: outcome.ok ? .succeeded : .failed,
                    stage: "complete",
                    progress: 1,
                    summary: outcome.ok ? "codex-lb active after restart" : "codex-lb activation needs action"
                )
                self.providerStatus.stringValue = outcome.message
            }
        }
    }
    @objc private func fastOn() { run(["fast-mode", "on", "--json"], title: "Fast Mode On", kind: "fast-mode-on", group: "codex-config", timeout: NativeView.statusTimeout) { [weak self] in self?.refreshFastStatus() } }
    @objc private func fastOff() { run(["fast-mode", "off", "--json"], title: "Fast Mode Off", kind: "fast-mode-off", group: "codex-config", timeout: NativeView.statusTimeout) { [weak self] in self?.refreshFastStatus() } }
}
