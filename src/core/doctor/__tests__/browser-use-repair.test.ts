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
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.next_actions, []);
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
  const pluginStep = report.steps.find((step: any) => step.id === 'chrome_plugin_enable');
  assert.ok(pluginStep);
  assert.equal(pluginStep.ok, false);
  assert.equal(pluginStep.status, 'needs_more_info');
  assert.equal(pluginStep.blocker, 'chrome_plugin_enable_cli_subcommand_unknown');
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
    nodeReplRepair: async () => ({ ok: true, blockers: [] })
  });
  assert.equal(report.report_path, reportPath);
  const onDisk = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(onDisk.schema, DOCTOR_BROWSER_USE_REPAIR_SCHEMA);
  assert.equal(onDisk.ok, false);
});
