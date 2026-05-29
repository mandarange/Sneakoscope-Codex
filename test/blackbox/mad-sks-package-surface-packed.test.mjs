import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed package exposes MAD-SKS full-system command surface without protected-core writes', () => {
  const result = spawnSync(process.execPath, ['dist/bin/sks.js', 'mad-sks', 'permissions', '--target-root', process.cwd(), '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 'sks.mad-sks-permissions.v1');
  assert.equal(parsed.command_surface.includes('plan'), true);
  assert.equal(parsed.command_surface.includes('apply'), true);
  assert.equal(parsed.command_surface.includes('rollback-plan'), true);
  assert.equal(parsed.command_surface.includes('audit'), true);
  assert.equal(parsed.permission_flags.includes('--allow-system'), true);
  assert.equal(parsed.permission_flags.includes('--allow-computer-use'), true);
  assert.equal(parsed.protected_core.engine_source_exception, true);
  assert.equal(parsed.protected_core_immutable, false);
  assert.equal(parsed.protected_core_write_allowed, true);
});
