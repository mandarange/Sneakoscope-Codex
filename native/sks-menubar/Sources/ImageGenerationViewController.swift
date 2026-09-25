import Cocoa

/// Control Center page for image generation. Off keeps Codex's default image
/// generation; on routes image requests through the SKS Desktop Bridge to the
/// selected OpenRouter model. Every action is an explicit `sks imagegen …`
/// call; the CLI owns validation, the saved setting, and routing.
final class ImageGenerationViewController: NSViewController, ControlCenterPage {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let badge = ControlKit.badge("Checking…", tone: .neutral)
    private let routeDetail = NativeView.detail("Checking image generation…")
    private let issues = NativeView.detail("")
    private let keyHint = NativeView.detail("")
    private let jevNote = NativeView.detail(ImageGenerationStatus.jevNoteText)
    private let customToggle = NSSwitch()
    private let modelPopup = NSPopUpButton()
    private let modelsStatus = NativeView.detail("Image models have not loaded yet.")
    private let modelDetail = NativeView.detail("")
    private let actionStatus = NativeView.detail("")
    private let spinner = NativeView.spinner(label: "Image generation command in progress")
    private var refreshButton: NSButton!
    private var connectionsButton: NSButton!
    private var keyRow: NSStackView!
    private var status: ImageGenerationStatus?
    private var catalog: ImageGenerationModelCatalog?
    /// A model picked while the custom model is off; used when the switch turns on.
    private var pendingModelId: String?
    private var statusLoaded = false
    private var busy = false
    private var modelsLoading = false
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
        refreshButton = NativeView.button("Refresh", target: self, action: #selector(refreshModels))
        refreshButton.setAccessibilityLabel("Refresh OpenRouter image models")
        refreshButton.setAccessibilityIdentifier("sks-imagegen-refresh-models")
        connectionsButton = NativeView.button("Connections…", target: self, action: #selector(openConnections))
        connectionsButton.setAccessibilityIdentifier("sks-imagegen-connections")
        customToggle.target = self
        customToggle.action = #selector(toggleCustomModel)
        customToggle.isEnabled = false
        customToggle.setAccessibilityLabel("Custom image model (OpenRouter)")
        customToggle.setAccessibilityIdentifier("sks-imagegen-custom-toggle")
        modelPopup.target = self
        modelPopup.action = #selector(modelChanged)
        modelPopup.isEnabled = false
        modelPopup.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        modelPopup.setAccessibilityLabel("OpenRouter image model")
        modelPopup.setAccessibilityIdentifier("sks-imagegen-model")
        badge.setAccessibilityIdentifier("sks-imagegen-badge")
        routeDetail.setAccessibilityIdentifier("sks-imagegen-route")
        issues.setAccessibilityIdentifier("sks-imagegen-issues")
        keyHint.setAccessibilityIdentifier("sks-imagegen-key-hint")
        jevNote.setAccessibilityIdentifier("sks-imagegen-jev-note")
        modelsStatus.setAccessibilityIdentifier("sks-imagegen-models-status")
        modelDetail.setAccessibilityIdentifier("sks-imagegen-model-detail")
        actionStatus.setAccessibilityIdentifier("sks-imagegen-action-status")
        for field in [issues, jevNote, modelDetail, actionStatus] { field.isHidden = true }
        keyRow = NativeView.row([keyHint, connectionsButton])
        keyRow.isHidden = true
        renderModelPopup()
        let statusCard = NativeView.card(
            title: "Current image model",
            subtitle: "",
            views: [badge, routeDetail, issues, keyRow, jevNote]
        )
        let customCard = NativeView.card(
            title: "Custom model",
            subtitle: "When this is off, SKS uses Codex's default image generation. When it is on, SKS routes image generation through the SKS Desktop Bridge to the OpenRouter image model you select.",
            views: [
                NativeView.row([customToggle, NativeView.sectionTitle("Custom image model (OpenRouter)"), spinner]),
                modelPopup,
                NativeView.row([refreshButton, modelsStatus]),
                modelDetail,
                actionStatus
            ]
        )
        view = NativeView.page([
            ControlKit.header("Image Generation", "Choose the model SKS uses to create images."),
            statusCard, customCard
        ])
    }

    func refreshOnAppear() {
        refreshStatus()
        loadModels(refresh: false)
    }

    @objc private func openConnections() { openSection?("Providers") }

    @objc private func refreshModels() {
        guard !busy else { return }
        loadModels(refresh: true)
        refreshStatus()
    }

    private func refreshStatus() {
        guard !busy else { return }
        generation += 1
        let requestGeneration = generation
        processClient.run(ImageGenerationCommand.status, timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self, requestGeneration == self.generation, !self.busy else { return }
            let payload = ImageGenerationJSON.object(from: result.output)
            self.statusLoaded = true
            self.status = payload.flatMap { ImageGenerationStatus.decode(from: $0) }
            self.renderStatus(failure: self.status == nil
                ? ImageGenerationJSON.unavailableReason(code: result.code, output: result.output, payload: payload)
                : nil)
        }
    }

    private func loadModels(refresh: Bool) {
        guard !modelsLoading else { return }
        modelsLoading = true
        modelsStatus.stringValue = refresh ? "Fetching image models from OpenRouter…" : "Loading image models…"
        modelsStatus.textColor = .secondaryLabelColor
        renderModelPopup()
        updateControls()
        // A cold six-hour cache makes even the plain list call contact OpenRouter.
        processClient.run(ImageGenerationCommand.models(refresh: refresh), timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self else { return }
            self.modelsLoading = false
            let payload = ImageGenerationJSON.object(from: result.output)
            if let catalog = payload.flatMap({ ImageGenerationModelCatalog.decode(from: $0) }) {
                self.catalog = catalog
                let blocker = catalog.blockers.first.map { " · " + Self.redact(ImageGenerationMessages.describe($0)) } ?? ""
                self.modelsStatus.stringValue = catalog.summary(formatDate: Self.formatTimestamp) + blocker
                self.modelsStatus.textColor = catalog.ok && blocker.isEmpty && !catalog.models.isEmpty
                    ? .secondaryLabelColor : .systemOrange
            } else {
                // Keep any earlier list so a failed refresh cannot erase a working choice.
                let reason = ImageGenerationJSON.unavailableReason(code: result.code, output: result.output, payload: payload)
                self.modelsStatus.stringValue = "Image models unavailable · \(Self.redact(reason))"
                self.modelsStatus.textColor = .systemOrange
            }
            self.renderModelPopup()
            self.updateControls()
        }
    }

    private func renderStatus(failure: String?) {
        if let status {
            ControlKit.setBadge(badge, text: Self.redact(status.badgeText), tone: Self.tone(status.tone))
            routeDetail.stringValue = Self.redact(status.routeDetail)
            let blockers = status.blockerMessages.map(Self.redact)
            let warnings = status.warningMessages.map(Self.redact)
            issues.stringValue = (blockers + warnings).joined(separator: "\n")
            issues.textColor = blockers.isEmpty ? .secondaryLabelColor : .systemOrange
            issues.isHidden = blockers.isEmpty && warnings.isEmpty
            keyHint.stringValue = status.keyHint ?? ""
            keyRow.isHidden = status.keyHint == nil
            jevNote.isHidden = status.jevNote == nil
            customToggle.state = status.customModelEnabled ? .on : .off
            if status.customModelEnabled { pendingModelId = nil }
        } else {
            ControlKit.setBadge(badge, text: "Status unavailable", tone: .warning)
            routeDetail.stringValue = Self.redact(failure ?? "SKS returned no readable answer.")
            issues.isHidden = true
            keyRow.isHidden = true
            jevNote.isHidden = true
        }
        renderModelPopup()
        updateControls()
    }

    private func renderModelPopup() {
        let current = status?.openRouterModel
        let entries = ImageGenerationPopup.entries(models: catalog?.models ?? [], currentId: current)
        modelPopup.removeAllItems()
        if entries.isEmpty {
            modelPopup.addItem(withTitle: modelsLoading ? "Loading image models…" : "No image models loaded")
        }
        for entry in entries {
            modelPopup.addItem(withTitle: entry.title)
            modelPopup.lastItem?.representedObject = entry.id
        }
        let preferred = ImageGenerationPopup.preferredId(
            entries: entries, pending: pendingModelId, current: current, catalogSelected: catalog?.selectedModelId
        )
        if let index = entries.firstIndex(where: { $0.id == preferred }) { modelPopup.selectItem(at: index) }
        renderModelDetail()
    }

    private func renderModelDetail() {
        guard let id = selectedModelId() else { return show(modelDetail, "") }
        if let model = catalog?.model(id: id) {
            show(modelDetail, model.capabilityLine)
        } else {
            show(modelDetail, catalog == nil ? "" : "\(id) is not in the current OpenRouter image model list.")
        }
    }

    /// Empty status lines leave the layout instead of reserving a blank row.
    private func show(_ field: NSTextField, _ text: String, color: NSColor? = nil) {
        field.stringValue = text
        if let color { field.textColor = color }
        field.isHidden = text.isEmpty
    }

    private func updateControls() {
        customToggle.isEnabled = !busy && statusLoaded
        refreshButton.isEnabled = !busy && !modelsLoading
        modelPopup.isEnabled = !busy && !modelsLoading && selectedModelId() != nil
        if busy || modelsLoading { spinner.startAnimation(nil) } else { spinner.stopAnimation(nil) }
    }

    @objc private func modelChanged() {
        guard !busy, let id = selectedModelId() else { return }
        renderModelDetail()
        guard status?.customModelEnabled == true else {
            pendingModelId = id
            let hint = id == status?.openRouterModel ? "" : "Turn on Custom image model to use \(displayName(id))."
            show(actionStatus, hint, color: .secondaryLabelColor)
            return
        }
        guard id != status?.openRouterModel else { return }
        enable(modelId: id)
    }

    @objc private func toggleCustomModel() {
        guard !busy else { return }
        guard customToggle.state == .on else {
            runMutation(
                ImageGenerationCommand.disable, kind: "imagegen-disable",
                summary: "Use Codex default image generation",
                busyMessage: "Returning to Codex's default image generation…"
            ) { succeeded, changed, detail in
                guard succeeded else { return "Could not turn off the custom image model · \(detail)" }
                return changed == false ? "The custom image model was already off." : "Image generation is back on Codex's default."
            }
            return
        }
        guard let id = selectedModelId() else {
            customToggle.state = .off
            show(actionStatus, ImageGenerationMessages.describe("imagegen_model_required"), color: .systemOrange)
            return
        }
        enable(modelId: id)
    }

    private func enable(modelId id: String) {
        guard ImageGenerationCommand.isAcceptableModelId(id) else {
            revertControls()
            show(actionStatus, "That model id cannot be passed to SKS. Choose another model.", color: .systemOrange)
            return
        }
        let name = displayName(id)
        runMutation(
            ImageGenerationCommand.enable(model: id), kind: "imagegen-enable",
            summary: "Use \(name) for image generation",
            busyMessage: "Switching image generation to \(name)…"
        ) { succeeded, changed, detail in
            guard succeeded else { return "Could not use \(name) · \(detail)" }
            return changed == false ? "Already using \(name)." : "Image generation now uses \(name) through the SKS Desktop Bridge."
        }
    }

    private func runMutation(
        _ arguments: [String],
        kind: String,
        summary: String,
        busyMessage: String,
        outcome: @escaping (_ succeeded: Bool, _ changed: Bool?, _ detail: String) -> String
    ) {
        guard let operation = operations.begin(kind: kind, mutationGroup: "imagegen", summary: summary) else {
            revertControls()
            show(actionStatus, "Another configuration change is running. Try again when it finishes.", color: .systemOrange)
            return
        }
        setBusy(true, message: busyMessage)
        _ = operations.update(operation, state: .running, stage: "applying", progress: nil, summary: summary)
        processClient.run(arguments, timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self else { return }
            let payload = ImageGenerationJSON.object(from: result.output)
            let receipt = ImageGenerationReceipt.decode(from: payload)
            let succeeded = ImageGenerationCommand.mutationSucceeded(code: result.code, payload: payload)
            let uncertain = !succeeded && (result.timedOut || result.truncated)
            let detail = Self.redact(receipt.primaryIssue ?? NativeView.redactPreview(result.output))
            let message = uncertain
                ? "SKS did not confirm the change · rechecking the saved setting."
                : outcome(succeeded, receipt.changed, detail)
            let state: OperationState = succeeded ? .succeeded : uncertain ? .terminalUncertain : .failed
            _ = self.operations.update(operation, state: state, stage: "complete", progress: 1, summary: message)
            self.setBusy(false, message: message, failed: !succeeded)
        }
    }

    private func setBusy(_ value: Bool, message: String, failed: Bool = false) {
        busy = value
        show(actionStatus, message, color: value ? .secondaryLabelColor : (failed ? .systemOrange : .labelColor))
        // Status reads that started before a change must not render over it.
        if value { generation += 1 }
        updateControls()
        if !value { refreshStatus() }
    }

    private func revertControls() {
        customToggle.state = status?.customModelEnabled == true ? .on : .off
        renderModelPopup()
    }

    private func selectedModelId() -> String? { modelPopup.selectedItem?.representedObject as? String }
    private func displayName(_ id: String) -> String { catalog?.model(id: id)?.name ?? id }
    private static func redact(_ value: String) -> String { ProviderSecretRedactor.redact(value) }

    private static func tone(_ tone: ImageGenerationTone) -> ControlKitTone {
        switch tone {
        case .ready: return .ok
        case .neutral: return .neutral
        case .attention: return .warning
        }
    }

    private static func formatTimestamp(_ value: String) -> String {
        guard let date = SKSTimestamp.date(from: value) else { return value }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
