import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNativeMenuBarSources } from '../menubar/resources.js';

// The real Connections and Subagent Models pages, driven through the real
// ProcessClient against a fixture `sks` action script.
function commandResult(operation: string, result: Record<string, unknown>) {
  return JSON.stringify({
    schema: 'sks.desktop-bridge-command-result.v1', operation, ok: true,
    execution: { ok: true, status: 'completed', blockers: [] }, status: null, result
  });
}

// Warnings follow the real CLI: one per list model without an OpenRouter route.
function modeState(enabled: boolean, rows: Array<{ model: string; routable: boolean }> = []) {
  return {
    enabled, state: enabled ? 'active' : 'off', error: null, main_model: enabled ? 'vendor/main' : null,
    default_subagent_model: rows.length ? 'vendor/fast' : null, subagent_models: rows, jev_enabled: true,
    warnings: enabled ? rows.filter((row) => !row.routable).map((row) => `openrouter_only_subagent_model_unroutable:${row.model}`) : []
  };
}

const priority = (enabled: boolean) => ({ enabled, state: enabled ? 'active' : 'off', error: null });

test('Control Center pages lock both routing switches, re-read both modes, and send the subagent list on stdin', (t) => {
  if (process.platform !== 'darwin') return t.skip('Swift Control Center pages are macOS-only');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-openrouter-only-pages-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = path.join(root, 'fixture');
  const sourceDir = path.join(root, 'sources');
  const operationsDir = path.join(root, 'operations');
  for (const dir of [fixture, sourceDir, path.join(root, 'home')]) fs.mkdirSync(dir, { recursive: true });
  const write = (name: string, value: string) => fs.writeFileSync(path.join(fixture, name), value);
  const action = path.join(fixture, 'action.sh');
  fs.writeFileSync(action, `#!/bin/sh
root="$(/usr/bin/dirname "$0")"
echo "$*" >> "$root/calls.log"
case "$1 $2 $3" in
  "bridge auth-priority status") /bin/sleep "$(/bin/cat "$root/status-delay")"; /bin/cat "$root/auth.json" ;;
  "bridge openrouter-only status") /bin/sleep "$(/bin/cat "$root/status-delay")"; /bin/cat "$root/mode.json" ;;
  "bridge models list") /bin/cat "$root/models.json" ;;
  "bridge auth-priority on"|"bridge openrouter-only on")
    /bin/sleep 1
    /bin/cp "$root/$2-$3.auth" "$root/auth.json"
    /bin/cp "$root/$2-$3.mode" "$root/mode.json"
    /bin/cat "$root/$2-$3.out"
    ;;
  "bridge subagent-models list") /bin/cat "$root/list.json"; exit "$(/bin/cat "$root/list-exit")" ;;
  "bridge subagent-models set")
    echo "$*" > "$root/set-args"
    /bin/cat > "$root/received.json"
    /bin/cat "$root/set.json"
    ;;
  *) exit 64 ;;
esac
`, { mode: 0o755 });
  // "risk-assessment" contains "sk-…" and "token: …" matches ProcessClient's
  // key=value pattern: both must survive the redacted round trip.
  const rows = [
    { model: 'vendor/fast', criteria: 'quick lookups', reasoning_effort: null, default: true, routable: true },
    { model: 'vendor/deep', criteria: 'risk-assessment-heavy reviews', reasoning_effort: 'high', default: false, routable: false }
  ];
  const savedRows = [
    { model: 'vendor/fast', criteria: 'quick lookups and docs', reasoning_effort: null, default: false, routable: true },
    { model: 'vendor/deep', criteria: 'risk-assessment-heavy reviews', reasoning_effort: 'high', default: false, routable: true },
    { model: 'vendor/new', criteria: 'token: budget-heavy', reasoning_effort: null, default: true, routable: true }
  ];
  const available = [
    { public_id: 'vendor/fast', display_name: 'Fast' },
    { public_id: 'vendor/deep', display_name: 'Deep' },
    { public_id: 'vendor/new', display_name: 'New' }
  ];
  write('auth.json', commandResult('auth-priority.status', { auth_priority: priority(true) }));
  write('mode.json', commandResult('openrouter-only.status', { openrouter_only: modeState(false) }));
  write('openrouter-only-on.auth', commandResult('auth-priority.status', { auth_priority: priority(false) }));
  write('openrouter-only-on.mode', commandResult('openrouter-only.status', { openrouter_only: modeState(true, rows) }));
  write('openrouter-only-on.out', commandResult('openrouter-only.set', { openrouter_only: modeState(true, rows), auth_priority: priority(false) }));
  write('auth-priority-on.auth', commandResult('auth-priority.status', { auth_priority: priority(true) }));
  write('auth-priority-on.mode', commandResult('openrouter-only.status', { openrouter_only: modeState(false, rows) }));
  write('auth-priority-on.out', commandResult('auth-priority.set', { auth_priority: priority(true), openrouter_only: modeState(false, rows) }));
  write('list.json', commandResult('subagent-models.list', { openrouter_only: modeState(true, rows), available }));
  write('list-exit', '0');
  write('set.json', commandResult('subagent-models.set', { openrouter_only: modeState(true, savedRows) }));
  write('saved-list.json', commandResult('subagent-models.list', { openrouter_only: modeState(true, savedRows), available }));
  write('off-list.json', commandResult('subagent-models.list', { openrouter_only: modeState(false, savedRows), available }));
  const nativeAvailable = [
    { public_id: 'gpt-6-astra', display_name: 'Astra', reasoning_efforts: ['low', 'high', 'max', 'ultra'] },
    { public_id: 'gpt-6-luna', display_name: 'Luna', reasoning_efforts: ['low', 'max'] }
  ];
  for (const profile of ['codex_lb', 'openai']) {
    const model = profile === 'codex_lb' ? 'gpt-6-astra' : 'gpt-6-luna';
    for (const saved of [false, true]) {
      const entry = { model, criteria: saved ? `${profile} saved criteria` : `${profile} initial criteria`, reasoning_effort: saved ? profile === 'codex_lb' ? 'ultra' : 'max' : 'low', default: true, routable: true };
      const result = {
        openrouter_only: modeState(false, savedRows), available: nativeAvailable,
        subagent_model_settings: { schema: 'sks.subagent-model-settings.v1', profile, configured: true, editable: true, error: null, warnings: [], subagent_models: [entry] }
      };
      write(`${profile}-${saved ? 'saved' : 'initial'}.json`, commandResult('subagent-models.list', result));
      if (saved) write(`${profile}-set.json`, commandResult('subagent-models.set', result));
    }
  }
  write('older.json', JSON.stringify({ schema: 'sks.bridge-command-error.v1', ok: false, execution_ok: false, status: 'failed', blockers: ['bridge_command_invalid'] }));
  write('status-delay', '0');
  write('models.json', commandResult('models.list', {
    codex_lb_exposure: 'all',
    openrouter: {
      mode: 'selected', selected_count: 1, max_selected: 64, available_count: 3,
      models: available.map((row, index) => ({ ...row, selected: index === 0 }))
    }
  }));

  const sources = loadNativeMenuBarSources({
    actionScriptPath: action, projectRootPath: root, buildStampPath: path.join(root, 'build-stamp.json'),
    configPath: path.join(root, 'config.json'), lastActionLogPath: path.join(root, 'last.log'),
    operationDirPath: operationsDir, codexBundleId: null, packageVersion: '6.3.0'
  });
  const marker = '\nlet application = NSApplication.shared';
  for (const source of sources) {
    let content = source.content;
    if (source.name === 'main.swift') {
      const index = content.indexOf(marker);
      assert.ok(index >= 0, 'main.swift application marker');
      content = `${content.slice(0, index)}\n${pagesHarness()}`;
    }
    fs.writeFileSync(path.join(sourceDir, source.name), content);
  }
  const binary = path.join(root, 'pages-harness');
  const compiled = spawnSync('swiftc', [
    '-framework', 'Cocoa', '-framework', 'LocalAuthentication', '-framework', 'Security', '-framework', 'UserNotifications',
    ...sources.map((source) => path.join(sourceDir, source.name)), '-o', binary
  ], { encoding: 'utf8', timeout: 240_000 });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
  const executed = spawnSync(binary, [fixture], {
    encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, HOME: path.join(root, 'home'), SKS_SKIP_CODEX_APP_RESTART: '1' }
  });
  assert.equal(executed.status, 0, executed.stderr || executed.stdout);
  assert.match(executed.stdout, /native-openrouter-only-pages-ok/);

  const receivedText = fs.readFileSync(path.join(fixture, 'received-openrouter.json'), 'utf8');
  assert.doesNotMatch(receivedText, /redacted/i);
  assert.deepEqual(JSON.parse(receivedText), {
    subagent_models: [
      { model: 'vendor/fast', criteria: 'quick lookups and docs', reasoning_effort: null, default: false },
      { model: 'vendor/deep', criteria: 'risk-assessment-heavy reviews', reasoning_effort: 'high', default: false },
      { model: 'vendor/new', criteria: 'token: budget-heavy', reasoning_effort: null, default: true }
    ]
  });
  assert.equal(fs.readFileSync(path.join(fixture, 'set-args'), 'utf8'), 'bridge subagent-models set --stdin --json\n');
  for (const profile of ['codex_lb', 'openai']) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, `received-${profile}.json`), 'utf8')), {
      profile,
      subagent_models: [{ model: profile === 'codex_lb' ? 'gpt-6-astra' : 'gpt-6-luna', criteria: `${profile} saved criteria`, reasoning_effort: profile === 'codex_lb' ? 'ultra' : 'max', default: true }]
    });
  }
  const receipts = fs.readdirSync(operationsDir).filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(operationsDir, name), 'utf8')));
  assert.deepEqual(receipts.map((row) => `${row.kind}:${row.state}`).sort(), [
    'bridge-auth-priority:succeeded', 'bridge-openrouter-only:succeeded',
    'bridge-subagent-models:succeeded', 'bridge-subagent-models:succeeded', 'bridge-subagent-models:succeeded'
  ]);
});

// Top-level harness code that replaces main.swift's application start.
function pagesHarness(): string {
  return String.raw`
NSApplication.shared.setActivationPolicy(.prohibited)
let fixture = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let client = ProcessClient(actionScript: AppRuntime.actionScript, logPath: AppRuntime.lastActionLogPath, projectRoot: AppRuntime.projectRoot)
let operations = OperationCoordinator(directory: AppRuntime.operationDirectory)

func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
// Only text a user can see: a field inside a hidden row does not count.
func labels(_ view: NSView) -> String {
    descendants(view).compactMap { ($0 as? NSTextField).flatMap { $0.isHiddenOrHasHiddenAncestor ? nil : $0.stringValue } }.joined(separator: "\n")
}
func find<T: NSView>(_ view: NSView, _ id: String, _ type: T.Type) -> T {
    guard let match = descendants(view).first(where: { $0.accessibilityIdentifier() == id }) as? T else { fatalError("missing " + id) }
    return match
}
func pump(_ view: NSView, _ reason: String, until done: () -> Bool) {
    let deadline = Date().addingTimeInterval(15)
    while !done(), Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
    precondition(done(), reason + "\n" + labels(view))
}
func press(_ button: NSButton) {
    precondition(button.isEnabled, "disabled: " + button.title)
    _ = button.target?.perform(button.action, with: button)
}
func copyFixture(_ from: String, to: String) {
    let source = fixture.appendingPathComponent(from), target = fixture.appendingPathComponent(to)
    try? FileManager.default.removeItem(at: target)
    try! FileManager.default.copyItem(at: source, to: target)
}
func calls() -> [String] {
    ((try? String(contentsOf: fixture.appendingPathComponent("calls.log"), encoding: .utf8)) ?? "")
        .split(separator: "\n").map(String.init)
}
func resetCalls() { try! "".write(to: fixture.appendingPathComponent("calls.log"), atomically: true, encoding: .utf8) }
func setStatusDelay(_ seconds: String) { try! seconds.write(to: fixture.appendingPathComponent("status-delay"), atomically: true, encoding: .utf8) }
func criteriaText(_ view: NSView, _ index: Int) -> String { find(view, "sks-subagent-models-criteria-\(index)", NSTextField.self).stringValue }
let rereadCalls = ["bridge auth-priority status --json", "bridge openrouter-only status --json", "bridge status --json", "bridge models list --json"]

// Connections: Prefer Codex-LB and OpenRouter Only exclude each other.
let providers = ProvidersViewController(processClient: client, operations: operations)
let providersView = providers.view
providers.refreshAuthPriority()
providers.refreshOpenRouterOnly()
pump(providersView, "modes did not load") { providers.authPriorityEnabled != nil && providers.openRouterOnlyEnabled != nil }
precondition(providers.authPriorityToggle.state == .on && providers.openRouterOnlyToggle.state == .off)
precondition(providers.authPriorityToggle.isEnabled && providers.openRouterOnlyToggle.isEnabled)

// Slow status re-reads: each switch must show the other mode from the mutation answer itself.
setStatusDelay("2")
resetCalls()
providers.openRouterOnlyToggle.state = .on
providers.toggleOpenRouterOnly()
precondition(!providers.authPriorityToggle.isEnabled && !providers.openRouterOnlyToggle.isEnabled, "both switches lock while a mode changes")
providers.toggleAuthPriority()
pump(providersView, "OpenRouter Only on did not finish") { providers.openRouterOnlyEnabled == true }
precondition(providers.authPriorityEnabled == false && providers.authPriorityToggle.state == .off, "Prefer Codex-LB kept its pre-change state")
precondition(providers.authPriorityToggle.isEnabled && providers.openRouterOnlyToggle.isEnabled)
pump(providersView, "OpenRouter Only on did not re-read modes, catalog and exposure") {
    rereadCalls.allSatisfy { calls().contains($0) }
        && providers.exposureStatus.stringValue.hasPrefix("OpenRouter Only: Codex-LB models are hidden; subagent list models are always exposed · OpenRouter: 1 of 3")
}
precondition(calls().filter { $0.hasSuffix(" on --json") } == ["bridge openrouter-only on --json"], "a locked switch must not start a second change")
precondition(providers.openRouterOnlyToggle.state == .on && providers.authPriorityToggle.state == .off)
precondition(labels(providersView).contains("On · Codex and its subagents use OpenRouter models only"))
precondition(labels(providersView).contains("Not routable yet: vendor/deep"))
precondition(!labels(providersView).lowercased().contains("unroutable"), "the unroutable warning code must not repeat the routability line")

resetCalls()
providers.authPriorityToggle.state = .on
providers.toggleAuthPriority()
precondition(!providers.authPriorityToggle.isEnabled && !providers.openRouterOnlyToggle.isEnabled, "both switches lock while Codex-LB changes")
pump(providersView, "Codex-LB on did not finish") { providers.authPriorityEnabled == true }
precondition(providers.openRouterOnlyEnabled == false && providers.openRouterOnlyToggle.state == .off, "OpenRouter Only kept its pre-change state")
pump(providersView, "Codex-LB on did not re-read modes, catalog and exposure") {
    rereadCalls.allSatisfy { calls().contains($0) } && providers.exposureStatus.stringValue.hasPrefix("Codex-LB: all models exposed · OpenRouter: 1 of 3")
        && providers.authPriorityToggle.isEnabled && providers.openRouterOnlyToggle.isEnabled
}
precondition(providers.openRouterOnlyToggle.state == .off && providers.authPriorityToggle.state == .on)
setStatusDelay("0")

// Subagent Models: edit, add, choose a default, apply through stdin.
let page = SubagentModelsViewController(processClient: client, operations: operations)
let pageView = page.view
page.refreshOnAppear()
pump(pageView, "list did not load") { labels(pageView).contains("2 of 16 models") }
let apply = find(pageView, "sks-subagent-models-apply", NSButton.self)
let add = find(pageView, "sks-subagent-models-add", NSButton.self)
precondition(!apply.isEnabled, "a clean list is not appliable")
precondition(criteriaText(pageView, 1) == "risk-assessment-heavy reviews", "criteria must read back unredacted: " + criteriaText(pageView, 1))
precondition(!labels(pageView).contains("Turn on OpenRouter Only on the Connections page"), "the hint shows only while the mode is off")
precondition(find(pageView, "sks-subagent-models-connections", NSButton.self).isHiddenOrHasHiddenAncestor)
precondition(find(pageView, "sks-subagent-models-model-1", NSPopUpButton.self).titleOfSelectedItem == "Deep  ·  vendor/deep")
precondition(find(pageView, "sks-subagent-models-effort-1", NSPopUpButton.self).titleOfSelectedItem == "high")
let criteria = find(pageView, "sks-subagent-models-criteria-0", NSTextField.self)
criteria.stringValue = "quick   lookups and docs"
page.controlTextDidChange(Notification(name: NSControl.textDidChangeNotification, object: criteria))
precondition(apply.isEnabled, "an edit enables Apply")
press(add)
press(find(pageView, "sks-subagent-models-default-2", NSButton.self))
precondition(!add.isEnabled, "every catalog model is already on the list")
// ProcessClient redacts this in the answer; stdin carries it intact and the page keeps it.
let tokenCriteria = find(pageView, "sks-subagent-models-criteria-2", NSTextField.self)
tokenCriteria.stringValue = "token: budget-heavy"
page.controlTextDidChange(Notification(name: NSControl.textDidChangeNotification, object: tokenCriteria))
copyFixture("saved-list.json", to: "list.json")
press(apply)
pump(pageView, "apply did not finish") {
    labels(pageView).contains("Subagent model list saved · 3 models") && labels(pageView).contains("3 of 16 models")
}
precondition(!apply.isEnabled)
precondition(criteriaText(pageView, 2) == "token: budget-heavy" && criteriaText(pageView, 1) == "risk-assessment-heavy reviews")
copyFixture("received.json", to: "received-openrouter.json")

// Mode off: rows are read-only and the page points to Connections.
copyFixture("off-list.json", to: "list.json")
page.refreshOnAppear()
pump(pageView, "off state missing") { labels(pageView).contains("OpenRouter Only is off") }
precondition(labels(pageView).contains("Turn on OpenRouter Only on the Connections page"))
precondition(!find(pageView, "sks-subagent-models-connections", NSButton.self).isHiddenOrHasHiddenAncestor)
precondition(!add.isEnabled && !apply.isEnabled)
precondition(!find(pageView, "sks-subagent-models-model-0", NSPopUpButton.self).isEnabled)
precondition(!find(pageView, "sks-subagent-models-criteria-0", NSTextField.self).isEnabled)
// The re-read answer is redacted; the text this page saved stays readable.
precondition(criteriaText(pageView, 2) == "token: budget-heavy", "known criteria lost to redaction: " + criteriaText(pageView, 2))

// A fresh page cannot know text the output filter hid: that row blocks every Apply.
copyFixture("saved-list.json", to: "list.json")
let fresh = SubagentModelsViewController(processClient: client, operations: operations)
let freshView = fresh.view
fresh.refreshOnAppear()
pump(freshView, "fresh list did not load") { labels(freshView).contains("3 of 16 models") }
precondition(criteriaText(freshView, 2) == "[redacted]")
precondition(!find(freshView, "sks-subagent-models-criteria-unreadable-2", NSTextField.self).isHiddenOrHasHiddenAncestor)
let freshCriteria = find(freshView, "sks-subagent-models-criteria-0", NSTextField.self)
freshCriteria.stringValue = "quick lookups"
fresh.controlTextDidChange(Notification(name: NSControl.textDidChangeNotification, object: freshCriteria))
resetCalls()
press(find(freshView, "sks-subagent-models-apply", NSButton.self))
precondition(labels(freshView).contains("Row 3: part of these criteria looks like a secret"), labels(freshView))
precondition(!calls().contains { $0.hasPrefix("bridge subagent-models set") }, "redacted criteria must never be sent back")

// An SKS build without the command asks for an update.
copyFixture("older.json", to: "list.json")
try! "1".write(to: fixture.appendingPathComponent("list-exit"), atomically: true, encoding: .utf8)
page.refreshOnAppear()
pump(pageView, "older CLI message missing") { labels(pageView).contains("does not include OpenRouter Only") }
precondition(!add.isEnabled && !apply.isEnabled)

// Current CLI: both native connection profiles are editable while OpenRouter Only is off.
try! "0".write(to: fixture.appendingPathComponent("list-exit"), atomically: true, encoding: .utf8)
for profile in ["codex_lb", "openai"] {
    copyFixture("\(profile)-initial.json", to: "list.json")
    copyFixture("\(profile)-set.json", to: "set.json")
    page.refreshOnAppear()
    let label = profile == "codex_lb" ? "Codex-LB" : "OpenAI OAuth"
    pump(pageView, "native connection list did not load") { labels(pageView).contains(label + " · custom list") }
    precondition(add.isEnabled, "Add Model must be usable without OpenRouter Only")
    precondition(criteriaText(pageView, 0) == "\(profile) initial criteria", "a different connection's dirty draft leaked")
    let field = find(pageView, "sks-subagent-models-criteria-0", NSTextField.self)
    precondition(field.isEnabled)
    field.stringValue = "\(profile) saved criteria"
    page.controlTextDidChange(Notification(name: NSControl.textDidChangeNotification, object: field))
    let effort = find(pageView, "sks-subagent-models-effort-0", NSPopUpButton.self)
    precondition(profile == "codex_lb" ? effort.itemTitles.contains("ultra") : !effort.itemTitles.contains("ultra"), "efforts must match the selected model")
    effort.selectItem(withTitle: profile == "codex_lb" ? "ultra" : "max")
    _ = effort.target?.perform(effort.action, with: effort)
    copyFixture("\(profile)-saved.json", to: "list.json")
    press(apply)
    pump(pageView, "native list apply did not finish") { labels(pageView).contains("Subagent model list saved · 1 model") && !apply.isEnabled }
    copyFixture("received.json", to: "received-\(profile).json")
    let dirty = find(pageView, "sks-subagent-models-criteria-0", NSTextField.self)
    dirty.stringValue = "unapplied \(profile) draft"
    page.controlTextDidChange(Notification(name: NSControl.textDidChangeNotification, object: dirty))
}
client.terminateAll()
print("native-openrouter-only-pages-ok")
`;
}
