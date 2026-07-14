import Cocoa

final class RemoteTelegramViewController: NSViewController {
    private let processClient: ProcessClient
    private let status = NativeView.detail("Remote readiness has not been checked.")
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
        status.stringValue = "Checking official Remote readiness…"
        processClient.run(["codex-app", "status", "--json"]) { [weak self] result in
            self?.status.stringValue = result.code == 0 ? "Official Remote readiness loaded. Telegram Hub status is shown when configured." : "Remote readiness is unavailable. Local SKS remains operational."
        }
    }
}
