import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMadSksAuthorizationManifest } from '../authorization-manifest.js';
import { buildMadSksPermissionModel, parseMadSksFlags } from '../permission-model.js';
import { runMadSksExecutor } from '../executors/index.js';

async function dbWriteInput(overrides: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-db-write-test-'));
  const userIntent = String(overrides.user_intent || 'update fixture row');
  const permission = buildMadSksPermissionModel({
    targetRoot: root,
    userIntent,
    flags: parseMadSksFlags(['--mad-sks', '--allow-db-write', '--yes'])
  });
  const authorization = createMadSksAuthorizationManifest({ permission, userIntent });
  return {
    executor: 'db-write',
    target_root: root,
    artifact_dir: path.join(root, 'artifacts'),
    mission_id: `M-test-${Date.now().toString(36)}`,
    permission_model: permission,
    authorization_manifest: authorization,
    authorization_manifest_path: path.join(root, 'mad-sks-authorization.json'),
    yes: true,
    user_intent: userIntent,
    ...overrides
  };
}

test('db-write dry-run produces a preview plan without claiming writes', async () => {
  const result = await runMadSksExecutor(await dbWriteInput({
    dry_run: true,
    sql: 'update accounts set name = name where id = 1',
    rollback_sql: 'update accounts set name = name where id = 1'
  }));
  assert.equal(result.status, 'dry_run');
  assert.equal(result.writes_performed, false);
});

test('db-write apply never fabricates applied status — no execution engine exists', async () => {
  const result = await runMadSksExecutor(await dbWriteInput({
    dry_run: false,
    sql: 'update accounts set name = name where id = 1',
    rollback_sql: 'update accounts set name = name where id = 1'
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.writes_performed, false);
  assert.ok(result.blockers.includes('db_write_executor_no_execution_engine_use_sql_plane_executor'));
});
