import Cocoa

extension ProvidersViewController {
    func refreshOpenRouterStatus() {
        processClient.run(["codex-app", "openrouter-status", "--json"], timeout: NativeView.statusTimeout) { [weak self] result in
            guard let self = self else { return }
            guard result.code == 0, let json = self.json(result.output) else {
                if !self.busy { self.openRouterStatus.stringValue = "OpenRouter: status unavailable." }
                return
            }
            let current = self.openRouterModelField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if let model = json["model"] as? String, !model.isEmpty, current.isEmpty || current == "z-ai/glm-5.2" {
                self.openRouterModelField.stringValue = model
            }
            if !self.busy { self.openRouterStatus.stringValue = self.describeOpenRouterStatus(json) }
        }
    }

    func describeOpenRouterStatus(_ json: [String: Any]) -> String {
        let keyPresent = json["key_present"] as? Bool == true
        let providerPresent = json["provider_present"] as? Bool == true
        let selected = json["selected"] as? Bool == true
        let model = json["model"] as? String ?? "unset"
        if !keyPresent { return "OpenRouter: key missing. Save OpenRouter key, then Use OpenRouter." }
        if !providerPresent { return "OpenRouter: provider missing. Save OpenRouter key to install the provider block." }
        if selected { return "OpenRouter: active · model \(model). Restore Chat / Pro or Use codex-lb to switch away." }
        return "OpenRouter: key stored · model \(model) · not selected. Click Use OpenRouter."
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

    @objc func useOpenRouter() {
        let model = openRouterModelField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !model.isEmpty else {
            openRouterStatus.stringValue = "Enter an OpenRouter model id, then click Use OpenRouter."
            return
        }
        guard !busy else {
            openRouterStatus.stringValue = "Another provider action is already running."
            return
        }
        guard let snapshot = operations.begin(kind: "openrouter-use", mutationGroup: "codex-config", summary: "Use OpenRouter") else {
            openRouterStatus.stringValue = "Another guarded mutation is already running. Wait or open Diagnostics."
            return
        }
        setBusy(true)
        openRouterStatus.stringValue = "Activating OpenRouter (\(model)) and restarting Codex App…"
        _ = operations.update(snapshot, state: .running, stage: "activating", progress: nil, summary: "Use OpenRouter")
        processClient.run(["codex-app", "use-openrouter", "--model", model, "--restart-app", "--json"], timeout: NativeView.mutationTimeout) { [weak self] result in
            guard let self = self else { return }
            self.setBusy(false)
            let json = self.json(result.output)
            let ok = result.code == 0 && json?["ok"] as? Bool == true
            let activeModel = (json?["model"] as? String) ?? model
            _ = self.operations.update(snapshot, state: ok ? .succeeded : .failed, stage: "complete", progress: 1, summary: ok ? "OpenRouter active after restart" : "OpenRouter activation needs action")
            self.openRouterStatus.stringValue = ok
                ? "OpenRouter: active · model \(activeModel)."
                : "Use OpenRouter failed · \(NativeView.redactPreview(result.output))"
            self.refresh()
        }
    }
}
