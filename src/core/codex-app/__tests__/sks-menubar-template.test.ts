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
