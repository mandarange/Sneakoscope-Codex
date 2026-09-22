import Cocoa

/// Control Center page for optional Jev decisions. Every action is an explicit
/// `sks decision …` call. Status never contacts OpenRouter.
final class LocalDecisionViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let badge = NativeView.badge("Checking…", color: .secondaryLabelColor)
    private let modelDetail = NativeView.detail("Checking configuration…")
    private let guidance = NativeView.detail("")
    private let actionStatus = NativeView.detail("")
    private let modePopup = NSPopUpButton()
    private let modeStatus = NativeView.detail("Jev compiles a typed Choice into SKS-owned plan or context selection.")
    private var enableButton: NSButton!
    private var disableButton: NSButton!
    private var refreshButton: NSButton!
    private var connectionsButton: NSButton!
    private var status: LocalDecisionStatus?
    private var pendingMode: String?
    private var busy = false
    private var generation = 0
    /// Section navigation by sidebar title, wired by ControlCenterWindowController.
    var openSection: ((String) -> Void)?

    init(processClient: ProcessClient, operations: OperationCoordinator) {
        self.processClient = processClient
        self.operations = operations
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        enableButton = NativeView.button("Enable Jev…", target: self, action: #selector(enableJev))
        disableButton = NativeView.button("Disable", target: self, action: #selector(disableJev))
        refreshButton = NativeView.button("Refresh", target: self, action: #selector(refresh))
        connectionsButton = NativeView.button("Connections…", target: self, action: #selector(openConnections))
        connectionsButton.setAccessibilityIdentifier("sks-decision-connections")
        enableButton.isEnabled = false
        disableButton.isEnabled = false
        modePopup.addItems(withTitles: ["Off", "Jev"])
        modePopup.target = self
        modePopup.action = #selector(applyMode)
        modePopup.isEnabled = false
        modePopup.setAccessibilityLabel("Decision mode")
        modePopup.setAccessibilityIdentifier("sks-decision-mode")
        badge.setAccessibilityIdentifier("sks-decision-badge")
        actionStatus.setAccessibilityIdentifier("sks-decision-action-status")
        let statusCard = NativeView.card(
            title: "Decisions",
            subtitle: "Optional Jev judgments through the existing OpenRouter credential. Off by default. A valid answer is compiled into an existing SKS candidate; there is no advisory text and no second LLM judge.",
            views: [badge, modelDetail, guidance, NativeView.row([refreshButton, connectionsButton])]
        )
        let modeCard = NativeView.card(
            title: "Mode",
            subtitle: "Off: no network call. Jev: send bounded evidence to OpenRouter after explicit cloud consent. Recovery is unsupported.",
            views: [NativeView.row([modePopup, enableButton, disableButton]), modeStatus, actionStatus]
        )
        view = NativeView.page([
            ControlKit.header("Decisions", "Optional Jev selection through OpenRouter."),
            statusCard, modeCard
        ])
    }

    func refreshOnAppear() { refresh() }

    @objc private func openConnections() { openSection?("Providers") }

    @objc private func refresh() {
        guard !busy else { return }
        generation += 1
        let requestGeneration = generation
        processClient.run(LocalDecisionCommand.status, timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self, requestGeneration == self.generation, !self.busy else { return }
            guard result.code == 0, let payload = LocalDecisionJSON.object(from: result.output),
                  let status = LocalDecisionStatus.decode(from: payload) else {
                self.status = nil
                self.render(failure: LocalDecisionJSON.statusFailureReason(code: result.code, output: result.output))
                return
            }
            self.status = status
            self.pendingMode = nil
            self.render(failure: nil)
        }
    }

    private func render(failure: String?) {
        let mode = pendingMode ?? status?.mode
        if let status {
            let color: NSColor = status.badgeReady ? .systemGreen : (status.mode == "jev" ? .systemOrange : .secondaryLabelColor)
            NativeView.setBadge(badge, text: status.badgeText, color: color)
            modelDetail.stringValue = status.modelLabel
            guidance.stringValue = status.guidance
            if !status.recoverySupported {
                modeStatus.stringValue = "Recovery is unsupported: no SKS-owned ambiguous-failure handler exists."
                modeStatus.textColor = .secondaryLabelColor
            }
        } else {
            NativeView.setBadge(badge, text: failure ?? "Unavailable", color: .systemOrange)
            modelDetail.stringValue = ""
            guidance.stringValue = "Enable and Disable still call `sks decision` so a stale status read cannot trap this page."
        }
        enableButton.isEnabled = mode != "jev" || mode == nil
        disableButton.isEnabled = mode == "jev" || mode == nil
        connectionsButton.isEnabled = true
        modePopup.isEnabled = true
        if let mode { modePopup.selectItem(withTitle: mode == "jev" ? "Jev" : "Off") }
    }

    @objc private func applyMode() {
        guard !busy else { return }
        let desired = modePopup.titleOfSelectedItem == "Jev" ? "jev" : "off"
        let current = pendingMode ?? status?.mode
        guard desired != current else { return }
        if desired == "jev" {
            enableJev()
            return
        }
        disableJev()
    }

    @objc private func enableJev() {
        guard !busy else { return }
        guard let window = hostWindow() else {
            revertModePopup()
            actionStatus.stringValue = "Open SKS Control Center to confirm cloud consent."
            return
        }
        AlertFactory.confirmSheet(
            window: window,
            title: "Enable Jev through OpenRouter?",
            message: status?.enableConsentMessage ?? LocalDecisionStatus.enableConsentBody,
            destructive: false,
            actionTitle: "Consent and Enable"
        ) { [weak self] confirmed in
            guard let self, confirmed else {
                self?.revertModePopup()
                return
            }
            guard let operation = self.operations.begin(kind: "decision-enable", mutationGroup: "decision", summary: "Enable Jev via OpenRouter") else {
                self.revertModePopup()
                self.actionStatus.stringValue = "Another configuration change is running. Try again when it finishes."
                return
            }
            self.setBusy(true, message: "Enabling Jev…")
            self.processClient.run(LocalDecisionCommand.enable, timeout: NativeView.mutationTimeout) { [weak self] result in
                guard let self else { return }
                let payload = LocalDecisionJSON.object(from: result.output)
                let ok = result.code == 0 && LocalDecisionCommand.mutationSucceeded(payload, schema: LocalDecisionCommand.enableSchema)
                if ok { self.pendingMode = "jev" }
                else { self.revertModePopup() }
                let summary = ok ? "Jev enabled through OpenRouter." : "Enable failed · \(NativeView.redactPreview(result.output))"
                _ = self.operations.update(operation, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: summary)
                self.setBusy(false, message: summary)
            }
        }
    }

    @objc private func disableJev() {
        guard !busy else { return }
        guard let operation = operations.begin(kind: "decision-disable", mutationGroup: "decision", summary: "Disable Jev") else {
            revertModePopup()
            actionStatus.stringValue = "Another configuration change is running. Try again when it finishes."
            return
        }
        setBusy(true, message: "Returning to the deterministic baseline…")
        processClient.run(LocalDecisionCommand.disable, timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self else { return }
            let payload = LocalDecisionJSON.object(from: result.output)
            let ok = result.code == 0 && LocalDecisionCommand.mutationSucceeded(payload, schema: LocalDecisionCommand.disableSchema)
            if ok { self.pendingMode = "off" }
            else { self.revertModePopup() }
            let summary = ok ? "Mode set to off." : "Disable could not be confirmed · \(NativeView.redactPreview(result.output))"
            _ = self.operations.update(operation, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: summary)
            self.setBusy(false, message: summary)
        }
    }

    private func setBusy(_ value: Bool, message: String) {
        busy = value
        actionStatus.stringValue = message
        actionStatus.textColor = value ? .secondaryLabelColor : .labelColor
        if value {
            for button in [enableButton, disableButton, refreshButton, connectionsButton] { button?.isEnabled = false }
            modePopup.isEnabled = false
        } else {
            refreshButton.isEnabled = true
            connectionsButton.isEnabled = true
            refresh()
        }
    }

    private func revertModePopup() {
        let mode = pendingMode ?? status?.mode
        modePopup.selectItem(withTitle: mode == "jev" ? "Jev" : "Off")
    }

    private func hostWindow() -> NSWindow? {
        view.window ?? NSApp.keyWindow ?? NSApp.windows.first(where: { $0.title == "SKS Control Center" })
    }
}
