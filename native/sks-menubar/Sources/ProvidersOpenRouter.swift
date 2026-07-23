import Cocoa

extension ProvidersViewController {
    func makeOpenRouterCard() -> NSBox {
        openRouterModelPopup.addItem(withTitle: "Choose from catalog…")
        openRouterModelPopup.target = self
        openRouterModelPopup.action = #selector(selectOpenRouterModel(_:))
        openRouterModelPopup.setAccessibilityLabel("OpenRouter model catalog")
        openRouterModelPopup.widthAnchor.constraint(greaterThanOrEqualToConstant: 250).isActive = true
        openRouterModelPopup.isEnabled = false

        let refreshModels = NativeView.button("Refresh Models", target: self, action: #selector(refreshOpenRouterModelsAction(_:)))
        openRouterRefreshButton = refreshModels
        let saveKey = NativeView.button("Save OpenRouter key…", target: self, action: #selector(saveOpenRouterKey))
        let test = NativeView.button("Test Connection", target: self, action: #selector(testOpenRouterConnection))
        let activate = NativeView.button("Activate Selected Model", target: self, action: #selector(useOpenRouter))
        activate.setAccessibilityLabel("Activate selected OpenRouter model and restart Codex App")
        actionButtons += [refreshModels, saveKey, test, activate]

        let catalogLabel = NSTextField(labelWithString: "Catalog")
        catalogLabel.setContentHuggingPriority(.required, for: .horizontal)
        let manualLabel = NSTextField(labelWithString: "Model ID")
        manualLabel.setContentHuggingPriority(.required, for: .horizontal)
        return NativeView.card(
            title: "OpenRouter",
            subtitle: "Saving the key prepares OpenRouter but does not switch providers. Choose a catalog model or enter any valid provider/model id, test it, then activate it.",
            views: [
                openRouterCredentialStatus,
                openRouterActiveStatus,
                NativeView.row([catalogLabel, openRouterModelPopup, refreshModels]),
                openRouterCatalogStatus,
                NativeView.row([manualLabel, openRouterModelField]),
                NativeView.row([saveKey, test, activate]),
                openRouterStatus
            ]
        )
    }

    func makeRoleModelsCard() -> NSBox {
        let definitions = [
            ("ui_implementer", "UI implementation"),
            ("native_app_specialist", "Native app"),
            ("implementation_specialist", "Implementation"),
            ("test_engineer", "Testing")
        ]
        var views: [NSView] = [roleStatus]
        for (role, title) in definitions {
            let controls = RoleModelControls(role: role, target: self)
            controls.model.addItem(withTitle: "Loading profiles…")
            controls.model.setAccessibilityLabel("\(title) model")
            controls.model.widthAnchor.constraint(greaterThanOrEqualToConstant: 210).isActive = true
            controls.model.identifier = NSUserInterfaceItemIdentifier(role)
            controls.model.target = self
            controls.model.action = #selector(roleModelSelectionChanged(_:))
            controls.reasoning.addItem(withTitle: "Loading…")
            controls.reasoning.setAccessibilityLabel("\(title) reasoning effort")
            controls.current.setAccessibilityLabel("\(title) current and effective model")
            controls.save.setAccessibilityLabel("Save \(title) model override")
            controls.reset.setAccessibilityLabel("Reset \(title) model override")
            controls.model.isEnabled = false
            controls.reasoning.isEnabled = false
            controls.save.isEnabled = false
            controls.reset.isEnabled = false
            roleRows[role] = controls
            actionButtons += [controls.save, controls.reset]

            let heading = NativeView.sectionTitle(title)
            let roleId = NativeView.detail(role)
            let modelLabel = NSTextField(labelWithString: "Model")
            let reasoningLabel = NSTextField(labelWithString: "Reasoning")
            views.append(NativeView.row([heading, roleId]))
            views.append(controls.current)
            views.append(NativeView.row([modelLabel, controls.model, reasoningLabel, controls.reasoning]))
            views.append(NativeView.row([controls.save, controls.reset]))
            if role != definitions.last?.0 {
                let separator = NSBox()
                separator.boxType = .separator
                views.append(separator)
            }
        }
        let refresh = NativeView.button("Refresh Role Settings", target: self, action: #selector(refreshRoleModelsAction(_:)))
        roleRefreshButton = refresh
        actionButtons.append(refresh)
        views.append(refresh)
        return NativeView.card(
            title: "Models by Work Type",
            subtitle: "Overrides apply only to the selected agent role; Reset restores its effective default. With the Multi-Provider Router selected, v1-compatible catalog slugs such as provider/model let different roles use different upstream providers.",
            views: views
        )
    }

    func refreshOpenRouterStatus() {
        processClient.run(["codex-app", "openrouter-status", "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self = self else { return }
            guard let json = self.json(result.output) else {
                if !self.busy {
                    self.openRouterCredentialStatus.stringValue = "Credential: status unavailable — no saved key was assumed."
                    self.openRouterActiveStatus.stringValue = "Active provider: status unavailable — no active provider was assumed."
                }
                return
            }
            let keyPresent = json["key_present"] as? Bool == true
            let providerPresent = json["provider_present"] as? Bool == true
            let selected = json["selected"] as? Bool == true
            let activeModel = json["model"] as? String ?? "unset"
            let current = self.openRouterModelField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if selected, activeModel != "unset", current.isEmpty || current == "z-ai/glm-5.2" {
                self.openRouterModelField.stringValue = activeModel
            }
            self.openRouterCredentialStatus.stringValue = keyPresent
                ? "Credential: saved securely\(providerPresent ? " · provider block ready" : " · provider setup needs repair")"
                : "Credential: missing · save a key before testing or activation"
            self.openRouterActiveStatus.stringValue = selected
                ? "Active provider: OpenRouter · main model \(activeModel)"
                : "Active provider: not OpenRouter · saved credentials remain available"
            if self.openRouterStatus.stringValue == "No OpenRouter action has run yet." {
                let summary = self.describeOpenRouterStatus(json)
                self.openRouterStatus.stringValue = result.code == 0
                    ? summary
                    : "\(summary) \(self.structuredPublicDetail(json, fallback: result.output))"
            }
            self.openRouterCredentialStatus.textColor = keyPresent ? .secondaryLabelColor : .systemOrange
            self.openRouterActiveStatus.textColor = selected ? .systemGreen : .secondaryLabelColor
        }
    }

    func describeOpenRouterStatus(_ json: [String: Any]) -> String {
        let keyPresent = json["key_present"] as? Bool == true
        let providerPresent = json["provider_present"] as? Bool == true
        let selected = json["selected"] as? Bool == true
        let activeModel = json["model"] as? String ?? "unset"
        if !keyPresent { return "OpenRouter: key missing. Next: save a key, refresh models, then test the model." }
        if !providerPresent { return "OpenRouter: provider missing. Next: save the key again to repair the provider block." }
        if selected { return "OpenRouter: active · main model \(activeModel). Next: test after changing models, or choose another provider to switch away." }
        return "OpenRouter: key stored · activation model \(selectedOpenRouterModel()) · not selected. Next: test, then activate the selected model."
    }

    @objc func refreshOpenRouterModelsAction(_ sender: NSButton) {
        refreshOpenRouterModels()
    }

    func refreshOpenRouterModels() {
        guard !catalogRefreshInFlight else { return }
        catalogRefreshInFlight = true
        openRouterRefreshButton?.isEnabled = false
        openRouterCatalogStatus.stringValue = "Loading OpenRouter model catalog…"
        processClient.run(["codex-app", "openrouter-models", "--ids-only", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.catalogRefreshInFlight = false
            self.openRouterRefreshButton?.isEnabled = !self.busy
            guard let json = self.json(result.output) else {
                self.openRouterCatalogStatus.stringValue = "Catalog unavailable · manual model id entry still works. Next: save the key or retry."
                return
            }
            guard result.code == 0, json["ok"] as? Bool == true else {
                self.openRouterCatalogStatus.stringValue = "Catalog unavailable · \(self.structuredPublicDetail(json, fallback: result.output)) Manual model id entry still works."
                return
            }
            let models = self.openRouterModelIds(json)
            guard !models.isEmpty else {
                self.openRouterCatalogStatus.stringValue = "Catalog returned no selectable models · manual model id entry still works."
                return
            }
            self.openRouterModels = models
            self.openRouterModelPopup.removeAllItems()
            self.openRouterModelPopup.addItem(withTitle: "Choose from \(models.count) models…")
            self.openRouterModelPopup.addItems(withTitles: models)
            self.openRouterModelPopup.selectItem(at: 0)
            self.openRouterModelPopup.isEnabled = !self.busy
            let authenticated = json["authenticated"] as? Bool == true
            self.openRouterCatalogStatus.stringValue = authenticated
                ? "Catalog ready · \(models.count) models · saved key authenticated. Selecting one copies its id into the editable field."
                : "Catalog ready · \(models.count) public models · saved key was not authenticated. Next: replace the key, then run Test Connection."
        }
    }

    private func openRouterModelIds(_ json: [String: Any]) -> [String] {
        let raw = (json["models"] as? [Any])
            ?? (json["data"] as? [Any])
            ?? ((json["catalog"] as? [String: Any])?["models"] as? [Any])
            ?? []
        let values = raw.compactMap { entry -> String? in
            if let value = entry as? String { return value }
            guard let row = entry as? [String: Any] else { return nil }
            return (row["id"] as? String) ?? (row["model"] as? String) ?? (row["slug"] as? String)
        }.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return Array(Set(values)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    @objc private func selectOpenRouterModel(_ sender: NSPopUpButton) {
        guard sender.indexOfSelectedItem > 0, let model = sender.titleOfSelectedItem else { return }
        openRouterModelField.stringValue = model
        openRouterStatus.stringValue = "Selected \(model) from the catalog. Next: test the connection; activation remains unchanged."
    }

    @objc func saveOpenRouterKey() {
        guard let window = view.window else { return }
        promptForSecretKey(
            window: window,
            sheetTitle: "OpenRouter API Key",
            sheetMessage: "Paste your OpenRouter API key. It is sent through stdin and never logged. Saving does not switch the active provider.",
            placeholder: "sk-or-…",
            args: ["codex-app", "set-openrouter-key", "--api-key-stdin", "--json"],
            kind: "openrouter-set-key",
            title: "Save OpenRouter key",
            statusLabel: openRouterStatus,
            successSummary: "OpenRouter key saved",
            failSummary: "OpenRouter key save failed"
        )
    }

    @objc private func testOpenRouterConnection() {
        let model = selectedOpenRouterModel()
        guard !model.isEmpty else {
            openRouterStatus.stringValue = "Connection test blocked · model id is empty. Next: choose or enter a model."
            return
        }
        guard !busy else { openRouterStatus.stringValue = "Another provider action is already running."; return }
        guard let snapshot = operations.begin(kind: "openrouter-test", mutationGroup: nil, summary: "Test OpenRouter model") else {
            openRouterStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        openRouterStatus.stringValue = "Testing OpenRouter with \(model)…"
        _ = operations.update(snapshot, state: .running, stage: "testing", progress: nil, summary: "Test OpenRouter model")
        processClient.run(["codex-app", "openrouter-test", "--model", model, "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.setBusy(false)
            let json = self.json(result.output)
            let ok = result.code == 0 && json?["ok"] as? Bool == true
            let status = json?["status"] as? String ?? (ok ? "connected" : "failed")
            let detail = self.structuredPublicDetail(json, fallback: result.output)
            _ = self.operations.update(snapshot, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: ok ? "OpenRouter connection ready" : "OpenRouter connection needs action")
            self.openRouterStatus.stringValue = ok
                ? "Connection test passed · \(model) · \(status). Next: activate it if you want it as the main model."
                : "Connection test failed · \(model) · \(status) · \(detail)"
            self.refreshOpenRouterStatus()
        }
    }

    @objc func useOpenRouter() {
        let model = selectedOpenRouterModel()
        guard !model.isEmpty else {
            openRouterStatus.stringValue = "Enter an OpenRouter model id, then click Activate Selected Model."
            return
        }
        guard !busy else { openRouterStatus.stringValue = "Another provider action is already running."; return }
        guard let snapshot = operations.begin(kind: "openrouter-use", mutationGroup: "codex-config", summary: "Use OpenRouter") else {
            openRouterStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        openRouterStatus.stringValue = "Activating OpenRouter main model \(model) and restarting Codex App…"
        _ = operations.update(snapshot, state: .running, stage: "activating", progress: nil, summary: "Use OpenRouter")
        processClient.run(["codex-app", "use-openrouter", "--model", model, "--restart-app", "--json"], timeout: NativeView.mutationTimeout) { [weak self] activation in
            guard let self = self else { return }
            _ = self.operations.update(snapshot, state: .running, stage: "verifying", progress: nil, summary: "Verify OpenRouter main model")
            self.processClient.run(["codex-app", "openrouter-status", "--json"], timeout: NativeView.statusTimeout) { [weak self] status in
                guard let self = self else { return }
                self.setBusy(false)
                let activationJson = self.json(activation.output)
                let statusJson = self.json(status.output)
                let selected = status.code == 0 && statusJson?["selected"] as? Bool == true
                let activeModel = statusJson?["model"] as? String
                let configApplied = activation.code == 0
                    && activationJson?["config_applied"] as? Bool == true
                    && selected
                    && activeModel == model
                let restartOK = activationJson?["restart_ok"] as? Bool == true
                let complete = configApplied && restartOK
                _ = self.operations.update(snapshot, state: complete ? .succeeded : .failed, stage: "complete", progress: 1, summary: complete ? "OpenRouter main model active" : configApplied ? "OpenRouter saved; restart required" : "OpenRouter activation needs action")
                if complete {
                    self.openRouterStatus.stringValue = "Activation complete · OpenRouter is active · main model \(model)."
                } else if configApplied {
                    self.openRouterStatus.stringValue = "Configuration saved · main model \(model) is selected, but Codex App did not restart. Next: reopen Codex App, then verify status."
                } else {
                    self.openRouterStatus.stringValue = "Activation incomplete · requested \(model), observed \(activeModel ?? "unknown") · \(self.structuredPublicDetail(activationJson, fallback: activation.output))"
                }
                self.refreshOpenRouterStatus()
            }
        }
    }

    private func selectedOpenRouterModel() -> String {
        openRouterModelField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func structuredPublicDetail(_ json: [String: Any]?, fallback: String) -> String {
        if let blockers = json?["blockers"] as? [String], !blockers.isEmpty {
            let error = publicError(json).map { " · \($0)" } ?? ""
            return "Reason: \(blockers.joined(separator: ", ").replacingOccurrences(of: "_", with: " "))\(error). Next: \((json?["hint"] as? String) ?? "review the key, model id, and network, then retry")."
        }
        if let error = publicError(json), !error.isEmpty { return "Reason: \(error). Next: review the key, model id, and network, then retry." }
        if let hint = json?["hint"] as? String, !hint.isEmpty { return "Next: \(hint)." }
        return "Next: \(NativeView.redactPreview(fallback))"
    }

    private func publicError(_ json: [String: Any]?) -> String? {
        if let value = json?["error"] as? String { return value }
        guard let value = json?["error"] as? [String: Any] else { return nil }
        let code = value["code"] as? String
        let message = value["message"] as? String
        return [code, message].compactMap { $0 }.joined(separator: ": ")
    }

    @objc func refreshRoleModelsAction(_ sender: NSButton) {
        refreshRoleModels()
    }

    func refreshRoleModels() {
        guard !roleRefreshInFlight else { return }
        roleRefreshInFlight = true
        roleRefreshButton?.isEnabled = false
        roleStatus.stringValue = "Loading role model settings…"
        processClient.run(["codex-app", "role-models", "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self = self else { return }
            self.roleRefreshInFlight = false
            self.roleRefreshButton?.isEnabled = !self.busy
            guard result.code == 0, let json = self.json(result.output) else {
                self.roleProfilesLoaded = false
                self.updateRoleControlAvailability()
                self.roleStatus.stringValue = "Role settings unavailable · existing configuration was not changed."
                return
            }
            self.configureSupportedRoleProfiles(json)
            var loaded = 0
            for (role, controls) in self.roleRows {
                guard let payload = self.rolePayload(json, role: role) else {
                    controls.current.stringValue = "Current: unavailable · Effective: unavailable"
                    continue
                }
                let configured = (payload["configured"] as? [String: Any]) ?? (payload["override"] as? [String: Any])
                let effective = (payload["effective"] as? [String: Any]) ?? payload
                let configuredModel = (configured?["model"] as? String) ?? (payload["configured_model"] as? String)
                let configuredReasoning = self.reasoningValue(configured) ?? (payload["configured_reasoning"] as? String)
                let configuredProvider = (configured?["provider"] as? String) ?? (payload["configured_provider"] as? String)
                let effectiveModel = (effective["model"] as? String) ?? (payload["effective_model"] as? String) ?? "unavailable"
                let effectiveProvider = (effective["provider"] as? String)
                    ?? (payload["effective_provider"] as? String)
                    ?? "unknown"
                let effectiveReasoning = self.reasoningValue(effective)
                    ?? (payload["effective_reasoning_effort"] as? String)
                    ?? (payload["effective_reasoning"] as? String)
                    ?? "unavailable"
                self.selectRoleProfile(model: configuredModel ?? effectiveModel, reasoning: configuredReasoning ?? effectiveReasoning, controls: controls)
                let current = configuredModel.map {
                    "\(self.roleModelDisplay(provider: configuredProvider ?? effectiveProvider, model: $0)) / \(configuredReasoning ?? "default")"
                } ?? "default (no override)"
                let effectiveDisplay = self.roleModelDisplay(provider: effectiveProvider, model: effectiveModel)
                controls.current.stringValue = "Current: \(current) · Effective: \(effectiveDisplay) / \(effectiveReasoning)"
                loaded += 1
            }
            self.roleProfilesLoaded = !self.supportedRoleProfiles.isEmpty
            self.updateRoleControlAvailability()
            self.roleStatus.stringValue = "Loaded \(loaded) of \(self.roleRows.count) role settings. Save creates an override; Reset removes it."
        }
    }

    func updateRoleControlAvailability() {
        let enabled = !busy && roleProfilesLoaded
        for controls in roleRows.values {
            controls.model.isEnabled = enabled
            controls.reasoning.isEnabled = enabled
            controls.save.isEnabled = enabled
            controls.reset.isEnabled = enabled
        }
    }

    private func configureSupportedRoleProfiles(_ json: [String: Any]) {
        let rows = json["supported_profiles"] as? [[String: Any]] ?? []
        supportedRoleProfiles = rows.compactMap { row in
            guard let model = row["model"] as? String,
                  let reasoning = row["reasoning_effort"] as? String,
                  !model.isEmpty, !reasoning.isEmpty else { return nil }
            return (model, reasoning)
        }
        let models = Array(Set(supportedRoleProfiles.map(\.model))).sorted()
        for controls in roleRows.values {
            controls.model.removeAllItems()
            controls.model.addItems(withTitles: models)
            controls.reasoning.removeAllItems()
        }
    }

    private func rolePayload(_ json: [String: Any], role: String) -> [String: Any]? {
        if let roles = json["roles"] as? [String: Any], let payload = roles[role] as? [String: Any] { return payload }
        if let payload = json[role] as? [String: Any] { return payload }
        if let roles = json["roles"] as? [[String: Any]] {
            return roles.first { ($0["role"] as? String) == role || ($0["id"] as? String) == role }
        }
        return nil
    }

    private func reasoningValue(_ json: [String: Any]?) -> String? {
        (json?["reasoning"] as? String) ?? (json?["reasoning_effort"] as? String) ?? (json?["model_reasoning_effort"] as? String)
    }

    private func roleModelDisplay(provider: String, model: String) -> String {
        model.contains("/") ? model : "\(provider):\(model)"
    }

    private func selectRoleProfile(model: String, reasoning: String, controls: RoleModelControls) {
        let selectedModel = controls.model.itemTitles.contains(model) ? model : (controls.model.itemTitles.first ?? "")
        controls.model.selectItem(withTitle: selectedModel)
        updateReasoningChoices(controls, preferred: reasoning)
    }

    @objc private func roleModelSelectionChanged(_ sender: NSPopUpButton) {
        guard let role = sender.identifier?.rawValue, let controls = roleRows[role] else { return }
        updateReasoningChoices(controls, preferred: nil)
    }

    private func updateReasoningChoices(_ controls: RoleModelControls, preferred: String?) {
        let model = controls.model.titleOfSelectedItem ?? ""
        let efforts = supportedRoleProfiles.filter { $0.model == model }.map(\.reasoning)
        controls.reasoning.removeAllItems()
        controls.reasoning.addItems(withTitles: efforts)
        if let preferred = preferred, efforts.contains(preferred) { controls.reasoning.selectItem(withTitle: preferred) }
    }

    @objc func saveRoleModel(_ sender: NSButton) {
        guard let role = sender.identifier?.rawValue, let controls = roleRows[role] else { return }
        let model = controls.model.titleOfSelectedItem ?? ""
        let reasoning = controls.reasoning.titleOfSelectedItem ?? "medium"
        guard !model.isEmpty else { roleStatus.stringValue = "Save blocked for \(role) · enter a model id."; return }
        runRoleMutation(
            ["codex-app", "set-role-model", "--role", role, "--model", model, "--reasoning", reasoning, "--json"],
            role: role,
            kind: "role-model-set",
            running: "Saving \(role) override…",
            success: "Saved \(role) · \(model) / \(reasoning). Next: new tasks for this role use the effective override."
        )
    }

    @objc func resetRoleModel(_ sender: NSButton) {
        guard let role = sender.identifier?.rawValue else { return }
        runRoleMutation(
            ["codex-app", "reset-role-model", "--role", role, "--json"],
            role: role,
            kind: "role-model-reset",
            running: "Resetting \(role) override…",
            success: "Reset \(role). Next: new tasks use the effective default shown below."
        )
    }

    private func runRoleMutation(_ args: [String], role: String, kind: String, running: String, success: String) {
        guard !busy else { roleStatus.stringValue = "Another provider action is already running."; return }
        guard let snapshot = operations.begin(kind: kind, mutationGroup: "codex-config", summary: running) else {
            roleStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        roleStatus.stringValue = running
        _ = operations.update(snapshot, state: .running, stage: "saving", progress: nil, summary: running)
        processClient.run(args, timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.setBusy(false)
            let json = self.json(result.output)
            let ok = result.code == 0 && json?["ok"] as? Bool == true
            _ = self.operations.update(snapshot, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: ok ? "Role model setting saved" : "Role model setting needs action")
            self.roleStatus.stringValue = ok ? success : "\(role) change failed · \(self.structuredPublicDetail(json, fallback: result.output))"
            self.refreshRoleModels()
        }
    }
}
