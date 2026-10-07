import Cocoa

/// Connection-specific subagent lists for OpenRouter Only, Codex-LB and OAuth.
/// A configured list controls child models; Jev reads each row's criteria. The page
/// edits a local draft and Apply sends the complete list on stdin to
/// `sks bridge subagent-models set`. The CLI owns validation and routing.
final class SubagentModelsViewController: NSViewController, ControlCenterPage, NSTextFieldDelegate {
    private let processClient: ProcessClient
    private let operations: OperationCoordinator
    private let badge = ControlKit.badge("Checking…", tone: .neutral)
    private let modeDetail = NativeView.detail("Checking the current connection…")
    private let modeIssues = NativeView.detail("")
    private let hint = NativeView.detail("Turn on OpenRouter Only on the Connections page to edit this list.")
    private let rowsStack = NSStackView()
    private let listStatus = NativeView.detail("")
    private let actionStatus = NativeView.detail("")
    private let spinner = NativeView.spinner(label: "Subagent model command in progress")
    private var hintRow: NSStackView!
    private var addButton: NSButton!
    private var applyButton: NSButton!
    private var revertButton: NSButton!
    private var refreshButton: NSButton!
    private var snapshot: SubagentModelsSnapshot?
    private var available: [SubagentModelOption] = []
    private var saved: [SubagentModelEntry] = []
    private var draft: [SubagentModelEntry] = []
    private var busy = false
    private var loading = false
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
        let connectionsButton = NativeView.button("Connections…", target: self, action: #selector(openConnections))
        connectionsButton.setAccessibilityIdentifier("sks-subagent-models-connections")
        addButton = NativeView.button("Add Model", target: self, action: #selector(addModel))
        addButton.setAccessibilityIdentifier("sks-subagent-models-add")
        applyButton = ControlKit.primaryButton("Apply", target: self, action: #selector(applyList))
        applyButton.setAccessibilityLabel("Apply subagent model list")
        applyButton.setAccessibilityIdentifier("sks-subagent-models-apply")
        revertButton = NativeView.button("Revert", target: self, action: #selector(revertDraft))
        revertButton.setAccessibilityIdentifier("sks-subagent-models-revert")
        refreshButton = NativeView.button("Refresh", target: self, action: #selector(reload))
        refreshButton.setAccessibilityIdentifier("sks-subagent-models-refresh")
        rowsStack.orientation = .vertical
        rowsStack.alignment = .width
        rowsStack.spacing = 14
        rowsStack.setAccessibilityIdentifier("sks-subagent-models-rows")
        badge.setAccessibilityIdentifier("sks-subagent-models-badge")
        modeDetail.setAccessibilityIdentifier("sks-subagent-models-mode")
        modeIssues.setAccessibilityIdentifier("sks-subagent-models-issues")
        listStatus.setAccessibilityIdentifier("sks-subagent-models-list-status")
        actionStatus.setAccessibilityIdentifier("sks-subagent-models-action-status")
        modeIssues.isHidden = true
        actionStatus.isHidden = true
        hintRow = NativeView.row([hint, connectionsButton])
        hintRow.isHidden = true
        let modeCard = NativeView.card(title: "Connection", subtitle: "", views: [badge, modeDetail, modeIssues, hintRow])
        let listCard = NativeView.card(
            title: "Subagent model list",
            subtitle: "Save a separate list for each connection. Add the same model at different efforts with separate criteria. With Jev on, Jev chooses a model and effort together; otherwise a listed requested option or the default is used.",
            views: [rowsStack, listStatus, ControlKit.actionRow([addButton, applyButton, spinner], trailing: [revertButton, refreshButton]), actionStatus]
        )
        view = NativeView.page([
            ControlKit.header("Subagent Models", "Choose the models subagents may run on the current connection and when Jev should pick each one."),
            modeCard, listCard
        ])
        renderRows()
        updateControls()
    }

    func refreshOnAppear() { reload() }

    @objc private func openConnections() { openSection?("Providers") }

    @objc private func reload() {
        guard !busy else { return }
        generation += 1
        let requestGeneration = generation
        loading = true
        updateControls()
        processClient.run(OpenRouterOnlyCommand.listSubagentModels, timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self, requestGeneration == self.generation, !self.busy else { return }
            self.loading = false
            let payload = OpenRouterOnlyJSON.object(from: result.output)
            guard !result.timedOut, !result.truncated, let payload, let snapshot = SubagentModelsSnapshot.decode(payload) else {
                self.renderUnavailable(OpenRouterOnlyJSON.unavailableReason(code: result.code, output: result.output, payload: payload))
                return
            }
            self.accept(snapshot)
        }
    }

    /// A newer saved list replaces the draft unless the draft holds unapplied edits.
    private func accept(_ snapshot: SubagentModelsSnapshot) {
        let dirty = SubagentModelDraft.isDirty(draft: draft, saved: saved)
        let sameProfile = self.snapshot?.profile == snapshot.profile
        self.snapshot = snapshot
        if let rows = snapshot.available { available = rows } else if !sameProfile { available = [] }
        saved = restoringCriteria(snapshot.models, known: sameProfile ? saved + draft : [])
        if !(dirty && sameProfile && snapshot.editable) { draft = saved }
        renderMode(snapshot)
        renderRows()
        updateControls()
    }

    /// CLI answers arrive through ProcessClient's secret redaction; the page's own drafts do not.
    private func restoringCriteria(_ incoming: [SubagentModelEntry], known: [SubagentModelEntry]) -> [SubagentModelEntry] {
        SubagentModelDraft.restoringCriteria(incoming, known: known) { [processClient] in processClient.redact($0) }
    }

    private func renderUnavailable(_ reason: String) {
        snapshot = nil
        ControlKit.setBadge(badge, text: "Status unavailable", tone: .warning)
        modeDetail.stringValue = ProviderSecretRedactor.redact(reason)
        modeIssues.isHidden = true
        hintRow.isHidden = true
        renderRows()
        updateControls()
    }

    private func renderMode(_ snapshot: SubagentModelsSnapshot) {
        if let settings = snapshot.settings, settings.profile != "openrouter_only" {
            let unavailable = settings.error != nil || settings.models.contains { $0.routable == false }
            ControlKit.setBadge(badge, text: settings.title + (settings.configured ? " · custom list" : " · automatic tiers"), tone: unavailable ? .warning : .ok)
            modeDetail.stringValue = "This list applies to new subagents using \(settings.title). An empty list restores automatic tier selection. Lists for other connections are kept."
            let issues = ([settings.error].compactMap { $0 } + settings.warnings).map(OpenRouterOnlyMessages.describe)
                + settings.models.filter { $0.routable == false }.map { "\($0.model) is unavailable with its saved effort. Choose a current model and supported effort." }
            modeIssues.stringValue = ProviderSecretRedactor.redact(issues.joined(separator: "\n"))
            modeIssues.textColor = .systemOrange
            modeIssues.isHidden = issues.isEmpty
            hintRow.isHidden = true
            return
        }
        let mode = snapshot.mode
        let badgeText = mode.state == "active" ? "OpenRouter Only is on"
            : mode.state == "unavailable" ? "OpenRouter Only is on · unavailable" : "OpenRouter Only is off"
        ControlKit.setBadge(badge, text: badgeText, tone: mode.state == "active" ? .ok : mode.state == "unavailable" ? .warning : .neutral)
        modeDetail.stringValue = ProviderSecretRedactor.redact(([mode.message] + [mode.modelSummary].compactMap { $0 }).joined(separator: "\n"))
        var issues: [String] = []
        if !mode.unroutableModels.isEmpty {
            issues.append("Not routable yet: \(mode.unroutableModels.joined(separator: ", ")). Apply the list again or refresh the combined catalog on the Connections page.")
        }
        issues += mode.warningMessages
        modeIssues.stringValue = ProviderSecretRedactor.redact(issues.joined(separator: "\n"))
        modeIssues.textColor = .systemOrange
        modeIssues.isHidden = issues.isEmpty
        hintRow.isHidden = mode.enabled
    }

    private var editable: Bool { snapshot?.editable == true && !busy }

    private func renderRows() {
        rowsStack.arrangedSubviews.forEach { rowsStack.removeArrangedSubview($0); $0.removeFromSuperview() }
        if draft.isEmpty {
            let text = snapshot == nil ? "The subagent model list has not loaded."
                : snapshot?.editable == true ? "No subagent models yet. Choose Add Model, then Apply."
                : "No subagent models yet. Turning OpenRouter Only on fills this list from the OpenRouter models selected for the Codex picker."
            addRow(NativeView.detail(text))
            return
        }
        let options = SubagentModelDraft.popupOptions(available: available, entries: draft)
        for (index, entry) in draft.enumerated() { addRow(makeRow(entry, index: index, options: options)) }
    }

    private func addRow(_ row: NSView) {
        rowsStack.addArrangedSubview(row)
        row.widthAnchor.constraint(equalTo: rowsStack.widthAnchor).isActive = true
    }

    private func makeRow(_ entry: SubagentModelEntry, index: Int, options: [SubagentModelOption]) -> NSView {
        let number = index + 1
        let radio = NSButton(radioButtonWithTitle: "Default", target: self, action: #selector(defaultChanged(_:)))
        radio.state = entry.isDefault ? .on : .off
        radio.setAccessibilityLabel("Use model \(number) as the default subagent model")
        radio.setAccessibilityIdentifier("sks-subagent-models-default-\(index)")
        let modelPopup = NSPopUpButton()
        for option in options {
            modelPopup.addItem(withTitle: option.menuTitle)
            modelPopup.lastItem?.representedObject = option.publicId
        }
        if let selected = options.firstIndex(where: { $0.publicId.lowercased() == entry.model.lowercased() }) { modelPopup.selectItem(at: selected) }
        modelPopup.target = self
        modelPopup.action = #selector(modelChanged(_:))
        modelPopup.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        modelPopup.setAccessibilityLabel("Subagent model \(number)")
        modelPopup.setAccessibilityIdentifier("sks-subagent-models-model-\(index)")
        let effortPopup = NSPopUpButton()
        effortPopup.addItems(withTitles: SubagentModelDraft.effortTitles(for: entry, available: available, profile: snapshot?.profile ?? "openrouter_only"))
        effortPopup.selectItem(withTitle: entry.reasoningEffort ?? SubagentModelDraft.effortTitles[0])
        effortPopup.target = self
        effortPopup.action = #selector(effortChanged(_:))
        effortPopup.setAccessibilityLabel("Reasoning effort for subagent model \(number)")
        effortPopup.setAccessibilityIdentifier("sks-subagent-models-effort-\(index)")
        let remove = NativeView.button("Remove", target: self, action: #selector(removeRow(_:)))
        remove.setAccessibilityLabel("Remove subagent model \(number)")
        remove.setAccessibilityIdentifier("sks-subagent-models-remove-\(index)")
        let criteria = NSTextField(string: entry.criteria)
        criteria.placeholderString = "When should Jev choose this model? For example: large refactors, UI work, quick lookups"
        criteria.delegate = self
        criteria.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        criteria.setAccessibilityLabel("Criteria for subagent model \(number), up to \(SubagentModelRules.maxCriteriaCharacters) characters")
        criteria.setAccessibilityIdentifier("sks-subagent-models-criteria-\(index)")
        let controls: [NSControl] = [radio, modelPopup, effortPopup, remove, criteria]
        for control in controls {
            control.tag = index
            control.isEnabled = editable
        }
        // The model popup takes the free width; the other controls keep their size.
        for fixed in [radio, effortPopup, remove] { fixed.setContentHuggingPriority(.defaultHigh, for: .horizontal) }
        modelPopup.setContentHuggingPriority(NSLayoutConstraint.Priority(1), for: .horizontal)
        let line = NativeView.row([radio, modelPopup, effortPopup, remove])
        line.distribution = .fill
        var views: [NSView] = [line, criteria]
        if entry.criteriaUnreadable {
            let note = NativeView.detail("Part of these criteria looks like a secret, so SKS output hid it. Type the criteria again before applying.")
            note.textColor = .systemOrange
            note.setAccessibilityIdentifier("sks-subagent-models-criteria-unreadable-\(index)")
            views.append(note)
        }
        let savedRow = saved.first { $0.model.lowercased() == entry.model.lowercased() }
        if savedRow?.routable == false {
            let note = NativeView.detail("Not routable yet · the bridge has no OpenRouter route for this model.")
            note.textColor = .systemOrange
            views.append(note)
        } else if savedRow == nil, snapshot?.mode.enabled == true {
            views.append(NativeView.detail("Not applied yet · choose Apply to make this model available to subagents."))
        }
        let row = NSStackView(views: views)
        row.orientation = .vertical
        row.alignment = .leading
        row.spacing = 6
        for part in views { part.widthAnchor.constraint(equalTo: row.widthAnchor).isActive = true }
        row.setAccessibilityRole(.group)
        row.setAccessibilityLabel("Subagent model \(number): \(entry.model)")
        row.setAccessibilityIdentifier("sks-subagent-models-row-\(index)")
        return row
    }

    private func updateControls() {
        let dirty = SubagentModelDraft.isDirty(draft: draft, saved: saved)
        addButton.isEnabled = editable && SubagentModelDraft.adding(draft, available: available) != nil
        applyButton.isEnabled = editable && dirty
        revertButton.isEnabled = !busy && dirty
        refreshButton.isEnabled = !busy
        if busy || loading { spinner.startAnimation(nil) } else { spinner.stopAnimation(nil) }
        guard snapshot != nil else { return show(listStatus, "") }
        var parts = ["\(draft.count) of \(SubagentModelRules.maxModels) options"]
        if let preferred = draft.first(where: \.isDefault) { parts.append("default \(preferred.model) [\(preferred.reasoningEffort ?? "Default")]") }
        if dirty { parts.append("unapplied changes") }
        if editable, available.isEmpty {
            parts.append(snapshot?.profile == "openrouter_only"
                ? "no OpenRouter models are in the bridge catalog yet; select some under Models in Codex on the Connections page"
                : "no models are available for this connection; open Codex and refresh the catalog")
        } else if editable, draft.count < SubagentModelRules.maxModels, SubagentModelDraft.adding(draft, available: available) == nil {
            parts.append("every available model and effort is already on the list")
        }
        show(listStatus, parts.joined(separator: " · "), color: dirty ? .systemOrange : .secondaryLabelColor)
    }

    // MARK: Draft edits

    func controlTextDidChange(_ notification: Notification) {
        guard let field = notification.object as? NSTextField, draft.indices.contains(field.tag), editable else { return }
        let limited = SubagentModelDraft.limitCriteria(field.stringValue)
        if limited != field.stringValue { field.stringValue = limited }
        draft[field.tag].criteria = limited
        updateControls()
    }

    @objc private func modelChanged(_ sender: NSPopUpButton) {
        guard editable, draft.indices.contains(sender.tag), let id = sender.selectedItem?.representedObject as? String else { return }
        draft[sender.tag].model = id
        draft[sender.tag].routable = nil
        renderRows()
        updateControls()
    }

    @objc private func effortChanged(_ sender: NSPopUpButton) {
        guard editable, draft.indices.contains(sender.tag) else { return }
        draft[sender.tag].reasoningEffort = SubagentModelDraft.effort(title: sender.titleOfSelectedItem)
        updateControls()
    }

    @objc private func defaultChanged(_ sender: NSButton) {
        guard editable else { return renderRows() }
        draft = SubagentModelDraft.settingDefault(draft, at: sender.tag)
        renderRows()
        updateControls()
    }

    @objc private func removeRow(_ sender: NSButton) {
        guard editable else { return }
        draft = SubagentModelDraft.removing(draft, at: sender.tag)
        renderRows()
        updateControls()
    }

    @objc private func addModel() {
        guard editable, let next = SubagentModelDraft.adding(draft, available: available) else { return }
        draft = next
        renderRows()
        updateControls()
    }

    @objc private func revertDraft() {
        guard !busy else { return }
        draft = saved
        show(actionStatus, "")
        renderRows()
        updateControls()
    }

    // MARK: Apply

    @objc private func applyList() {
        guard editable else { return }
        let issues = SubagentModelDraft.issues(draft, profile: snapshot?.profile ?? "openrouter_only", available: available)
        guard issues.isEmpty else {
            return show(actionStatus, issues.map(OpenRouterOnlyMessages.describe).joined(separator: "\n"), color: .systemOrange)
        }
        let submittedProfile = snapshot?.boundProfile
        guard let stdin = SubagentModelDraft.stdinPayload(draft, profile: submittedProfile) else {
            return show(actionStatus, "The list could not be prepared for SKS. Nothing was sent.", color: .systemOrange)
        }
        let summary = "Apply subagent model list"
        guard let operation = operations.begin(kind: "bridge-subagent-models", mutationGroup: "codex-config", summary: summary) else {
            return show(actionStatus, "Another configuration change is running. Try again when it finishes.", color: .systemOrange)
        }
        let submitted = SubagentModelDraft.normalizedForSubmit(draft)
        setBusy(true, message: "Saving this connection's subagent model list…")
        _ = operations.update(operation, state: .running, stage: "applying", progress: nil, summary: summary)
        processClient.run(OpenRouterOnlyCommand.setSubagentModels, stdin: stdin, timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self else { return }
            let payload = OpenRouterOnlyJSON.object(from: result.output)
            let receipt = OpenRouterOnlyReceipt.decode(payload)
            let answer = payload.flatMap { SubagentModelsSnapshot.decode($0) }
            let sameProfile = answer?.boundProfile == submittedProfile
            let answerRows = answer.map { self.restoringCriteria($0.models, known: sameProfile ? submitted : []) }
            let complete = !result.timedOut && !result.truncated
            let stored = sameProfile && (answerRows.map { !SubagentModelDraft.isDirty(draft: submitted, saved: $0) } ?? false)
            let succeeded = complete && result.code == 0 && receipt.ok && receipt.blockers.isEmpty && stored
            let resultWarnings = OpenRouterOnlyJSON.strings((payload?["result"] as? [String: Any])?["warnings"])
            let relaunch = resultWarnings.contains("codex_relaunch_required_for_new_subagent_models")
                ? " Quit and reopen Codex so new subagents can use the added models." : ""
            let issue = ProviderSecretRedactor.redact(receipt.primaryIssue ?? NativeView.redactPreview(result.output))
            let message: String
            if succeeded {
                if submitted.isEmpty, let profile = submittedProfile, profile != "openrouter_only" {
                    message = "Subagent model list cleared · automatic tier selection restored."
                } else {
                    message = "Subagent model list saved · \(submitted.count) model\(submitted.count == 1 ? "" : "s")." + (relaunch.isEmpty ? " New subagents use it now." : relaunch)
                }
            } else if !complete {
                message = "SKS did not confirm the change · rechecking the saved list."
            } else if stored {
                message = "List saved, but route setup needs attention · \(issue)"
            } else {
                message = "List not saved · \(issue)"
            }
            let state: OperationState = succeeded ? .succeeded : complete ? .failed : .terminalUncertain
            _ = self.operations.update(operation, state: state, stage: "complete", progress: 1, summary: message)
            if let answerRows, stored {
                self.saved = answerRows
                self.draft = answerRows
            }
            self.setBusy(false, message: message, failed: !succeeded)
        }
    }

    private func setBusy(_ value: Bool, message: String, failed: Bool = false) {
        busy = value
        show(actionStatus, message, color: value ? .secondaryLabelColor : (failed ? .systemOrange : .labelColor))
        // Reads that started before a change must not render over it.
        if value { generation += 1 }
        renderRows()
        updateControls()
        if !value { reload() }
    }

    /// Empty status lines leave the layout instead of reserving a blank row.
    private func show(_ field: NSTextField, _ text: String, color: NSColor? = nil) {
        field.stringValue = text
        if let color { field.textColor = color }
        field.isHidden = text.isEmpty
    }
}
