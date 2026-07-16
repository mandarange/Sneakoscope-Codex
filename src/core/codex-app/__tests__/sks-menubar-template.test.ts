import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionScriptSource,
  aggregateFileHashes,
  createSksMenuBarBuildStamp,
  evaluateActionScriptIntegrity,
  infoPlistSource,
  loadNativeMenuBarSources,
  nativeResourceHashes,
  NATIVE_RESOURCE_FILES,
  NATIVE_SOURCE_FILES,
  resolvePackagedMenuBarSourceRoot,
  swiftMenuSource
} from '../sks-menubar.js';
import { sha256 } from '../../fsx.js';

function source(codexBundleId: string | null = 'com.openai.codex') {
  return swiftMenuSource({
    actionScriptPath: '/tmp/sks-menubar-action.sh',
    buildStampPath: '/tmp/build-stamp.json',
    configPath: '/tmp/config.json',
    lastActionLogPath: '/tmp/logs/last-action.log',
    operationDirPath: '/tmp/operations',
    codexBundleId,
    packageVersion: '6.3.0'
  });
}

test('SKS Menu Bar uses the required split native source and resource inventory', () => {
  const root = resolvePackagedMenuBarSourceRoot();
  assert.deepEqual([...NATIVE_SOURCE_FILES], [
    'main.swift', 'AppDelegate.swift', 'StatusItemController.swift',
    'ControlCenterWindowController.swift', 'SidebarItem.swift',
    'OverviewViewController.swift', 'UpdatesViewController.swift',
    'MCPServersViewController.swift', 'ProvidersViewController.swift',
    'RemoteTelegramViewController.swift', 'DiagnosticsViewController.swift',
    'SettingsViewController.swift', 'OperationCoordinator.swift',
    'ProcessClient.swift', 'NotificationCoordinator.swift', 'AlertFactory.swift',
    'AppIdentity.swift'
  ]);
  assert.deepEqual([...NATIVE_RESOURCE_FILES], [
    'AppIcon.icns', 'SKSStatusTemplate.pdf', 'SKSStatusUpdateTemplate.pdf',
    'SKSStatusWarningTemplate.pdf', 'SKSStatusAttentionTemplate.pdf',
    'Localizable.strings'
  ]);
  for (const name of NATIVE_SOURCE_FILES) assert.ok(fs.statSync(path.join(root, 'Sources', name)).size > 0, name);
  for (const name of NATIVE_RESOURCE_FILES) assert.ok(fs.statSync(path.join(root, 'Resources', name)).size > 0, name);
  assert.match(fs.readFileSync(path.join(root, 'Resources', 'AppIcon.icns')).subarray(0, 4).toString('ascii'), /icns/);
});

test('status template resources are distinct valid 18x18 PDFs', () => {
  const resources = path.join(resolvePackagedMenuBarSourceRoot(), 'Resources');
  const names = [
    'SKSStatusTemplate.pdf',
    'SKSStatusUpdateTemplate.pdf',
    'SKSStatusWarningTemplate.pdf',
    'SKSStatusAttentionTemplate.pdf'
  ];
  const digests = names.map((name) => {
    const bytes = fs.readFileSync(path.join(resources, name));
    const pdf = bytes.toString('latin1');
    assert.match(pdf, /^%PDF-\d\.\d/, `${name}: PDF header`);
    assert.match(pdf, /\/Type\s*\/Catalog\b/, `${name}: catalog`);
    assert.match(pdf, /\/Type\s*\/Pages\b/, `${name}: pages tree`);
    assert.match(pdf, /\/Type\s*\/Page\b/, `${name}: page`);
    assert.match(pdf, /\/MediaBox\s*\[\s*0\s+0\s+18\s+18\s*\]/, `${name}: 18x18 MediaBox`);
    const startXref = pdf.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
    assert.ok(startXref, `${name}: startxref and EOF`);
    assert.equal(pdf.slice(Number(startXref[1]), Number(startXref[1]) + 4), 'xref', `${name}: xref offset`);
    return sha256(bytes);
  });
  assert.equal(new Set(digests).size, names.length, 'every status glyph PDF must have a distinct SHA-256');
});

test('runtime materialization injects paths, version, and optional Codex bundle id without unresolved tokens', () => {
  const withCodex = source('com.openai.codex');
  const withoutCodex = source(null);
  assert.match(withCodex, /static let codexBundleId: String\? = "com\.openai\.codex"/);
  assert.match(withoutCodex, /static let codexBundleId: String\? = nil/);
  assert.match(withCodex, /static let operationDirectory = "\/tmp\/operations"/);
  assert.match(withCodex, /static let packageVersion = "6\.3\.0"/);
  assert.doesNotMatch(withCodex, /__SKS_[A-Z_]+__/);
  assert.match(withCodex, /NSWorkspace\.didLaunchApplicationNotification/);
  assert.match(withCodex, /NSWorkspace\.didTerminateApplicationNotification/);
  assert.match(withCodex, /if config\?\["quit_with_codex"\] as\? Bool == true/);
  assert.match(withCodex, /else \{ self\?\.statusItem\.isVisible = false \}/);
  assert.match(withCodex, /applicationShouldHandleReopen\(_ sender: NSApplication, hasVisibleWindows flag: Bool\)/);
  assert.match(withCodex, /controlCenter\?\.show\(section: \.overview\)/);
});

test('Control Center is a non-modal seven-section AppKit sidebar with native accessibility', () => {
  const swift = source();
  for (const section of ['Overview', 'Updates', 'MCP Servers', 'Providers', 'Remote & Telegram', 'Diagnostics', 'Settings']) {
    assert.match(swift, new RegExp(`= "${section.replace(/[&]/g, '\\&')}"`));
  }
  assert.match(swift, /styleMask: \[\.titled, \.closable, \.miniaturizable, \.resizable\]/);
  assert.match(swift, /window\.isReleasedWhenClosed = false/);
  assert.match(swift, /NSFont\.systemFont/);
  assert.match(swift, /\.secondaryLabelColor/);
  assert.match(swift, /setAccessibilityLabel\("Control Center sections"\)/);
  assert.match(swift, /setAccessibilityLabel\("Effective MCP servers"\)/);
  assert.match(swift, /button\.setAccessibilityLabel\(title\)/);
  assert.doesNotMatch(swift, /runModal\s*\(/);
  assert.doesNotMatch(swift, /NSAnimationContext|animator\(\)/);
  assert.match(swift, /accessibilityDisplayShouldReduceMotion/);
});

test('Overview renders every release work-order health field from bounded local commands', () => {
  const swift = source();
  for (const field of ['SKS:', 'Codex CLI:', 'Codex app:', 'Menu Bar:', 'Updates:', 'MCP:', 'Telegram Hub:', 'Connected Macs:', 'Last operation:']) {
    assert.match(swift, new RegExp(field));
  }
  assert.match(swift, /\["telegram", "status", "--project-root", AppRuntime\.projectRoot, "--json"\]/);
  assert.match(swift, /\["mcp", "config", "list", "--scope", "effective", "--json"\]/);
  assert.match(swift, /func latestSnapshot\(\) -> OperationSnapshot\?/);
});

test('status item is concise and applies the documented integrity-to-healthy priority', () => {
  const swift = source();
  for (const item of [
    'Open SKS Control Center…', 'Open Dashboard', 'Pending approvals (0)',
    'Check for Updates', 'View Last Operation', 'Quit SKS Menu'
  ]) assert.match(swift, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(swift, /enum SKSStatusIcon \{\s*case healthy, working, attention, updateAvailable, warning\s*\}/);
  const priority = [
    'if integrityBroken', 'else if operationFailed',
    'else if actionRequired || notificationAuthorizationDenied',
    'else if sksUpdate || codexUpdate', 'else if operationRunning',
    'else { icon = .healthy'
  ].map((needle) => swift.indexOf(needle));
  assert.ok(priority.every((index) => index >= 0));
  assert.deepEqual(priority, [...priority].sort((a, b) => a - b));
  assert.match(swift, /NSImage\(systemSymbolName: symbol, accessibilityDescription: "SKS status"\)/);
  assert.match(swift, /SKSStatusWarningTemplate/);
  assert.doesNotMatch(swift, /SKS [↑⚠⬆⋯]/);
});

test('app identity, alert identity, and Info.plist icon contract are explicit', () => {
  const swift = source();
  const plist = infoPlistSource('6.3.0');
  assert.match(swift, /Bundle\.main\.url\(forResource: "AppIcon", withExtension: "icns"\)/);
  assert.match(swift, /NSApplication\.shared\.applicationIconImage = image/);
  assert.match(swift, /alert\.icon = NSApplication\.shared\.applicationIconImage/);
  assert.match(plist, /<key>CFBundleIconFile<\/key>\s*<string>AppIcon<\/string>/);
  assert.match(plist, /<key>CFBundleDisplayName<\/key>\s*<string>SKS<\/string>/);
  assert.match(plist, /<key>LSUIElement<\/key>\s*<true\/>/);
  assert.match(plist, /<key>CFBundleShortVersionString<\/key>\s*<string>6\.3\.0<\/string>/);
});

test('confirmation and input flows use sheets and never nest modal loops', () => {
  const swift = source();
  assert.match(swift, /alert\.beginSheetModal\(for: window\)/);
  assert.match(swift, /NSSecureTextField/);
  assert.match(swift, /destructive \? "Remove" : "Continue"/);
  assert.doesNotMatch(swift, /NSApp\.runModal|runModal\s*\(/);
  assert.doesNotMatch(swift, /tell application "Terminal"|runInTerminal|runSksInTerminal/);
});

test('Providers saves Codex LB keys through secure stdin', () => {
  const providers = fs.readFileSync(path.join(resolvePackagedMenuBarSourceRoot(), 'Sources', 'ProvidersViewController.swift'), 'utf8');
  assert.match(providers, /Set Domain and Key…/);
  assert.match(providers, /Replace Key…/);
  assert.match(providers, /secure: true/);
  assert.match(providers, /"--api-key-stdin"/);
  assert.match(providers, /stdin: key \+ "\\n"/);
  assert.doesNotMatch(providers, /"--api-key",\s*key/);
});

test('operation coordinator persists redacted bounded-tail receipts and excludes concurrent mutations', () => {
  const swift = source();
  for (const state of ['queued', 'running', 'waitingForConfirmation', 'succeeded', 'failed', 'cancelled', 'terminalUncertain']) {
    assert.match(swift, new RegExp(`\\b${state}\\b`));
  }
  assert.match(swift, /schema: "sks\.operation\.v1"/);
  assert.match(swift, /\.posixPermissions: 0o600/);
  assert.match(swift, /Data\(data\.suffix\(self\.outputLimit\)\)/);
  assert.match(swift, /private var activeMutation: \(id: String, group: String\)\?/);
  assert.match(swift, /if mutationGroup != nil, activeMutation != nil \{ return nil \}/);
  assert.match(swift, /if activeMutation\?\.id == snapshot\.id \{ activeMutation = nil \}/);
  assert.match(swift, /redact\(command\.joined\(separator: " "\)\)/);
  assert.match(swift, /64 \* 1024/);
});

test('UserNotifications declares all categories/actions, redacts public bodies, and surfaces denial without failing operations', () => {
  const swift = source();
  for (const category of ['SKS_OPERATION_RESULT', 'SKS_UPDATE_AVAILABLE', 'SKS_ACTION_REQUIRED']) assert.match(swift, new RegExp(category));
  for (const action of ['OPEN_CONTROL_CENTER', 'OPEN_LOG', 'RETRY_OPERATION', 'OPEN_DASHBOARD']) assert.match(swift, new RegExp(action));
  assert.match(swift, /UNUserNotificationCenterDelegate/);
  assert.match(swift, /getNotificationSettings/);
  assert.match(swift, /authorizationIsDenied\(settings\.authorizationStatus\)/);
  assert.match(swift, /func dispatchActionIdentifier\(_ identifier: String\) -> String/);
  assert.match(swift, /case UNNotificationDismissActionIdentifier: return "dismissed"/);
  assert.match(swift, /Notifications require attention/);
  assert.match(swift, /permission denied — operation results remain available in this Control Center inbox/);
  assert.match(swift, /api\[_-\]\?key\|secret\|token\|authorization/);
  assert.match(swift, /replacingOccurrences\(of: home, with: "~"\)/);
  assert.doesNotMatch(swift, /display notification|osascript/);
});

test('Remote and Telegram page uses the dedicated readiness contracts', () => {
  const swift = source();
  assert.match(swift, /\["remote", "readiness", "--project-root", AppRuntime\.projectRoot, "--json"\]/);
  assert.match(swift, /\["telegram", "status", "--project-root", AppRuntime\.projectRoot, "--json"\]/);
  assert.match(swift, /Official Remote compatibility:/);
  assert.doesNotMatch(swift, /Mini App:|mini_app/);
  assert.doesNotMatch(swift, /\["codex-app", "status", "--json"\]/);
});

test('MCP Control Center exposes scoped CRUD, health, OAuth, backups, policy editing, and redacted review without raw secret entry', () => {
  const swift = source();
  assert.match(swift, /scopePopup\.addItems\(withTitles: \["Effective", "Global", "Project"\]\)/);
  assert.match(swift, /\["mcp", "config", "list", "--scope", scope\] \+ scopeContext\(scope, mutation: false\) \+ \["--json"\]/);
  assert.match(swift, /\["mcp", "config", "add", "--scope", draft\.scope\].*\["--stdin-json", "--json"\]/s);
  assert.match(swift, /\["mcp", "config", "edit", selection\.row\.name, "--scope", selection\.row\.scope\].*\["--stdin-json", "--json"\]/s);
  assert.match(swift, /\["mcp", "config", "duplicate", selection\.row\.name, "--new-name", name, "--scope", selection\.row\.scope\]/);
  assert.match(swift, /\["mcp", "config", action, selection\.row\.name, "--scope", selection\.row\.scope\]/);
  assert.match(swift, /\["mcp", "config", "remove", selection\.row\.name, "--scope", selection\.row\.scope\]/);
  assert.match(swift, /\["mcp", "config", "test", selection\.row\.name, "--scope", selection\.row\.scope\]/);
  assert.match(swift, /let action = selection\.row\.authenticated == true \? "logout" : "login"/);
  assert.match(swift, /\["mcp", "config", "backups", "--scope", scope\]/);
  assert.match(swift, /\["mcp", "config", "restore", id, "--scope", scope\]/);
  assert.match(swift, /\["--project-root", AppRuntime\.projectRoot, "--trusted-project"\]/);
  assert.match(swift, /args\.append\("--confirm-project"\)/);
  for (const label of ['Add…', 'Edit…', 'Duplicate…', 'Enable/Disable', 'Remove', 'Test Connection', 'OAuth Login/Logout', 'Backups…']) {
    assert.match(swift, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const field of ['startup_timeout_sec', 'tool_timeout_sec', 'enabled_tools', 'disabled_tools', 'default_tools_approval_mode', 'required']) {
    assert.match(swift, new RegExp(field));
  }
  assert.match(swift, /Review is required before Apply/);
  assert.match(swift, /No secret values are included/);
  assert.match(swift, /environment-variable names only/);
  assert.match(swift, /oauthButton\.isEnabled = .*streamable-http/s);
  assert.match(swift, /guard selectedScope\(\) != "effective"/);
  assert.match(swift, /writableScopeForBackup\(\).*global.*project/s);
  assert.match(swift, /NSEvent\.addLocalMonitorForEvents\(matching: \.keyDown\)/);
  assert.match(swift, /event\.keyCode == 53/);
  assert.doesNotMatch(swift, /KEY=VALUE/);
});

test('update UI reads the v3 snapshot and refreshes only through explicit refresh commands', () => {
  const swift = source();
  assert.match(swift, /\.sneakoscope-global\/cache\/update-status\.json/);
  assert.match(swift, /\["update", "status", "--json"\]/);
  assert.match(swift, /\["update", "status", "--refresh", "--json"\]/);
  assert.match(swift, /\["update", "review", "--json"\]/);
  assert.match(swift, /\["update", "now", "--json"\]/);
  assert.match(swift, /Timer\.scheduledTimer\(withTimeInterval: 30, repeats: true\).*refreshLocalState\(\)/s);
  assert.match(swift, /Rollback guidance and the previous Menu Bar app remain available/);
  assert.match(swift, /No success state was assumed/);
});

test('Menu Bar action runner executes from HOME and prefers the pinned package entry', () => {
  const script = actionScriptSource({ nodeBin: '/usr/bin/node', sksEntry: '/opt/sneakoscope/dist/bin/sks.js' });
  const homeCd = script.indexOf('cd "$HOME" 2>/dev/null || true');
  const migrationGate = script.indexOf('export SKS_UPDATE_MIGRATION_GATE_DISABLED=1');
  const pinned = script.indexOf('run_node_entry "$SKS_ENTRY" "$@"');
  const pathLookup = script.indexOf('command -v sks');
  const npmLookup = script.indexOf('npm root -g');
  assert.ok(homeCd >= 0 && migrationGate > homeCd && pinned > migrationGate);
  assert.ok(pinned < pathLookup && pinned < npmLookup);
  assert.equal(script.lastIndexOf('run_node_entry "$SKS_ENTRY" "$@"'), pinned);
  assert.match(script, /\.nvm\/versions\/node\/\*\/lib\/node_modules\/sneakoscope\/dist\/bin\/sks\.js/);
});

test('build stamp carries aggregate and per-file source/resource integrity', () => {
  const runtime = {
    actionScriptPath: '/tmp/action', buildStampPath: '/tmp/stamp', configPath: '/tmp/config',
    lastActionLogPath: '/tmp/log', operationDirPath: '/tmp/operations',
    codexBundleId: null, packageVersion: '6.3.0'
  };
  const sourceHashes = Object.fromEntries(loadNativeMenuBarSources(runtime).map((entry) => [entry.name, entry.sha256]));
  const resourceHashes = nativeResourceHashes();
  const stamp = createSksMenuBarBuildStamp({
    packageVersion: '6.3.0', sourceHashes, resourceHashes,
    actionScriptSha256: 'a', infoPlistSha256: 'b', launchAgentSha256: 'c',
    swiftcVersion: 'swift', codesignIdentifier: 'com.sneakoscope.sks-menubar'
  });
  assert.equal(stamp.source_sha256, aggregateFileHashes(sourceHashes));
  assert.equal(stamp.resources_sha256, aggregateFileHashes(resourceHashes));
  assert.equal(Object.keys(stamp.source_files_sha256).length, NATIVE_SOURCE_FILES.length);
  assert.equal(Object.keys(stamp.resource_files_sha256).length, NATIVE_RESOURCE_FILES.length);
  assert.ok(Object.values(stamp.resource_files_sha256).every((digest) => /^[a-f0-9]{64}$/.test(digest)));
});

test('action integrity detects drift even when the pinned target remains runnable', () => {
  const script = actionScriptSource({ nodeBin: '/usr/bin/node', sksEntry: '/opt/sneakoscope/dist/bin/sks.js' });
  const expected = sha256(script);
  assert.deepEqual(evaluateActionScriptIntegrity(script, { action_script_sha256: expected }), {
    script_sha256: expected,
    expected_script_sha256: expected,
    script_hash_matches_stamp: true
  });
  assert.equal(evaluateActionScriptIntegrity(`${script}# drift\n`, { action_script_sha256: expected }).script_hash_matches_stamp, false);
  assert.equal(evaluateActionScriptIntegrity(script, null).script_hash_matches_stamp, false);
});

test('all split files remain inside the release line budgets', () => {
  const root = resolvePackagedMenuBarSourceRoot();
  for (const name of NATIVE_SOURCE_FILES) {
    const lines = fs.readFileSync(path.join(root, 'Sources', name), 'utf8').split(/\r?\n/).length;
    assert.ok(lines <= (name === 'AppDelegate.swift' ? 250 : 500), `${name}: ${lines}`);
  }
});
