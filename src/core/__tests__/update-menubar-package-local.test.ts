import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installUpdateSksMenuBar } from '../update-check.js';

test('post-update menu bar install runs through the updated package entrypoint', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-updated-menubar-'));
  const entrypoint = path.join(root, 'updated-sks.mjs');
  const invocation = path.join(root, 'invocation.json');
  await fs.writeFile(entrypoint, [
    "import fs from 'node:fs';",
    `fs.writeFileSync(${JSON.stringify(invocation)}, JSON.stringify({ argv: process.argv.slice(2) }));`,
    "console.log(JSON.stringify({ schema: 'sks.codex-app-sks-menubar.v1', ok: true, apply: true, status: 'installed', platform: process.platform, app_path: '/tmp/SKS Menu Bar.app', executable_path: '/tmp/SKS Menu Bar', launch_agent_path: '/tmp/launch.plist', action_script_path: '/tmp/action.sh', build_stamp_path: '/tmp/stamp.json', report_path: '/tmp/report.json', menu_items: [], actions: [], launch: { requested: false, method: 'skipped', ok: true, error: null }, tcc_automation_status: 'unknown', next_actions: [], blockers: [], warnings: [] }));"
  ].join('\n'));
  const stages: Array<{ id: string; ok: boolean; status: string }> = [];
  try {
    const result = await installUpdateSksMenuBar({
      root,
      entrypoint,
      env: { ...process.env, SKS_MIGRATION_DOCTOR_TIMEOUT_MS: '5000' },
      quiet: true,
      stage: (id, ok, status) => stages.push({ id, ok, status })
    });
    const recorded = JSON.parse(await fs.readFile(invocation, 'utf8'));
    assert.deepEqual(recorded.argv, ['menubar', 'install', '--json']);
    assert.equal(result?.ok, true);
    assert.deepEqual(stages, [{ id: 'menubar_rebuild', ok: true, status: 'installed' }]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('post-update menu bar build failure is a failed progress stage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-updated-menubar-fail-'));
  const entrypoint = path.join(root, 'updated-sks.mjs');
  await fs.writeFile(entrypoint, "console.error('fixture menu build failed'); process.exit(9);\n");
  const stages: Array<{ id: string; ok: boolean; status: string }> = [];
  try {
    const result = await installUpdateSksMenuBar({
      root,
      entrypoint,
      env: { ...process.env, SKS_MIGRATION_DOCTOR_TIMEOUT_MS: '5000' },
      quiet: true,
      stage: (id, ok, status) => stages.push({ id, ok, status })
    });
    assert.equal(result?.ok, false);
    assert.equal(stages.length, 1);
    assert.equal(stages[0]?.id, 'menubar_rebuild');
    assert.equal(stages[0]?.ok, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
