import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { repairComputerUse, DOCTOR_COMPUTER_USE_REPAIR_SCHEMA } from '../computer-use-repair.js';

async function scratchRoot(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-computer-use-repair-'));
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

// A deterministic, guaranteed-nonexistent path. Passed explicitly (never null/undefined) so
// the repair function's `input.codexBin || await which('codex')` fallback can never resolve
// to a REAL, machine-wide codex binary that might happen to be on this runner's PATH.
function fakeCodexBin(root: string): string {
  return path.join(root, 'no-such-codex-binary');
}

const blockedPluginRepair = async () => ({
  ok: false,
  changed: false,
  installs: [],
  blockers: ['codex_plugin_not_ready_after_recheck:computer-use@openai-bundled'],
  next_actions: []
});

// A fake `codex` that records every invocation, so a test can prove which subcommands the repair ran.
async function recordingFakeCodex(root: string): Promise<{ bin: string; calls: () => Promise<string> }> {
  const bin = path.join(root, 'codex');
  const log = path.join(root, 'codex-calls.txt');
  await fs.writeFile(bin, `#!/bin/sh\necho "$@" >> ${JSON.stringify(log)}\nif [ "$1" = "--version" ]; then echo "codex-cli 0.159.2"; fi\nexit 0\n`, { mode: 0o755 });
  return { bin, calls: async () => fs.readFile(log, 'utf8').catch(() => '') };
}

test('repairComputerUse detect-only (apply=false) probes twice and has no feature-enable step', async () => {
  const { root, cleanup } = await scratchRoot();
  try {
    let calls = 0;
    const probe = async () => {
      calls += 1;
      return { ok: false, status: 'codex_app_capability_missing', blockers: ['codex_app_capability_missing'] };
    };
    const report = await repairComputerUse({ root, apply: false, reportPath: null, probe, codexBin: fakeCodexBin(root), pluginRepair: blockedPluginRepair as any });
    assert.equal(report.schema, DOCTOR_COMPUTER_USE_REPAIR_SCHEMA);
    assert.equal(report.apply, false);
    assert.equal(report.ok, false);
    assert.equal(report.recovered, false);
    assert.equal(calls, 2, 'probe should run once before and once after even when apply=false');
    assert.equal(report.steps.some((s: any) => /feature_enable/.test(s.id)), false);
  } finally {
    await cleanup();
  }
});

test('repairComputerUse apply=true never runs codex features enable (it would flip a user opt-out) and recovers through the plugin repair', async () => {
  const { root, cleanup } = await scratchRoot();
  try {
    const codex = await recordingFakeCodex(root);
    let call = 0;
    const probe = async () => {
      call += 1;
      if (call === 1) return { ok: false, status: 'codex_app_capability_missing', blockers: ['codex_app_capability_missing'] };
      return { ok: true, status: 'available', source: 'codex-feature-flag' };
    };
    const report = await repairComputerUse({
      root,
      apply: true,
      reportPath: null,
      probe,
      codexBin: codex.bin,
      pluginRepair: async () => ({ ok: true, changed: true, requires_new_task: true, installs: [{ ok: true }], blockers: [], next_actions: ['Start a new Codex/Work task.'] }) as any
    });
    assert.equal(report.ok, true);
    assert.equal(report.recovered, true);
    assert.equal(report.before.status, 'codex_app_capability_missing');
    assert.equal(report.after.status, 'available');
    assert.deepEqual(report.blockers, []);
    assert.equal(report.steps.some((s: any) => /feature_enable/.test(s.id)), false);
    const calls = await codex.calls();
    assert.match(calls, /^--version$/m);
    assert.doesNotMatch(calls, /features enable/);
  } finally {
    await cleanup();
  }
});

test('repairComputerUse leaves a switched-off computer_use flag alone and tells the user how to re-enable it', async () => {
  const { root, cleanup } = await scratchRoot();
  try {
    const codex = await recordingFakeCodex(root);
    const probe = async () => ({ ok: false, status: 'codex_app_capability_missing', blockers: ['codex_app_capability_missing'] });
    const report = await repairComputerUse({ root, apply: true, reportPath: null, probe, codexBin: codex.bin, pluginRepair: blockedPluginRepair as any });
    assert.equal(report.recovered, false);
    assert.doesNotMatch(await codex.calls(), /features enable/);
    assert.ok(report.next_actions.some((line: string) => /run `codex features enable computer_use` yourself/.test(line)));
  } finally {
    await cleanup();
  }
});

test('repairComputerUse records the official plugin add repair and post-install task refresh contract', async () => {
  const { root, cleanup } = await scratchRoot();
  try {
    const probe = async () => ({ ok: false, status: 'codex_app_missing', blockers: ['codex_app_missing'] });
    const report = await repairComputerUse({
      root,
      apply: true,
      reportPath: null,
      probe,
      codexBin: fakeCodexBin(root),
      pluginRepair: async () => ({
        ok: true,
        changed: true,
        requires_new_task: true,
        installs: [{ plugin_id: 'computer-use@openai-bundled', ok: true }],
        blockers: [],
        next_actions: ['Start a new Codex/Work task.']
      }) as any
    });
    assert.equal(report.recovered, false);
    const pluginStep = report.steps.find((s: any) => s.id === 'computer_use_plugin_repair');
    assert.equal(pluginStep.attempted, true);
    assert.equal(pluginStep.ok, true);
    assert.equal(pluginStep.blocker, null);
    assert.match(pluginStep.command, /plugin add computer-use@openai-bundled --json/);
    assert.equal(report.requires_new_task, true);
    assert.ok(report.next_actions.some((line: string) => /new Codex\/Work task/.test(line)));
  } finally {
    await cleanup();
  }
});

test('repairComputerUse without any codex binary leaves plugin installation unattempted and blocked', async () => {
  const { root, cleanup } = await scratchRoot();
  const previousPath = process.env.PATH;
  try {
    // Empty PATH guarantees `which('codex')` cannot resolve a real, machine-wide binary.
    process.env.PATH = '';
    const probe = async () => ({ ok: false, status: 'codex_app_missing', blockers: ['codex_app_missing'] });
    const report = await repairComputerUse({ root, apply: true, reportPath: null, probe, codexBin: null, pluginRepair: blockedPluginRepair as any });
    assert.equal(report.recovered, false);
    const pluginStep = report.steps.find((s: any) => s.id === 'computer_use_plugin_repair');
    assert.equal(pluginStep.attempted, false, 'no codex binary available, so plugin installation cannot run');
    assert.match(pluginStep.blocker, /codex_plugin_not_ready_after_recheck/);
  } finally {
    process.env.PATH = previousPath;
    await cleanup();
  }
});

test('repairComputerUse writes an atomic report file when reportPath is not null', async () => {
  const { root, cleanup } = await scratchRoot();
  try {
    const probe = async () => ({ ok: true, status: 'available' });
    const reportPath = path.join(root, '.sneakoscope', 'reports', 'doctor-computer-use-repair.json');
    const report = await repairComputerUse({ root, apply: false, reportPath, probe, codexBin: fakeCodexBin(root) });
    assert.equal(report.report_path, reportPath);
    const written = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(written.schema, DOCTOR_COMPUTER_USE_REPAIR_SCHEMA);
    assert.equal(written.recovered, true);
  } finally {
    await cleanup();
  }
});

test('repairComputerUse already-available state does not attempt any repair steps', async () => {
  const { root, cleanup } = await scratchRoot();
  try {
    const probe = async () => ({ ok: true, status: 'available', source: 'codex-app-mcp' });
    const report = await repairComputerUse({ root, apply: true, reportPath: null, probe, codexBin: fakeCodexBin(root) });
    assert.equal(report.attempted, false);
    assert.equal(report.recovered, true);
    assert.equal(report.steps.some((s: any) => /feature_enable/.test(s.id)), false);
  } finally {
    await cleanup();
  }
});
