import Cocoa

final class ProvidersViewController: NSViewController {
    private let processClient: ProcessClient
    private let providerStatus = NativeView.detail("Provider status unchecked.")
    private let fastStatus = NativeView.detail("Fast Mode: checking current desktop setting…")
    init(processClient: ProcessClient) { self.processClient = processClient; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        let credentials = NSStackView(views: [
            NativeView.button("Set Domain and Key…", target: self, action: #selector(setDomainAndKey)),
            NativeView.button("Replace Key…", target: self, action: #selector(replaceKey))
        ])
        credentials.orientation = .horizontal; credentials.spacing = 8
        let buttons = NSStackView(views: [
            NativeView.button("Use ChatGPT OAuth", target: self, action: #selector(useOAuth)),
            NativeView.button("Use codex-lb", target: self, action: #selector(useCodexLb)),
            NativeView.button("Fast Mode On", target: self, action: #selector(fastOn)),
            NativeView.button("Fast Mode Off", target: self, action: #selector(fastOff))
        ])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Providers"),
            NativeView.detail("Provider changes use typed SKS commands and verified Codex restarts. Credentials stay out of logs and notifications."),
            credentials, providerStatus, fastStatus, buttons
        ])
        refresh()
    }

    private func run(_ args: [String], title: String, completion: (() -> Void)? = nil) {
        providerStatus.stringValue = "\(title)…"
        processClient.run(args) { [weak self] result in
            self?.providerStatus.stringValue = result.code == 0 ? "\(title) complete." : "\(title) failed. See Diagnostics."
            completion?()
        }
    }

    private func refresh() {
        processClient.run(["codex-lb", "status", "--json"]) { [weak self] result in
            self?.providerStatus.stringValue = result.code == 0 ? "Provider status loaded." : "Provider status unavailable."
        }
        refreshFastStatus()
    }

    private func refreshFastStatus() {
        fastStatus.stringValue = "Fast Mode: checking current desktop setting…"
        processClient.run(["fast-mode", "status", "--json"]) { [weak self] result in
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
            self.promptForKey(window: window, args: ["codex-lb", "setup", "--host", host, "--api-key-stdin", "--yes", "--no-default-provider", "--preserve-auth", "--no-keychain", "--no-restart-app", "--json"])
        }
    }

    @objc private func replaceKey() {
        guard let window = view.window else { return }
        promptForKey(window: window, args: ["codex-lb", "set-key", "--api-key-stdin", "--preserve-auth", "--restart-app", "--json"])
    }

    private func promptForKey(window: NSWindow, args: [String]) {
        AlertFactory.textSheet(window: window, title: "Codex LB API Key", message: "Paste a new key. It is sent through stdin and never shown again.", secure: true) { [weak self] key in
            guard let self = self, let key = key else { return }
            self.providerStatus.stringValue = "Saving Codex LB API key…"
            self.processClient.run(args, stdin: key + "\n") { [weak self] result in
                self?.providerStatus.stringValue = result.code == 0 ? "Codex LB API key saved." : "Codex LB API key save failed. See Diagnostics."
            }
        }
    }

    @objc private func useOAuth() { run(["codex-lb", "use-oauth", "--restart-app", "--json"], title: "Use ChatGPT OAuth") }
    @objc private func useCodexLb() { run(["codex-lb", "use-codex-lb", "--restart-app", "--json"], title: "Use codex-lb") }
    @objc private func fastOn() { run(["fast-mode", "on", "--json"], title: "Fast Mode On") { [weak self] in self?.refreshFastStatus() } }
    @objc private func fastOff() { run(["fast-mode", "off", "--json"], title: "Fast Mode Off") { [weak self] in self?.refreshFastStatus() } }
}
