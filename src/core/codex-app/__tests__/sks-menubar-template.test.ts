import test from 'node:test';
import assert from 'node:assert/strict';
import { swiftMenuSource } from '../sks-menubar.js';

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
