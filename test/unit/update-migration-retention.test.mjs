import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('project update migration receipt cleans disposable closed-mission runtime sessions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-retention-unit-'));
  const globalRoot = path.join(root, 'global');
  const previousGlobalRoot = process.env.SKS_GLOBAL_ROOT;
  process.env.SKS_GLOBAL_ROOT = globalRoot;
  try {
    const { writeProjectUpdateMigrationReceipt } = await import('../../dist/core/update/update-migration-state.js');
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-done');
    await writeJson(path.join(mission, 'completion-proof.json'), { status: 'verified', blockers: [] });
    await writeJson(path.join(mission, 'agents', 'agent-proof-evidence.json'), { ok: true });
    await writeText(path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'large sdk cache');
    const terminal = path.join(root, '.sneakoscope', 'missions', 'M-blocked-terminal');
    await writeJson(path.join(terminal, 'completion-proof.json'), { status: 'blocked', blockers: ['fixture_blocker'] });
    await writeJson(path.join(terminal, 'agents', 'agent-session-cleanup.json'), { all_sessions_terminal: true, terminal_session_count: 1, total_sessions: 1 });
    await writeText(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'worker-result.json'), '{"status":"blocked"}\n');
    await writeText(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'terminal sdk cache');

    const receipt = await writeProjectUpdateMigrationReceipt({
      root,
      source: 'unit-update-retention',
      blockers: [],
      warnings: []
    });

    assert.equal(receipt.retention_cleanup?.status, 'completed');
    assert.ok((receipt.retention_cleanup?.action_count || 0) > 0);
    await assertExists(path.join(mission, 'completion-proof.json'));
    await assertExists(path.join(mission, 'agents', 'agent-proof-evidence.json'));
    await assertMissing(path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
    await assertExists(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'worker-result.json'));
    await assertMissing(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
  } finally {
    if (previousGlobalRoot === undefined) delete process.env.SKS_GLOBAL_ROOT;
    else process.env.SKS_GLOBAL_ROOT = previousGlobalRoot;
  }
});

test('project update migration repairs legacy menubar and fast-mode config', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-legacy-repair-unit-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const previousHome = process.env.HOME;
  const previousGlobalRoot = process.env.SKS_GLOBAL_ROOT;
  process.env.HOME = home;
  process.env.SKS_GLOBAL_ROOT = path.join(home, '.sneakoscope-global');
  try {
    const { writeProjectUpdateMigrationReceipt } = await import('../../dist/core/update/update-migration-state.js');
    const { packageRoot } = await import('../../dist/core/fsx.js');
    const actionScript = path.join(home, '.codex', 'sks-menubar', 'sks-menubar-action.sh');
    const configPath = path.join(home, '.codex', 'config.toml');
    await writeText(actionScript, [
      '#!/usr/bin/env sh',
      'SKS_ENTRY="/old/sneakoscope/dist/bin/sks.js"',
      'exec "$SKS_ENTRY" "$@"',
      ''
    ].join('\n'));
    await fs.chmod(actionScript, 0o644);
    await writeText(configPath, [
      'model = "future-codex-model"',
      'model_reasoning_effort = "high"',
      '',
      '[user.fast_mode]',
      'visible = true',
      'default_profile = "sks-fast-high"',
      '',
      '[profiles.sks-fast-high]',
      'model = "gpt-5.4"',
      'service_tier = "default"',
      ''
    ].join('\n'));
    await fs.mkdir(path.join(project, '.sneakoscope'), { recursive: true });
    await fs.mkdir(path.join(project, '.codex'), { recursive: true });

    const receipt = await writeProjectUpdateMigrationReceipt({
      root: project,
      source: 'unit-legacy-repair',
      fromVersion: '5.6.1',
      blockers: [],
      warnings: []
    });

    const stages = new Map((receipt.legacy_migration_stages || []).map((stage) => [stage.id, stage]));
    assert.equal(stages.get('menubar-retarget')?.ok, true);
    assert.ok(stages.get('menubar-retarget')?.actions.includes('retargeted_menubar_action_script'));
    assert.ok(stages.get('menubar-retarget')?.actions.includes('restored_menubar_action_executable_bit'));
    assert.equal(stages.get('config-fastmode-normalize')?.ok, true);
    assert.ok(stages.get('config-fastmode-normalize')?.actions.includes('stripped_removed_fastmode_config_schema_keys'));
    assert.ok(stages.get('config-fastmode-normalize')?.actions.includes('migrated_legacy_fast_default_to_service_tier'));

    const expectedEntry = path.join(packageRoot(), 'dist', 'bin', 'sks.js');
    const scriptAfter = await fs.readFile(actionScript, 'utf8');
    const statAfter = await fs.stat(actionScript);
    assert.match(scriptAfter, new RegExp(`^SKS_ENTRY=${escapeRegExp(JSON.stringify(expectedEntry))}$`, 'm'));
    assert.notEqual(statAfter.mode & 0o111, 0);

    const configAfter = await fs.readFile(configPath, 'utf8');
    assert.match(configAfter, /^model = "future-codex-model"$/m);
    assert.match(configAfter, /^model_reasoning_effort = "high"$/m);
    assert.match(configAfter, /^service_tier = "fast"$/m);
    assert.doesNotMatch(configAfter, /^default_profile\s*=/m);
    assert.doesNotMatch(configAfter, /\[user\.fast_mode\]/);
    assert.doesNotMatch(configAfter, /\[profiles\.sks-fast-high\]/);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousGlobalRoot === undefined) delete process.env.SKS_GLOBAL_ROOT;
    else process.env.SKS_GLOBAL_ROOT = previousGlobalRoot;
  }
});

async function writeJson(file, data) {
  await writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

async function assertExists(file) {
  await assert.doesNotReject(fs.access(file), `${file} should exist`);
}

async function assertMissing(file) {
  await assert.rejects(fs.access(file), `${file} should be removed`);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
