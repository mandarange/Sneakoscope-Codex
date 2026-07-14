import Cocoa

final class ProvidersViewController: NSViewController {
    private let processClient: ProcessClient
    private let status = NativeView.detail("Provider status has not been checked.")
    init(processClient: ProcessClient) { self.processClient = processClient; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        let buttons = NSStackView(views: [
            NativeView.button("Use ChatGPT OAuth", target: self, action: #selector(useOAuth)),
            NativeView.button("Use codex-lb", target: self, action: #selector(useCodexLb)),
            NativeView.button("Fast Mode On", target: self, action: #selector(fastOn)),
            NativeView.button("Fast Mode Off", target: self, action: #selector(fastOff))
        ])
        buttons.orientation = .horizontal; buttons.spacing = 8
        view = NativeView.stack([
            NativeView.title("Providers"),
            NativeView.detail("Provider changes use typed SKS commands and verified Codex restarts. Credentials are never placed in logs or notification bodies."),
            status, buttons
        ])
        refresh()
    }

    private func run(_ args: [String], title: String) {
        status.stringValue = "\(title)…"
        processClient.run(args) { [weak self] result in self?.status.stringValue = result.code == 0 ? "\(title) complete." : "\(title) failed. See Diagnostics." }
    }

    private func refresh() { processClient.run(["codex-lb", "status", "--json"]) { [weak self] result in self?.status.stringValue = result.code == 0 ? "Provider status loaded." : "Provider status unavailable." } }
    @objc private func useOAuth() { run(["codex-lb", "use-oauth", "--restart-app", "--json"], title: "Use ChatGPT OAuth") }
    @objc private func useCodexLb() { run(["codex-lb", "use-codex-lb", "--restart-app", "--json"], title: "Use codex-lb") }
    @objc private func fastOn() { run(["fast-mode", "on", "--json"], title: "Fast Mode On") }
    @objc private func fastOff() { run(["fast-mode", "off", "--json"], title: "Fast Mode Off") }
}
