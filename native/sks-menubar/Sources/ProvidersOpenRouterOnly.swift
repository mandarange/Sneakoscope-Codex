import Cocoa

/// "OpenRouter Only" routing mode in the Default connection card. It sits next
/// to "Prefer Codex-LB": the CLI turns one off when the other turns on, so
/// both switches lock while either changes and both re-read afterwards. The
/// OpenRouter profile itself stays a coexisting account under Accounts.
extension ProvidersViewController {
    var routingModeBusy: Bool { authPriorityBusy || openRouterOnlyBusy }

    func makeOpenRouterOnlyRows() -> [NSView] {
        openRouterOnlyToggle.target = self
        openRouterOnlyToggle.action = #selector(toggleOpenRouterOnly)
        openRouterOnlyToggle.isEnabled = false
        openRouterOnlyToggle.setAccessibilityLabel("OpenRouter Only")
        openRouterOnlyToggle.setAccessibilityIdentifier("sks-provider-openrouter-only-toggle")
        openRouterOnlyStatus.setAccessibilityIdentifier("sks-provider-openrouter-only-status")
        openRouterOnlyDetail.setAccessibilityIdentifier("sks-provider-openrouter-only-detail")
        openRouterOnlyDetail.isHidden = true
        return [
            NativeView.row([openRouterOnlyToggle, NativeView.sectionTitle("OpenRouter Only")]),
            openRouterOnlyStatus, openRouterOnlyDetail,
            NativeView.detail("Run Codex and every subagent on OpenRouter models. Subagents may use only the models on the Subagent Models page. Turning this on turns Prefer Codex-LB off; turning Prefer Codex-LB on turns this off.")
        ]
    }

    /// Both switches stay locked while either mode changes or a page-wide operation runs.
    func updateRoutingModeSwitches() {
        authPriorityToggle.isEnabled = !busy && !routingModeBusy && authPriorityEnabled != nil
        openRouterOnlyToggle.isEnabled = !busy && !routingModeBusy && openRouterOnlyEnabled != nil
    }

    /// Reads that started before a mode change must not render over it.
    func beginRoutingModeMutation() {
        authPriorityGeneration += 1
        openRouterOnlyGeneration += 1
        updateRoutingModeSwitches()
    }

    /// The two modes exclude each other, so a change to either re-reads both,
    /// and the catalog, routes and picker exposure it rebuilt.
    func rereadRoutingModes(authPriorityNotice: String?, openRouterOnlyNotice: String?) {
        refreshAuthPriority(notice: authPriorityNotice)
        refreshOpenRouterOnly(notice: openRouterOnlyNotice)
        refreshBridgeStatus()
        refreshModelExposure()
    }

    /// Either mode's answer also carries the other mode. Showing it at once
    /// keeps the other switch from offering its pre-change state while the
    /// re-reads run; without it that switch stays locked until they land.
    func renderAuthPriority(from payload: [String: Any]?, responseComplete: Bool) {
        if responseComplete, let payload = payload, let state = AuthPriorityState.decode(payload) {
            renderAuthPriority(state)
        } else {
            authPriorityEnabled = nil
            updateRoutingModeSwitches()
        }
    }

    func renderOpenRouterOnly(from payload: [String: Any]?, responseComplete: Bool) {
        if responseComplete, let payload = payload, let state = OpenRouterOnlyState.decode(payload) {
            renderOpenRouterOnly(state)
        } else {
            openRouterOnlyEnabled = nil
            updateRoutingModeSwitches()
        }
    }

    func refreshOpenRouterOnly(notice: String? = nil) {
        guard !routingModeBusy else { return }
        openRouterOnlyGeneration += 1
        let generation = openRouterOnlyGeneration
        processClient.run(OpenRouterOnlyCommand.status, timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self = self, !self.routingModeBusy, generation == self.openRouterOnlyGeneration else { return }
            let payload = OpenRouterOnlyJSON.object(from: result.output)
            guard !result.timedOut, !result.truncated, let payload = payload, let state = OpenRouterOnlyState.decode(payload) else {
                self.openRouterOnlyEnabled = nil
                self.openRouterOnlyToggle.isHidden = true
                self.openRouterOnlyDetail.isHidden = true
                let reason = OpenRouterOnlyJSON.unavailableReason(code: result.code, output: result.output, payload: payload)
                self.openRouterOnlyStatus.stringValue = "OpenRouter Only could not be confirmed · \(ProviderSecretRedactor.redact(reason))"
                self.openRouterOnlyStatus.textColor = .systemOrange
                self.updateRoutingModeSwitches()
                return
            }
            self.renderOpenRouterOnly(state)
            if let notice = notice {
                self.openRouterOnlyStatus.stringValue += "\n" + notice
                self.openRouterOnlyStatus.textColor = .systemOrange
            }
        }
    }

    func renderOpenRouterOnly(_ state: OpenRouterOnlyState) {
        openRouterOnlyEnabled = state.enabled
        openRouterOnlyToggle.isHidden = false
        openRouterOnlyToggle.state = state.enabled ? .on : .off
        openRouterOnlyStatus.stringValue = ProviderSecretRedactor.redact(state.message)
        openRouterOnlyStatus.textColor = state.state == "active" ? .systemGreen : state.state == "unavailable" ? .systemOrange : .secondaryLabelColor
        var lines = [state.modelSummary].compactMap { $0 }
        if !state.unroutableModels.isEmpty {
            lines.append("Not routable yet: \(state.unroutableModels.joined(separator: ", ")). Refresh the combined catalog, or apply the list again on the Subagent Models page.")
        }
        lines += state.warningMessages
        openRouterOnlyDetail.stringValue = ProviderSecretRedactor.redact(lines.joined(separator: "\n"))
        openRouterOnlyDetail.isHidden = lines.isEmpty
        updateRoutingModeSwitches()
    }

    @objc func toggleOpenRouterOnly() {
        guard !routingModeBusy, let previous = openRouterOnlyEnabled else {
            openRouterOnlyToggle.state = openRouterOnlyEnabled == true ? .on : .off
            return
        }
        let desired = openRouterOnlyToggle.state == .on
        let summary = desired ? "Turn OpenRouter Only on" : "Turn OpenRouter Only off"
        guard let operation = operations.begin(kind: "bridge-openrouter-only", mutationGroup: "codex-config", summary: summary) else {
            openRouterOnlyToggle.state = previous ? .on : .off
            openRouterOnlyStatus.stringValue = "Another configuration change is running. Try again when it finishes."
            return
        }
        openRouterOnlyBusy = true
        beginRoutingModeMutation()
        openRouterOnlyStatus.stringValue = desired
            ? "Turning OpenRouter Only on · updating the Codex model list and bridge routes…"
            : "Turning OpenRouter Only off · restoring the Codex model list…"
        openRouterOnlyStatus.textColor = .secondaryLabelColor
        _ = operations.update(operation, state: .running, stage: "saving", progress: nil, summary: summary)
        processClient.run(OpenRouterOnlyCommand.set(enabled: desired), timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.openRouterOnlyBusy = false
            let payload = OpenRouterOnlyJSON.object(from: result.output)
            let complete = !result.truncated && !result.timedOut
            let outcome = OpenRouterOnlyMutationOutcome.resolve(
                payload: payload, desired: desired,
                commandSucceeded: result.code == 0 && payload?["ok"] as? Bool == true
                    && OpenRouterOnlyReceipt.decode(payload).blockers.isEmpty,
                responseComplete: complete
            )
            // Turning this mode on turned Prefer Codex-LB off in the same operation.
            self.renderAuthPriority(from: payload, responseComplete: complete)
            let issue = OpenRouterOnlyReceipt.decode(payload).primaryIssue.map(ProviderSecretRedactor.redact)
            let detail = outcome.succeeded ? nil : [outcome.operationSummary, issue].compactMap { $0 }.joined(separator: " · ")
            let operationState: OperationState = outcome.succeeded ? .succeeded : outcome == .unconfirmed ? .terminalUncertain : .failed
            _ = self.operations.update(operation, state: operationState, stage: "complete", progress: 1, summary: detail ?? outcome.operationSummary)
            if let state = outcome.observedState {
                self.renderOpenRouterOnly(state)
                if let detail = detail {
                    self.openRouterOnlyStatus.stringValue = detail + "\n" + state.message
                    self.openRouterOnlyStatus.textColor = .systemOrange
                }
            } else {
                self.openRouterOnlyEnabled = nil
                self.openRouterOnlyToggle.isHidden = true
                self.openRouterOnlyStatus.stringValue = "Operation result is uncertain. Checking the saved setting…"
                self.openRouterOnlyStatus.textColor = .systemOrange
                self.updateRoutingModeSwitches()
            }
            self.rereadRoutingModes(authPriorityNotice: nil, openRouterOnlyNotice: detail)
        }
    }
}
