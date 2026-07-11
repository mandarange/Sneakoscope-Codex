import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DOCTOR_BROWSER_USE_REPAIR_SCHEMA, repairBrowserUse } from '../browser-use-repair.js';

const READY_STATUS = {
  schema: 'sks.codex-chrome-extension-status.v1',
  ok: true,
  status: 'available',
  blockers: [] as string[],
  plugin: { installed: true, enabled: true, id: 'chrome@openai-bundled', cache_detected: true },
  required_flags: ['browser_use_external', 'plugins', 'apps'],
  guidance: ['Codex Chrome Extension path is ready for web/browser/webapp verification.']
};

const MISSING_STATUS = {
  schema: 'sks.codex-chrome-extension-status.v1',
  ok: false,
  status: 'setup_required',
  blockers: ['browser_use_external_feature_missing', 'chrome_extension_plugin_missing'],
  plugin: { installed: false, enabled: false, id: 'chrome@openai-bundled', cache_detected: false },
  required_flags: ['browser_use_external', 'plugins', 'apps'],
  guidance: ['Install and enable the Codex Chrome Extension first.']
};

const blockedPluginRepair = async () => ({
  ok: false,
  changed: false,
  installs: [],
  blockers: ['codex_plugin_not_ready_after_recheck:chrome@openai-bundled'],
  next_actions: []
});

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sks-browser-use-repair-'));
}

test('repairBrowserUse reports ok:true and no blockers when detection already shows the extension ready', async () => {
  const root = await tempRoot();
  const report = await repairBrowserUse({
    root,
    apply: false,
    reportPath: null,
    codexBin: '/nonexistent/codex-bin-for-tests',
    detectChromeExtensionStatus: async () => ({ ...READY_STATUS }),
    nodeReplRepair: async () => ({ ok: true, blockers: [] })
  });
  assert.equal(report.schema, DOCTOR_BROWSER_USE_REPAIR_SCHEMA);
  assert.equal(report.ok, true);
  assert.equal(report.recovered, true);
  assert.equal(report.capability_ready, true);
  assert.equal(report.route_ready, false);
  assert.equal(report.real_browser_interaction_verified, false);
  assert.deepEqual(report.completion_blockers, ['codex_browser_real_interaction_unverified']);
  assert.equal(report.current_task_tool_manifest_verified, false);
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.next_actions, []);
  const optionalStep = report.steps.find((step: any) => step.id === 'in_app_browser_feature_enable');
  assert.equal(optionalStep.ok, false, 'Chrome readiness alone must not claim an optional native flag is enabled');
  assert.equal(optionalStep.status, 'detect_only');
});

test('repairBrowserUse attempts the supported in_app_browser and browser_use feature flags', async () => {
  const root = await tempRoot();
  try {
    const callsPath = path.join(root, 'feature-calls.txt');
    const codexBin = await writeFakeCodex(root, callsPath, []);
    let detection = 0;
    const report = await repairBrowserUse({
      root,
      apply: true,
      reportPath: null,
      codexBin,
      detectChromeExtensionStatus: async () => detection++ === 0 ? { ...MISSING_STATUS } : { ...READY_STATUS },
      pluginRepair: async () => ({ ok: true, changed: false, installs: [], blockers: [], next_actions: [] }) as any,
      nodeReplRepair: async () => ({ ok: true, blockers: [] })
    });
    const calls = await fs.readFile(callsPath, 'utf8');
    assert.match(calls, /^features enable in_app_browser$/m);
    assert.match(calls, /^features enable browser_use$/m);
    for (const id of ['in_app_browser_feature_enable', 'browser_use_feature_enable']) {
      const step = report.steps.find((candidate: any) => candidate.id === id);
      assert.equal(step.attempted, true);
      assert.equal(step.ok, true);
      assert.equal(step.status, 'enabled');
    }
    assert.deepEqual(report.optional_feature_enablement_blockers, []);
    assert.equal(report.capability_ready, true);
    assert.equal(report.route_ready, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('repairBrowserUse records a rejected optional flag without fabricating feature success', async () => {
  const root = await tempRoot();
  try {
    const codexBin = await writeFakeCodex(root, path.join(root, 'feature-calls.txt'), ['in_app_browser']);
    let detection = 0;
    const report = await repairBrowserUse({
      root,
      apply: true,
      reportPath: null,
      codexBin,
      detectChromeExtensionStatus: async () => detection++ === 0 ? { ...MISSING_STATUS } : { ...READY_STATUS },
      pluginRepair: async () => ({ ok: true, changed: false, installs: [], blockers: [], next_actions: [] }) as any,
      nodeReplRepair: async () => ({ ok: true, blockers: [] })
    });
    const rejected = report.steps.find((candidate: any) => candidate.id === 'in_app_browser_feature_enable');
    assert.equal(rejected.attempted, true);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 'unsupported_or_failed');
    assert.equal(rejected.blocker, 'codex_feature_enable_unsupported_or_failed');
    assert.deepEqual(report.optional_feature_enablement_blockers, [
      'in_app_browser_feature_enable:codex_feature_enable_unsupported_or_failed'
    ]);
    assert.equal(report.capability_ready, true, 'the independent Chrome capability may still be configured');
    assert.equal(report.route_ready, false, 'configuration never becomes live interaction proof');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('repairBrowserUse never reports ok:true when the Chrome extension itself is missing, and surfaces the manual-install blocker', async () => {
  const root = await tempRoot();
  let nodeReplCalls = 0;
  const report = await repairBrowserUse({
    root,
    apply: true,
    reportPath: null,
    codexBin: '/nonexistent/codex-bin-for-tests',
    detectChromeExtensionStatus: async () => ({ ...MISSING_STATUS }),
    pluginRepair: blockedPluginRepair as any,
    nodeReplRepair: async () => {
      nodeReplCalls += 1;
      return { ok: true, blockers: [] };
    }
  });
  assert.equal(report.ok, false);
  assert.equal(report.recovered, false);
  assert.ok(report.blockers.includes('chrome_extension_manual_install_required'));
  assert.ok(report.blockers.includes('chrome_extension_plugin_missing'));
  assert.ok(Array.isArray(report.next_actions) && report.next_actions.length > 0);
  assert.ok(report.next_actions.some((line: string) => /Codex Desktop app|Codex app settings/i.test(line)));
  assert.equal(nodeReplCalls, 1);
  const pluginStep = report.steps.find((step: any) => step.id === 'browser_chrome_plugin_repair');
  assert.ok(pluginStep);
  assert.equal(pluginStep.ok, false);
  assert.equal(pluginStep.status, 'blocked');
  assert.match(pluginStep.blocker, /codex_plugin_not_ready_after_recheck/);
});

test('repairBrowserUse without --apply does not attempt feature-enable or node_repl repair steps', async () => {
  const root = await tempRoot();
  let nodeReplCalls = 0;
  const report = await repairBrowserUse({
    root,
    apply: false,
    reportPath: null,
    codexBin: '/nonexistent/codex-bin-for-tests',
    detectChromeExtensionStatus: async () => ({ ...MISSING_STATUS }),
    pluginRepair: blockedPluginRepair as any,
    nodeReplRepair: async () => {
      nodeReplCalls += 1;
      return { ok: true, blockers: [] };
    }
  });
  assert.equal(report.apply, false);
  assert.equal(nodeReplCalls, 0);
  const nodeReplStep = report.steps.find((step: any) => step.id === 'node_repl_env_block_repair');
  assert.ok(nodeReplStep);
  assert.equal(nodeReplStep.attempted, false);
  assert.equal(nodeReplStep.blocker, 'doctor_fix_not_requested');
  const featureStep = report.steps.find((step: any) => step.id === 'browser_use_external_feature_enable');
  assert.ok(featureStep);
  assert.equal(featureStep.attempted, false);
});

test('repairBrowserUse writes an atomic report file when reportPath is provided', async () => {
  const root = await tempRoot();
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'doctor-browser-use-repair.json');
  const report = await repairBrowserUse({
    root,
    apply: false,
    reportPath,
    codexBin: '/nonexistent/codex-bin-for-tests',
    detectChromeExtensionStatus: async () => ({ ...MISSING_STATUS }),
    pluginRepair: blockedPluginRepair as any,
    nodeReplRepair: async () => ({ ok: true, blockers: [] })
  });
  assert.equal(report.report_path, reportPath);
  const onDisk = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(onDisk.schema, DOCTOR_BROWSER_USE_REPAIR_SCHEMA);
  assert.equal(onDisk.ok, false);
});

async function writeFakeCodex(root: string, callsPath: string, rejectedFlags: string[]): Promise<string> {
  const codexBin = path.join(root, 'codex');
  await fs.writeFile(codexBin, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(${JSON.stringify(callsPath)}, args + '\\n');
if (args.startsWith('features enable ')) {
  const flag = args.slice('features enable '.length);
  process.exit(${JSON.stringify(rejectedFlags)}.includes(flag) ? 64 : 0);
}
process.exit(args === '--version' ? 0 : 64);
`, { mode: 0o755 });
  return codexBin;
}
