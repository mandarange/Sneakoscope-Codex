import Cocoa

/// Control Center page for the optional local decision provider. Every action
/// is an explicit `sks decision …` call; nothing here installs, downloads, or
/// starts a process unless the user clicks the matching button.
final class LocalDecisionViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let badge = NativeView.badge("Checking…", color: .secondaryLabelColor)
    private let modelDetail = NativeView.detail("Checking installation…")
    private let guidance = NativeView.detail("")
    private let actionStatus = NativeView.detail("")
    private let modePopup = NSPopUpButton()
    private let modeStatus = NativeView.detail("Mode applies to new Naruto preparations only.")
    private var installButton: NSButton!
    private var startButton: NSButton!
    private var stopButton: NSButton!
    private var uninstallButton: NSButton!
    private var refreshButton: NSButton!
    private let customModel = NSTextField()
    private var customInstallButton: NSButton!
    private var status: LocalDecisionStatus?
    private var busy = false
    private var generation = 0

    init(processClient: ProcessClient, operations: OperationCoordinator) {
        self.processClient = processClient
        self.operations = operations
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { nil }

    override func loadView() {
        installButton = NativeView.button("Install Recommended Model…", target: self, action: #selector(installRecommended))
        startButton = NativeView.button("Start Service", target: self, action: #selector(startService))
        stopButton = NativeView.button("Stop Service", target: self, action: #selector(stopService))
        uninstallButton = NativeView.button("Uninstall…", target: self, action: #selector(uninstall))
        refreshButton = NativeView.button("Refresh", target: self, action: #selector(refresh))
        customInstallButton = NativeView.button("Install This Model…", target: self, action: #selector(installCustom))
        for button in [installButton, startButton, stopButton, uninstallButton, customInstallButton] { button?.isEnabled = false }
        modePopup.addItems(withTitles: ["Off", "Shadow", "Advisory"])
        modePopup.target = self
        modePopup.action = #selector(applyMode)
        modePopup.isEnabled = false
        modePopup.setAccessibilityLabel("Local decision mode")
        modePopup.setAccessibilityIdentifier("sks-local-decision-mode")
        badge.setAccessibilityIdentifier("sks-local-decision-badge")
        actionStatus.setAccessibilityIdentifier("sks-local-decision-action-status")
        customModel.placeholderString = "owner/repository (weights, Hugging Face)"
        customModel.setAccessibilityLabel("Custom model repository")
        let statusCard = NativeView.card(
            title: "Local Decision",
            subtitle: "Optional on-device model that gives short, non-authoritative planning advice to Naruto. Off by default; nothing is downloaded or started until you do it here.",
            views: [badge, modelDetail, guidance, NativeView.row([refreshButton])]
        )
        let setupCard = NativeView.card(
            title: "Setup",
            subtitle: "Install once (private Python environment plus a pinned model snapshot), then start the service. Stop frees the memory; Uninstall removes only what SKS created.",
            views: [NativeView.row([installButton, startButton, stopButton, uninstallButton]), actionStatus]
        )
        let modeCard = NativeView.card(
            title: "Mode",
            subtitle: "Off: no calls. Shadow: record samples only, no behaviour change. Advisory: append a short template to eligible Naruto preparations. Counts, models, effort and gates are never changed.",
            views: [NativeView.row([modePopup, NativeView.detail("Applies to new Naruto preparations")]), modeStatus]
        )
        let advanced = NativeView.card(
            title: "Custom weights repository",
            subtitle: "Install a different Hugging Face weights repository (qwen2, MLX format). The requested engine repository harshatheg/Qwen-2.5-1B-RLCD has no weights and is refused.",
            views: [customModel, NativeView.row([customInstallButton])]
        )
        view = NativeView.page([
            ControlKit.header("Local Decision", "Optional Apple Silicon planning advice for Naruto."),
            statusCard, setupCard, modeCard, NativeDisclosure("Advanced", views: [advanced])
        ])
    }

    func refreshOnAppear() { refresh() }

    @objc private func refresh() {
        guard !busy else { return }
        generation += 1
        let requestGeneration = generation
        processClient.run(["decision", "status", "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self, requestGeneration == self.generation, !self.busy else { return }
            guard result.code == 0, let payload = self.json(result.output), let status = LocalDecisionStatus.decode(from: payload) else {
                self.status = nil
                self.render(nil, failure: "Status unavailable · update SKS, then reopen this page.")
                return
            }
            self.status = status
            self.render(status, failure: nil)
        }
    }

    private func render(_ status: LocalDecisionStatus?, failure: String?) {
        guard let status else {
            NativeView.setBadge(badge, text: failure ?? "Unavailable", color: .systemOrange)
            modelDetail.stringValue = ""
            guidance.stringValue = ""
            for button in [installButton, startButton, stopButton, uninstallButton, customInstallButton] { button?.isEnabled = false }
            modePopup.isEnabled = false
            return
        }
        let color: NSColor = !status.supported ? .secondaryLabelColor : status.serviceReady ? .systemGreen : status.installed ? .systemOrange : .secondaryLabelColor
        NativeView.setBadge(badge, text: status.badgeText, color: color)
        modelDetail.stringValue = status.modelLabel
        guidance.stringValue = status.guidance
        installButton.isEnabled = status.supported && !status.installed
        customInstallButton.isEnabled = status.supported && !status.installed
        startButton.isEnabled = status.supported && status.installed && !status.serviceRunning
        stopButton.isEnabled = status.serviceRunning
        uninstallButton.isEnabled = status.installed && !status.serviceRunning
        modePopup.isEnabled = status.supported
        modePopup.selectItem(withTitle: status.modeTitle)
        if let recommended = status.recommendedModelId {
            installButton.title = "Install \(recommended)…"
        }
        if status.mode != "off", !status.serviceReady {
            modeStatus.stringValue = "Mode is \(status.modeTitle) but the service is not ready: routes keep their baseline until Start completes."
            modeStatus.textColor = .systemOrange
        } else {
            modeStatus.stringValue = "Mode applies to new Naruto preparations only."
            modeStatus.textColor = .secondaryLabelColor
        }
    }

    // MARK: - Install

    @objc private func installRecommended() {
        guard let recommended = status?.recommendedModelId else { return }
        inspectAndInstall(modelId: recommended)
    }

    @objc private func installCustom() {
        let modelId = customModel.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !modelId.isEmpty else {
            actionStatus.stringValue = "Enter a repository id such as owner/repository."
            return
        }
        inspectAndInstall(modelId: modelId)
    }

    private func inspectAndInstall(modelId: String) {
        guard !busy else { return }
        setBusy(true, message: "Inspecting \(modelId) (metadata only, no download)…")
        processClient.run(["decision", "inspect", "--model", modelId, "--json"], timeout: 60) { [weak self] result in
            guard let self else { return }
            guard let payload = self.json(result.output) else {
                self.setBusy(false, message: "Inspect failed · unexpected CLI response.")
                return
            }
            guard let preview = LocalDecisionInstallPlan.preview(from: payload) else {
                self.setBusy(false, message: LocalDecisionInstallPlan.blockerSummary(from: payload))
                return
            }
            self.busy = false
            self.confirmInstall(preview)
        }
    }

    private func confirmInstall(_ preview: LocalDecisionInstallPlan.Preview) {
        guard let window = view.window else { return }
        let license = preview.license ?? "unknown license"
        let message = "Model: \(preview.modelId)\nRevision: \(preview.revision)\nQuantization: \(preview.quantization ?? "unknown")\nDownload: \(LocalDecisionInstallPlan.formatBytes(preview.downloadBytes)) plus a private Python 3.12 environment (about 0.5 GB).\nLicense: \(license). Continuing accepts that license.\n\nThe download runs in the background; this page shows progress and the result."
        AlertFactory.confirmSheet(window: window, title: "Install local model?", message: message, destructive: false, actionTitle: "Accept License & Install") { [weak self] confirmed in
            guard let self, confirmed else { return }
            self.runInstall(preview)
        }
    }

    private func runInstall(_ preview: LocalDecisionInstallPlan.Preview) {
        guard let operation = operations.begin(kind: "local-decision-install", mutationGroup: "local-decision", summary: "Install \(preview.modelId)") else {
            actionStatus.stringValue = "Another configuration change is running. Try again when it finishes."
            return
        }
        setBusy(true, message: "Installing \(preview.modelId)… this can take several minutes.")
        _ = operations.update(operation, state: .running, stage: "install", progress: nil, summary: actionStatus.stringValue)
        processClient.run(LocalDecisionInstallPlan.installArguments(preview), timeout: NativeView.longMutationTimeout) { [weak self] result in
            guard let self else { return }
            let payload = self.json(result.output)
            let ok = result.code == 0 && payload?["schema"] as? String == "sks.local-decision-install.v1" && payload?["ok"] as? Bool == true
            if ok {
                _ = self.operations.update(operation, state: .running, stage: "start", progress: 0.8, summary: "Installed. Starting the service…")
                self.setBusy(true, message: "Installed. Starting the service and running the warm-up…")
                self.runStart { started, detail in
                    _ = self.operations.update(operation, state: started ? .succeeded : .failed, stage: "complete", progress: 1, summary: detail)
                    self.setBusy(false, message: detail)
                }
                return
            }
            let error = (payload?["error"] as? [String: Any])?["code"] as? String ?? NativeView.redactPreview(result.output)
            let summary = "Install failed · \(error). Nothing was promoted; the previous state is unchanged."
            _ = self.operations.update(operation, state: .failed, stage: "complete", progress: 1, summary: summary)
            self.setBusy(false, message: summary)
        }
    }

    // MARK: - Service

    @objc private func startService() {
        guard !busy, let operation = operations.begin(kind: "local-decision-start", mutationGroup: "local-decision", summary: "Start local decision service") else {
            actionStatus.stringValue = "Another configuration change is running. Try again when it finishes."
            return
        }
        setBusy(true, message: "Starting the service and loading the model…")
        runStart { [weak self] ok, detail in
            _ = self?.operations.update(operation, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: detail)
            self?.setBusy(false, message: detail)
        }
    }

    private func runStart(completion: @escaping (Bool, String) -> Void) {
        processClient.run(["decision", "start", "--json"], timeout: 150) { [weak self] result in
            guard let self else { return }
            let payload = self.json(result.output)
            let ok = result.code == 0 && payload?["schema"] as? String == "sks.local-decision-start.v1" && payload?["ok"] as? Bool == true
            if ok {
                let verified = payload?["realModelVerified"] as? Bool == true
                let load = (payload?["loadMs"] as? Double).map { String(format: "%.1f s", $0 / 1000) } ?? "unknown"
                completion(true, "Service ready · model loaded in \(load) · warm-up agreement \(verified ? "verified" : "not verified"). Choose a mode below.")
            } else {
                let error = payload?["error"] as? String ?? NativeView.redactPreview(result.output)
                completion(false, "Start failed · \(error). Routes keep their baseline behaviour.")
            }
        }
    }

    @objc private func stopService() {
        guard !busy, let operation = operations.begin(kind: "local-decision-stop", mutationGroup: "local-decision", summary: "Stop local decision service") else { return }
        setBusy(true, message: "Stopping the service…")
        processClient.run(["decision", "stop", "--json"], timeout: 60) { [weak self] result in
            guard let self else { return }
            let payload = self.json(result.output)
            let ok = result.code == 0 && payload?["ok"] as? Bool == true
            let summary = ok ? "Service stopped. Memory released; routes keep their baseline behaviour." : "Stop could not be confirmed · \(NativeView.redactPreview(result.output))"
            _ = self.operations.update(operation, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: summary)
            self.setBusy(false, message: summary)
        }
    }

    @objc private func uninstall() {
        guard !busy, let window = view.window else { return }
        AlertFactory.confirmSheet(window: window, title: "Uninstall local model?", message: "Removes the private Python environment, the model snapshot, the install receipt and logs created by SKS. Shared caches and other applications are not touched.", destructive: true, actionTitle: "Uninstall") { [weak self] confirmed in
            guard let self, confirmed, let operation = self.operations.begin(kind: "local-decision-uninstall", mutationGroup: "local-decision", summary: "Uninstall local decision model") else { return }
            self.setBusy(true, message: "Uninstalling…")
            self.processClient.run(["decision", "uninstall", "--yes", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
                guard let self else { return }
                let payload = self.json(result.output)
                let ok = result.code == 0 && payload?["ok"] as? Bool == true
                let retained = (payload?["retained"] as? [String])?.count ?? 0
                let summary = ok ? "Uninstalled. \(retained == 0 ? "Nothing was left behind." : "\(retained) unrelated item(s) were left in place.")" : "Uninstall blocked · \(((payload?["blockers"] as? [String]) ?? []).joined(separator: ", "))"
                _ = self.operations.update(operation, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: summary)
                self.setBusy(false, message: summary)
            }
        }
    }

    // MARK: - Mode

    @objc private func applyMode() {
        guard !busy, let current = status else { return }
        let desired = ["Off": "off", "Shadow": "shadow", "Advisory": "advisory"][modePopup.titleOfSelectedItem ?? "Off"] ?? "off"
        guard desired != current.mode else { return }
        guard let operation = operations.begin(kind: "local-decision-mode", mutationGroup: "local-decision", summary: "Set local decision mode to \(desired)") else {
            modePopup.selectItem(withTitle: current.modeTitle)
            modeStatus.stringValue = "Another configuration change is running. Try again when it finishes."
            return
        }
        setBusy(true, message: "Saving mode \(desired)…")
        processClient.run(["decision", "mode", desired, "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self else { return }
            let payload = self.json(result.output)
            let ok = result.code == 0 && payload?["schema"] as? String == "sks.local-decision-mode.v1" && payload?["mode"] as? String == desired
            let warnings = (payload?["warnings"] as? [String]) ?? []
            let summary = ok
                ? (warnings.isEmpty ? "Mode set to \(desired)." : "Mode set to \(desired) · " + warnings.joined(separator: " "))
                : "Mode change could not be confirmed. Rechecking."
            _ = self.operations.update(operation, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: summary)
            self.setBusy(false, message: summary)
        }
    }

    // MARK: - Helpers

    private func setBusy(_ value: Bool, message: String) {
        busy = value
        actionStatus.stringValue = message
        actionStatus.textColor = value ? .secondaryLabelColor : .labelColor
        if value {
            for button in [installButton, startButton, stopButton, uninstallButton, customInstallButton, refreshButton] { button?.isEnabled = false }
            modePopup.isEnabled = false
        } else {
            refreshButton.isEnabled = true
            refresh()
        }
    }

    private func json(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { return object }
        guard let start = text.range(of: "{", options: [.backwards])?.lowerBound else { return nil }
        guard let sliced = String(text[start...]).data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: sliced) as? [String: Any]
    }
}
