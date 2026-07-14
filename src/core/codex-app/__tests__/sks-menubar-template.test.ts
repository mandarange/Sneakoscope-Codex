import test from 'node:test';
import assert from 'node:assert/strict';
import { actionScriptSource, evaluateActionScriptIntegrity, swiftMenuSource } from '../sks-menubar.js';
import { sha256 } from '../../fsx.js';

function source(codexBundleId: string | null) {
  return swiftMenuSource({
    actionScriptPath: '/tmp/sks-menubar-action.sh',
    buildStampPath: '/tmp/build-stamp.json',
    configPath: '/tmp/config.json',
    lastActionLogPath: '/tmp/logs/last-action.log',
    codexBundleId,
    packageVersion: '5.2.0'
  });
}

test('SKS menu bar template injects Codex lifecycle observers when bundle id is known', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /let codexBundleId: String\? = "com\.openai\.codex"/);
  assert.match(swift, /NSWorkspace\.shared\.notificationCenter/);
  assert.match(swift, /didLaunchApplicationNotification/);
  assert.match(swift, /didTerminateApplicationNotification/);
  assert.match(swift, /NSWorkspace\.shared\.runningApplications/);
});

test('SKS menu bar template disables sync visibly when bundle id is missing', () => {
  const swift = source(null);
  assert.match(swift, /let codexBundleId: String\? = nil/);
  assert.match(swift, /Codex app not detected — sync disabled/);
  assert.doesNotMatch(swift, /didLaunchApplicationNotification/);
  assert.doesNotMatch(swift, /didTerminateApplicationNotification/);
});

test('SKS menu bar template uses native modal and background paths instead of Terminal handlers', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /func promptText\(title: String, message: String, placeholder: String = "", secure: Bool = false\)/);
  assert.match(swift, /NSSecureTextField/);
  assert.match(swift, /stdinText: key \+ "\\n"/);
  assert.match(swift, /lastActionLogPath/);
  assert.match(swift, /func runSksSilent\(_ args: \[String\]/);
  assert.doesNotMatch(swift, /runSksInTerminal/);
  assert.doesNotMatch(swift, /runInTerminal/);
  assert.doesNotMatch(swift, /tell application "Terminal"/);
});

test('SKS menu bar template guards process termination behind quitWithCodex and never terminates unconditionally on Codex quit', () => {
  const swift = source('com.openai.codex');
  // The only NSApplication.shared.terminate(nil) call reachable from the Codex
  // termination handler must be inside an `if quitWithCodex { ... }` branch,
  // with `setIconVisible(false)` as the else branch (hide-only, resident
  // process stays alive). A prior regression here would fully kill the
  // process on every Codex quit; since the LaunchAgent has RunAtLoad but no
  // KeepAlive, that process would then only come back at next login, not on
  // the next Codex relaunch.
  const terminatedHandlerMatch = swift.match(/@objc func workspaceAppTerminated\(_ notification: Notification\) \{[\s\S]*?\n    \}\n/);
  assert.ok(terminatedHandlerMatch, 'expected to find workspaceAppTerminated handler in generated Swift source');
  const handlerBody = terminatedHandlerMatch[0];
  assert.match(handlerBody, /if quitWithCodex \{\s*\n\s*NSApplication\.shared\.terminate\(nil\)\s*\n\s*\} else \{\s*\n\s*setIconVisible\(false\)\s*\n\s*\}/);

  // Outside that handler, the only other terminate(nil) call must be the
  // explicit user-initiated "Quit SKS Menu" action, not anything reachable
  // from the Codex lifecycle observers.
  const terminateCallSites = [...swift.matchAll(/NSApplication\.shared\.terminate\(nil\)/g)];
  assert.equal(terminateCallSites.length, 2, 'expected exactly two terminate(nil) call sites: guarded Codex-quit branch + explicit Quit SKS Menu action');
});

test('SKS menu bar template config default parses quitWithCodex as false when config file is missing or invalid', () => {
  const swift = source('com.openai.codex');
  const readConfigMatch = swift.match(/func readConfig\(\) -> MenuBarConfig \{[\s\S]*?\n    \}\n/);
  assert.ok(readConfigMatch, 'expected to find readConfig() in generated Swift source');
  const readConfigBody = readConfigMatch[0];
  // Missing file / unparsable JSON must fall back to quitWithCodex: false
  // (hide-only mode), never true (full termination mode).
  assert.match(readConfigBody, /return MenuBarConfig\(quitWithCodex: false\)/);
  // A present-but-non-boolean or missing key must also coerce to false via
  // the `== true` comparison rather than defaulting to true.
  assert.match(readConfigBody, /json\["quit_with_codex"\] as\? Bool == true/);
});

test('SKS menu bar template re-shows the status item through the same setIconVisible path used at initial launch, and reasserts Control Center visibility on show', () => {
  const swift = source('com.openai.codex');
  // Initial launch path.
  assert.match(swift, /func configureCodexLifecycleSync\(\) \{\s*\n\s*setIconVisible\(isCodexRunning\(\)\)/);
  // Re-show path on Codex relaunch must call the exact same function, not
  // reconstruct or directly poke statusItem from a separate code path.
  const launchedHandlerMatch = swift.match(/@objc func workspaceAppLaunched\(_ notification: Notification\) \{[\s\S]*?\n    \}\n/);
  assert.ok(launchedHandlerMatch, 'expected to find workspaceAppLaunched handler in generated Swift source');
  assert.match(launchedHandlerMatch[0], /setIconVisible\(true\)/);

  // setIconVisible itself must be the single choke point for visibility
  // changes, and showing (visible == true) must reassert the Control Center
  // "NSStatusItem Visible"/"VisibleCC" defaults for this app's label -
  // mirroring what installSksMenuBar's seedMenuBarPreferredPosition seeds at
  // install time. Without this, toggling NSStatusItem.isVisible back to true
  // inside the resident process is not guaranteed to make Control Center
  // re-render a previously hidden icon.
  const setIconVisibleMatches = [...swift.matchAll(/func setIconVisible\(_ visible: Bool\) \{[\s\S]*?\n    \}\n/g)];
  assert.ok(setIconVisibleMatches.length >= 1, 'expected at least one setIconVisible implementation');
  for (const match of setIconVisibleMatches) {
    assert.match(match[0], /statusItem\.isVisible = visible/);
    assert.match(match[0], /if visible \{\s*\n\s*reassertControlCenterVisibility\(\)\s*\n\s*\}/);
  }

  assert.match(swift, /func reassertControlCenterVisibility\(\) \{/);
  assert.match(swift, /NSStatusItem Visible \\\(menuBarLabel\)/);
  assert.match(swift, /NSStatusItem VisibleCC \\\(menuBarLabel\)/);
  assert.match(swift, /let menuBarLabel = "com\.sneakoscope\.sks-menubar"/);
  assert.match(swift, /let controlCenterDomain = "com\.apple\.controlcenter"/);
});

test('SKS menu bar template builds display notification via a fixed osascript argv script (no inline-string interpolation)', () => {
  const swift = source('com.openai.codex');
  // The body/title are passed as osascript argv against a fixed AppleScript
  // literal, so arbitrary command output (quotes, newlines) can never produce a
  // -2741 AppleScript syntax error.
  assert.match(swift, /on run argv\\ndisplay notification \(item 1 of argv\) with title \(item 2 of argv\)\\nend run/);
  assert.match(swift, /osascript", \["-e", script, clipped\(body\), title\]/);
  // The old shell-style single-quote helper misused for AppleScript is gone.
  assert.doesNotMatch(swift, /func shellQuote/);
  assert.doesNotMatch(swift, /display notification " \+ /);
});

test('SKS menu bar template codex-lb domain prompt uses a bare-domain placeholder, not the full backend-api suffixed URL', () => {
  const swift = source('com.openai.codex');
  const promptMatch = swift.match(/guard let domain = promptText\(title: "Set codex-lb Domain"[\s\S]*?\) else \{ return \}/);
  assert.ok(promptMatch, 'expected to find the Set codex-lb Domain prompt call');
  const promptCall = promptMatch[0];
  const placeholderMatch = promptCall.match(/placeholder: "([^"]*)"/);
  assert.ok(placeholderMatch, 'expected to find a placeholder value on the prompt call');
  // The placeholder (the example text shown inside the empty field) showing the
  // full "/backend-api/codex" suffixed form implies the user must type it
  // themselves, when normalizeCodexLbBaseUrl already appends it automatically
  // from a bare domain - showing the suffix there is actively misleading. The
  // message text above the field may still explain the suffix is auto-added.
  assert.doesNotMatch(placeholderMatch[1]!, /backend-api/);
  assert.equal(placeholderMatch[1]!, 'lb.example.com');
  assert.match(promptCall, /added automatically/);
});

test('SKS menu bar template humanizes sks command failure JSON instead of showing raw error codes', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /func humanizeSksFailure\(_ text: String\) -> String \{/);
  assert.match(swift, /func humanizeSksCode\(_ code: String\) -> String \{/);
  // The failure alert path must run output through the humanizer, not show the raw
  // JSON/blocker-code text directly.
  assert.match(swift, /showAlert\(title \+ " failed", informative: humanizeSksFailure\(redacted\)\)/);
  assert.doesNotMatch(swift, /showAlert\(title \+ " failed", informative: redacted\)/);
});

test('SKS menu bar template exposes Fast Mode on/off controls and status checkmarks', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /fastModeOnItem = add\(menu, "Fast Mode On", #selector\(fastModeOn\)\)/);
  assert.match(swift, /fastModeOffItem = add\(menu, "Fast Mode Off", #selector\(fastModeOff\)\)/);
  assert.match(swift, /runSksBackground\(\["fast-mode", "on", "--json"\], title: "Fast Mode On"\)/);
  assert.match(swift, /runSksBackground\(\["fast-mode", "off", "--json"\], title: "Fast Mode Off"\)/);
  assert.match(swift, /func updateFastModeChecks\(\) \{/);
  assert.match(swift, /runSksSilent\(\["fast-mode", "status", "--json"\]\)/);
  assert.match(swift, /json\["global"\] as\? \[String: Any\]/);
  assert.match(swift, /global\["on"\] as\? Bool/);
  assert.match(swift, /json\["fast_mode"\] as\? Bool == true/);
  assert.match(swift, /self\.fastModeOnItem\.state = projectFast && desktopFast \? \.on : \.off/);
  assert.match(swift, /self\.fastModeOffItem\.state = !projectFast && !desktopFast \? \.on : \.off/);
});

test('SKS menu bar template shows codex-lb as active only when selected/provider mode says so', () => {
  const swift = source('com.openai.codex');
  const checkMatch = swift.match(/func updateAuthModeChecks\(\) \{[\s\S]*?\n    \}\n\n    func updateFastModeChecks/);
  assert.ok(checkMatch, 'expected to find updateAuthModeChecks body');
  const body = checkMatch[0];
  assert.match(body, /runSksSilent\(\["codex-lb", "status", "--json"\]\)/);
  assert.match(body, /guard code == 0, let json = json else/);
  assert.match(body, /json\["selected"\] as\? Bool == true/);
  assert.match(body, /json\["provider_contract_ok"\] as\? Bool == true/);
  assert.match(body, /json\["auth_mode"\] as\? String/);
  assert.match(body, /self\.oauthItem\.state = oauthActive \? \.on : \.off/);
  assert.doesNotMatch(body, /"configured": true/);
});

test('SKS menu bar auth-changing actions restart Codex App after applying configuration', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /runSksBackground\(\["codex-lb", "use-codex-lb", "--restart-app", "--json"\], title: "Use codex-lb"\)/);
  assert.match(swift, /runSksBackground\(\["codex-lb", "use-oauth", "--restart-app", "--json"\], title: "Use ChatGPT OAuth"\)/);
  assert.match(swift, /runSksBackground\(\["codex-lb", "setup", "--host", domain, "--api-key-stdin", "--yes", "--restart-app", "--json"\], title: "Set codex-lb"/);
});

test('SKS menu bar reports unknown status as unchecked and delegates verified restarts', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /guard code == 0, let json = json else \{\s*self\.codexLbItem\.state = \.off\s*self\.oauthItem\.state = \.off/);
  assert.match(swift, /guard code == 0, let json = json else \{\s*self\.fastModeOnItem\.state = \.off\s*self\.fastModeOffItem\.state = \.off/);
  assert.match(swift, /runSksBackground\(\["codex-app", "restart", "--json"\], title: "Restart Codex"\)/);
  assert.match(swift, /set-openrouter-key", "--api-key-stdin", "--restart-app", "--json"/);
});

test('SKS menu bar waits for dashboard readiness and surfaces settings-open failures', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /func waitForDashboard\(_ urlString: String, attempts: Int\)/);
  assert.match(swift, /waitForDashboard\(urlString, attempts: 20\)/);
  assert.match(swift, /Dashboard did not become ready/);
  assert.match(swift, /showAlert\("Open Codex Settings failed"/);
});

test('SKS menu bar update badge prefers version comparison over a stale boolean cache', () => {
  const swift = source('com.openai.codex');
  const body = swift.match(/func updateAvailable\(\) -> Bool \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.ok(body.indexOf('latest_version') >= 0);
  assert.ok(body.indexOf('latest_version') < body.indexOf('update_available'));
  assert.match(body, /latest\.compare\(packageVersion, options: \.numeric\) == \.orderedDescending/);
});

test('SKS menu bar shows Codex CLI version, update indicator/action, and doctor fix action', () => {
  const swift = source('com.openai.codex');
  const statusBody = swift.match(/func updateCodexCliStatus\(refresh: Bool = false\) \{[\s\S]*?\n    \}\n\n    func markCodexCliStatusUnavailable/)?.[0] || '';
  const unavailableBody = swift.match(/func markCodexCliStatusUnavailable\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
  const updateBody = swift.match(/@objc func updateCodexCliNow\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(swift, /codexCliVersionItem = NSMenuItem\(title: "Codex CLI: checking…"/);
  assert.match(swift, /codexCliUpdateItem = add\(menu, "Update Codex CLI Now", #selector\(updateCodexCliNow\)\)/);
  assert.match(swift, /add\(menu, "Run sks doctor --fix", #selector\(runDoctorFix\)\)/);
  assert.match(swift, /runSksSilent\(args\)/);
  assert.match(swift, /\["codex", "update-status", "--json"\]/);
  assert.match(swift, /runSksBackground\(\["codex", "update", "--json"\], title: "Update Codex CLI Now"\)/);
  assert.match(swift, /runSksBackground\(\["doctor", "--fix", "--global-only", "--json"\], title: "Run sks doctor --fix"\)/);
  assert.match(swift, /MenuState\(title: "SKS ⬆", line: "SKS v\\\(packageVersion\) · Codex CLI/);
  assert.match(swift, /self\.codexCliUpdateItem\.title = updateAvailable \? "Update Codex CLI Now  ⬆"/);
  assert.match(statusBody, /json\["schema"\] as\? String == "sks\.codex-cli-update-status\.v1"/);
  assert.match(statusBody, /code == 0 \|\| \(!ok && !installed && status == "missing"\)/);
  assert.match(statusBody, /self\.markCodexCliStatusUnavailable\(\)/);
  assert.match(statusBody, /status == "update_check_unavailable"/);
  assert.match(swift, /var codexCliStatusRequestGeneration = 0/);
  assert.match(statusBody, /codexCliStatusRequestGeneration \+= 1/);
  assert.match(statusBody, /let requestGeneration = codexCliStatusRequestGeneration/);
  assert.match(statusBody, /guard self\.codexCliStatusRequestGeneration == requestGeneration else \{ return \}/);
  assert.match(unavailableBody, /codexCliCurrentVersion = nil/);
  assert.match(unavailableBody, /codexCliLatestVersion = nil/);
  assert.match(unavailableBody, /codexCliStatusUnavailable = true/);
  assert.match(swift, /Codex CLI\\\(current\) status unavailable/);
  assert.match(updateBody, /runSksBackground\(\["codex", "update", "--json"\], title: "Update Codex CLI Now"\)/);
  assert.doesNotMatch(updateBody, /runProcess\([^\n]*codex[^\n]*update/i);
});

test('SKS menu bar exposes a native modal MCP manager with functional add, remove, and enable controls', () => {
  const swift = source('com.openai.codex');
  assert.match(swift, /add\(menu, "Manage MCP Servers…", #selector\(manageMcpServers\)\)/);
  assert.match(swift, /final class McpManagerController: NSObject, NSWindowDelegate, NSTableViewDataSource, NSTableViewDelegate/);
  assert.match(swift, /NSApp\.runModal\(for: panel\)/);
  assert.match(swift, /makeButton\("Add…", #selector\(addServer\)\)/);
  assert.match(swift, /makeButton\("Remove", #selector\(removeServer\)\)/);
  assert.match(swift, /makeButton\("Disable", #selector\(toggleServer\)\)/);
  assert.match(swift, /runSksSilent\(\["menubar", "mcp", "list", "--json"\]\)/);
  assert.match(swift, /\["menubar", "mcp", "add", "--stdin-json", "--json"\]/);
  assert.match(swift, /\["menubar", "mcp", "remove", server\.name, "--json"\]/);
  assert.match(swift, /\["menubar", "mcp", action, server\.name, "--json"\]/);
  assert.match(swift, /Changes are written safely to ~\/\.codex\/config\.toml/);
  assert.match(swift, /Values are written only to Codex config and never shown in the MCP list/);
  assert.match(swift, /DispatchQueue\.global\(qos: \.utility\)\.async/);
  assert.ok(swift.indexOf('readDataToEndOfFile()') < swift.indexOf('process.waitUntilExit()'));
  assert.doesNotMatch(swift, /process\.terminationHandler[\s\S]*readDataToEndOfFile/);
});

test('SKS menu bar actions run from global HOME scope instead of an arbitrary project', () => {
  const script = actionScriptSource({ nodeBin: '/usr/bin/node', sksEntry: '/opt/sneakoscope/dist/bin/sks.js' });
  const homeCd = script.indexOf('cd "$HOME" 2>/dev/null || true');
  const migrationGate = script.indexOf('export SKS_UPDATE_MIGRATION_GATE_DISABLED=1');
  const pinnedEntry = script.indexOf('run_node_entry "$SKS_ENTRY" "$@"');
  const prependNodeBin = script.indexOf('export PATH="$node_bin_dir:$PATH"');
  assert.ok(homeCd >= 0, 'menu actions must start from HOME');
  assert.ok(migrationGate > homeCd, 'global menu actions must disable project migration repair');
  assert.ok(prependNodeBin > migrationGate, 'resolved NVM/global Node bin must be available to Codex/npm child resolution');
  assert.ok(pinnedEntry > migrationGate, 'scope must be established before any SKS action executes');
});

test('SKS menu bar action script prefers its pinned package entry over stale PATH/global copies', () => {
  const script = actionScriptSource({ nodeBin: '/usr/bin/node', sksEntry: '/opt/sneakoscope/dist/bin/sks.js' });
  const pinned = script.indexOf('run_node_entry "$SKS_ENTRY" "$@"');
  const pathLookup = script.indexOf("command -v sks");
  const npmLookup = script.indexOf("npm root -g");
  assert.ok(pinned >= 0);
  assert.ok(pinned < pathLookup);
  assert.ok(pinned < npmLookup);
  assert.equal(script.lastIndexOf('run_node_entry "$SKS_ENTRY" "$@"'), pinned);
});

test('SKS menu bar action integrity detects content drift even when the pinned version can still run', () => {
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
