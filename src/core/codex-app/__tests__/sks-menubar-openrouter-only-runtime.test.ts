import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePackagedMenuBarSourceRoot } from '../menubar/resources.js';

test('Control Center OpenRouter Only and Subagent Models decoders follow the bridge command contract', (t) => {
  if (process.platform !== 'darwin') return t.skip('Swift OpenRouter Only contract is macOS-only');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-openrouter-only-runtime-'));
  const harness = path.join(root, 'OpenRouterOnlyHarness.swift');
  const binary = path.join(root, 'openrouter-only-harness');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(harness, `
import Foundation

@main
struct OpenRouterOnlyHarness {
    static func envelope(_ operation: String, ok: Bool = true, blockers: [String] = [], result: [String: Any]) -> [String: Any] {
        ["schema": "sks.desktop-bridge-command-result.v1", "operation": operation, "ok": ok,
         "execution": ["ok": ok, "status": ok ? "completed" : "failed", "blockers": blockers],
         "status": NSNull(), "result": result]
    }

    static func mode(enabled: Bool, state: String, error: Any = NSNull(), rows: [[String: Any]] = [], warnings: [String] = []) -> [String: Any] {
        ["enabled": enabled, "state": state, "error": error, "main_model": enabled ? "vendor/main" : NSNull(),
         "default_subagent_model": rows.isEmpty ? NSNull() : "vendor/fast", "subagent_models": rows,
         "jev_enabled": true, "warnings": warnings]
    }

    static let rows: [[String: Any]] = [
        ["model": "vendor/fast", "criteria": "quick lookups", "reasoning_effort": NSNull(), "default": true, "routable": true],
        ["model": "Vendor/Deep", "criteria": "large refactors", "reasoning_effort": "high", "default": false, "routable": false]
    ]

    static func main() throws {
        precondition(OpenRouterOnlyCommand.status == ["bridge", "openrouter-only", "status", "--json"])
        precondition(OpenRouterOnlyCommand.set(enabled: true) == ["bridge", "openrouter-only", "on", "--json"])
        precondition(OpenRouterOnlyCommand.set(enabled: false) == ["bridge", "openrouter-only", "off", "--json"])
        precondition(OpenRouterOnlyCommand.listSubagentModels == ["bridge", "subagent-models", "list", "--json"])
        precondition(OpenRouterOnlyCommand.setSubagentModels == ["bridge", "subagent-models", "set", "--stdin", "--json"])

        // Mode state: exclusive with Codex-LB, "on but unavailable" stays distinct.
        // The real CLI adds one unroutable warning per routable:false row.
        let active = envelope("openrouter-only.status", result: ["openrouter_only": mode(enabled: true, state: "active", rows: rows,
            warnings: ["openrouter_only_codex_image_mode_unavailable", "openrouter_only_subagent_model_unroutable:Vendor/Deep"])])
        guard let on = OpenRouterOnlyState.decode(active) else { fatalError("active mode did not decode") }
        precondition(on.enabled && on.state == "active" && on.jevEnabled)
        precondition(on.subagentModels.count == 2 && on.subagentModels[1].reasoningEffort == "high")
        precondition(on.unroutableModels == ["Vendor/Deep"])
        precondition(on.message.hasPrefix("On · "))
        precondition(on.modelSummary == "Main model: vendor/main · default subagent model: vendor/fast · Jev routing on")
        // unroutableModels already names the model; its raw warning is not repeated.
        precondition(on.warningMessages.count == 1 && on.warningMessages[0].contains("Image Generation"), on.warningMessages.joined(separator: "|"))
        // Unknown codes are humanized, but a value after ':' stays exact.
        precondition(OpenRouterOnlyMessages.describe("openrouter_only_new_code:vendor/x_y") == "Openrouter only new code: vendor/x_y")
        precondition(OpenRouterOnlyState.decode(envelope("openrouter-only.status", result: ["openrouter_only": mode(enabled: true, state: "off")])) == nil)
        precondition(OpenRouterOnlyState.decode(envelope("openrouter-only.status", result: ["openrouter_only": mode(enabled: false, state: "maybe")])) == nil)
        precondition(OpenRouterOnlyState.decode(envelope("openrouter-only.status", result: [:])) == nil)
        let emptyList = OpenRouterOnlyState.decode(envelope("openrouter-only.status", result: ["openrouter_only":
            mode(enabled: true, state: "unavailable", error: "openrouter_only_subagent_list_empty")]))!
        precondition(emptyList.message.hasPrefix("On, unavailable · ") && emptyList.message.contains("Subagent Models page"))
        let blockedOff = OpenRouterOnlyState.decode(envelope("openrouter-only.status", result: ["openrouter_only":
            mode(enabled: false, state: "unavailable", error: "openrouter_only_provider_disabled")]))!
        precondition(!blockedOff.enabled && blockedOff.state == "off" && blockedOff.modelSummary == nil)
        precondition(blockedOff.message.hasPrefix("Off · before turning on: OpenRouter is turned off"))
        // auth-priority on answers carry the mode it turned off.
        precondition(OpenRouterOnlyState.decode(envelope("auth-priority.set", result: ["auth_priority": ["enabled": true, "state": "active"],
            "openrouter_only": mode(enabled: false, state: "off")]))?.enabled == false)

        // Mutation outcome: the saved mode and command success are separate facts.
        precondition(OpenRouterOnlyMutationOutcome.resolve(payload: active, desired: true, commandSucceeded: true, responseComplete: true).succeeded)
        precondition(OpenRouterOnlyMutationOutcome.resolve(payload: active, desired: true, commandSucceeded: false, responseComplete: true) == .savedWithSetupIssue(on))
        precondition(OpenRouterOnlyMutationOutcome.resolve(payload: active, desired: false, commandSucceeded: true, responseComplete: true) == .notApplied(on))
        precondition(OpenRouterOnlyMutationOutcome.resolve(payload: active, desired: true, commandSucceeded: true, responseComplete: false) == .unconfirmed)
        precondition(OpenRouterOnlyMutationOutcome.resolve(payload: nil, desired: true, commandSucceeded: true, responseComplete: true).observedState == nil)

        // Mixed output: a banner, the result, then a native timeout object.
        let data = try JSONSerialization.data(withJSONObject: active)
        let mixed = "banner { not-json\\n" + String(data: data, encoding: .utf8)! + "\\n{\\"schema\\":\\"sks.native-process-error.v1\\",\\"ok\\":false,\\"error\\":\\"native_process_timeout\\"}"
        precondition(OpenRouterOnlyJSON.object(from: mixed)?["operation"] as? String == "openrouter-only.status")
        precondition(OpenRouterOnlyJSON.object(from: "{\\"schema\\":\\"sks.native-process-error.v1\\",\\"ok\\":false,\\"error\\":\\"native_process_timeout\\"}")?["error"] as? String == "native_process_timeout")

        // An SKS build without the command asks for an update instead of guessing.
        let older: [String: Any] = ["schema": "sks.bridge-command-error.v1", "ok": false, "blockers": ["bridge_command_invalid"]]
        precondition(OpenRouterOnlyJSON.unavailableReason(code: 1, output: "", payload: older).contains("does not include OpenRouter Only"))
        let olderFlag: [String: Any] = ["schema": "sks.bridge-command-error.v1", "ok": false, "blockers": ["bridge_command_unknown_option"]]
        precondition(OpenRouterOnlyJSON.unavailableReason(code: 1, output: "", payload: olderFlag).contains("Update SKS"))
        precondition(OpenRouterOnlyJSON.unavailableReason(code: 127, output: "sks command not found", payload: nil).contains("Menu Bar path"))
        precondition(OpenRouterOnlyJSON.unavailableReason(code: -2, output: "", payload: ["ok": false, "error": "native_process_timeout"]) == "SKS did not answer in time.")

        // set refusals carry the 0-based row index; the page shows 1-based rows.
        let refused = envelope("subagent-models.set", ok: false, blockers: ["subagent_model_duplicate:1"], result: [:])
        precondition(OpenRouterOnlyReceipt.decode(refused).primaryIssue == "Row 2: this model and effort are already on the list. Choose a different effort.")
        precondition(OpenRouterOnlyMessages.describe("subagent_model_id_invalid:0") == "Row 1: not a valid model id for this connection.")

        // Subagent list snapshot: available rows are validated and de-duplicated.
        let list = envelope("subagent-models.list", result: [
            "openrouter_only": mode(enabled: true, state: "active", rows: rows),
            "available": [
                ["public_id": "vendor/fast", "display_name": "Fast"],
                ["public_id": "VENDOR/fast", "display_name": "Duplicate"],
                ["public_id": "not-a-model", "display_name": "Bad"],
                ["public_id": "vendor/new", "display_name": "vendor/new"],
                NSNull()
            ]
        ])
        guard let snapshot = SubagentModelsSnapshot.decode(list), let available = snapshot.available else { fatalError("list did not decode") }
        precondition(available.map(\\.publicId) == ["vendor/fast", "vendor/new"])
        precondition(available[0].menuTitle == "Fast  ·  vendor/fast" && available[1].menuTitle == "vendor/new")
        guard let setAnswer = SubagentModelsSnapshot.decode(envelope("subagent-models.set", result: ["openrouter_only": mode(enabled: true, state: "active")])) else {
            fatalError("set answer did not decode")
        }
        precondition(setAnswer.available == nil && setAnswer.mode.subagentModels.isEmpty)
        precondition(SubagentModelsSnapshot.decode(envelope("models.list", result: ["openrouter_only": mode(enabled: true, state: "active")])) == nil)

        // Draft edits.
        let saved = snapshot.mode.subagentModels
        let options = SubagentModelDraft.popupOptions(available: available, entries: saved)
        precondition(options.map(\\.publicId) == ["vendor/fast", "vendor/new", "Vendor/Deep"])
        precondition(options[2].menuTitle == "Vendor/Deep  ·  not in the current catalog")
        guard let added = SubagentModelDraft.adding(saved, available: available) else { fatalError("add failed") }
        precondition(added.last?.model == "vendor/new" && added.last?.isDefault == false)
        guard let effortAdded = SubagentModelDraft.adding(added, available: available) else { fatalError("effort add failed") }
        precondition(effortAdded.last?.model == "vendor/fast" && effortAdded.last?.reasoningEffort == "low")
        precondition(SubagentModelDraft.adding([], available: available)?.first?.isDefault == true)
        let full = (0..<16).map { SubagentModelEntry(model: "vendor/m\\($0)", criteria: "", reasoningEffort: nil, isDefault: $0 == 0, routable: nil) }
        precondition(SubagentModelDraft.adding(full, available: [SubagentModelOption(publicId: "vendor/extra", displayName: "Extra")]) == nil)
        let removed = SubagentModelDraft.removing(saved, at: 0)
        precondition(removed.count == 1 && removed[0].isDefault)
        let moved = SubagentModelDraft.settingDefault(saved, at: 1)
        precondition(moved.map(\\.isDefault) == [false, true])
        precondition(SubagentModelDraft.isDirty(draft: moved, saved: saved))
        var routability = saved
        routability[1].routable = true
        precondition(!SubagentModelDraft.isDirty(draft: routability, saved: saved))

        var invalid = saved
        invalid.append(SubagentModelEntry(model: "VENDOR/FAST", criteria: "", reasoningEffort: nil, isDefault: false, routable: nil))
        invalid.append(SubagentModelEntry(model: "no-slash", criteria: "", reasoningEffort: nil, isDefault: false, routable: nil))
        invalid.append(SubagentModelEntry(model: "vendor/x", criteria: "", reasoningEffort: "extreme", isDefault: false, routable: nil))
        precondition(SubagentModelDraft.issues(invalid) == ["subagent_model_duplicate:2", "subagent_model_id_invalid:3", "subagent_model_effort_invalid:4"])
        precondition(SubagentModelDraft.issues(saved).isEmpty)
        let paired = saved + [SubagentModelEntry(model: "vendor/fast", criteria: "browser", reasoningEffort: "low", isDefault: false, routable: nil)]
        precondition(SubagentModelDraft.issues(paired).isEmpty)

        // Criteria ProcessClient redacted are not the saved text: never applied back.
        let hidden = SubagentModelEntry(model: "vendor/b", criteria: "[redacted]", reasoningEffort: nil, isDefault: false, routable: true)
        precondition(hidden.criteriaUnreadable && !saved[0].criteriaUnreadable)
        precondition(SubagentModelDraft.issues(saved + [hidden]) == ["subagent_model_criteria_redacted:2"])
        precondition(OpenRouterOnlyMessages.describe("subagent_model_criteria_redacted:2").hasPrefix("Row 3: part of these criteria looks like a secret"))
        // A redacted answer row takes back the text the page holds when that text fits the answer around each
        // [redacted] (the CLI and Control Center redact with different patterns); other text is never taken.
        let redact: (String) -> String = { $0.replacingOccurrences(of: "token: budget", with: "[redacted]") }
        let answerRows = [
            SubagentModelEntry(model: "Vendor/A", criteria: "[redacted]-heavy", reasoningEffort: nil, isDefault: true, routable: true),
            hidden,
            SubagentModelEntry(model: "vendor/c", criteria: "Cookie: [redacted]", reasoningEffort: nil, isDefault: false, routable: true),
            SubagentModelEntry(model: "vendor/d", criteria: "Authorization: [redacted]", reasoningEffort: nil, isDefault: false, routable: true)
        ]
        let known = [
            SubagentModelEntry(model: "vendor/a", criteria: " token:  budget-heavy ", reasoningEffort: nil, isDefault: true, routable: nil),
            SubagentModelEntry(model: "vendor/c", criteria: "token: other", reasoningEffort: nil, isDefault: false, routable: nil),
            SubagentModelEntry(model: "vendor/d", criteria: "Authorization: RBAC reviews", reasoningEffort: nil, isDefault: false, routable: nil)
        ]
        let restored = SubagentModelDraft.restoringCriteria(answerRows, known: known, redact: redact)
        precondition(restored.map(\\.criteria) == ["token: budget-heavy", hidden.criteria, "Cookie: [redacted]", "Authorization: RBAC reviews"], restored.map(\\.criteria).joined(separator: "|"))
        precondition(SubagentModelDraft.issues(restored) == ["subagent_model_criteria_redacted:1", "subagent_model_criteria_redacted:2"])
        let hiddenPair = ["high", "low"].map { effort in SubagentModelEntry(model: "vendor/a", criteria: "[redacted]", reasoningEffort: effort, isDefault: false, routable: true) }
        let knownPair = ["low", "high"].map { effort in SubagentModelEntry(model: "vendor/a", criteria: "token: " + effort, reasoningEffort: effort, isDefault: false, routable: nil) }
        let restoredPair = SubagentModelDraft.restoringCriteria(hiddenPair, known: knownPair, redact: { _ in "[redacted]" })
        precondition(restoredPair.map(\\.criteria) == ["token: high", "token: low"], "criteria must stay with the matching effort")

        precondition(SubagentModelDraft.cleanCriteria("  large\\trefactors\\n and   UI  ") == "large refactors and UI")
        precondition(SubagentModelDraft.cleanCriteria("\\u{00A0}UI\\u{2003}work\\u{FEFF}") == "UI work")
        precondition(SubagentModelDraft.limitCriteria(String(repeating: "a", count: 300)).count == 240)
        // The CLI slices UTF-16 units; whole characters stay within that budget.
        let emoji = SubagentModelDraft.limitCriteria(String(repeating: "\\u{1F600}", count: 130))
        precondition(emoji.count == 120 && emoji.utf16.count == 240)
        precondition(SubagentModelDraft.limitCriteria("keep trailing ") == "keep trailing ")
        precondition(SubagentModelDraft.effort(title: "Default") == nil && SubagentModelDraft.effort(title: "xhigh") == "xhigh")

        // stdin carries the complete list with exactly one default.
        var noDefault = saved.map { entry -> SubagentModelEntry in var copy = entry; copy.isDefault = false; return copy }
        noDefault[0].criteria = " quick\\u{0007} lookups "
        guard let stdin = SubagentModelDraft.stdinPayload(noDefault) else { fatalError("stdin payload failed") }
        precondition(stdin.hasSuffix("\\n") && stdin.contains("\\"vendor/fast\\""))
        let parsed = try JSONSerialization.jsonObject(with: Data(stdin.utf8)) as! [String: Any]
        precondition(Array(parsed.keys) == ["subagent_models"])
        let sent = parsed["subagent_models"] as! [[String: Any]]
        precondition(sent.count == 2)
        precondition(sent[0]["model"] as? String == "vendor/fast" && sent[0]["criteria"] as? String == "quick lookups")
        precondition(sent[0]["reasoning_effort"] is NSNull && sent[1]["reasoning_effort"] as? String == "high")
        precondition(sent.map { $0["default"] as? Bool } == [true, false])
        precondition(sent.allSatisfy { $0["routable"] == nil })
        print("native-openrouter-only-runtime-ok")
    }
}
`);
  const sources = ['OpenRouterOnlyState.swift', 'SubagentModelsModels.swift']
    .map((name) => path.join(resolvePackagedMenuBarSourceRoot(), 'Sources', name));
  const compiled = spawnSync('swiftc', [...sources, harness, '-o', binary], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
  const executed = spawnSync(binary, [], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(executed.status, 0, executed.stderr || executed.stdout);
  assert.match(executed.stdout, /native-openrouter-only-runtime-ok/);
});
