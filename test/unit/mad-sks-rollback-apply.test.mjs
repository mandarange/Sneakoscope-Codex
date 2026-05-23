import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runMadSksExecutor } from '../../dist/core/mad-sks/executors/index.js';
import { applyMadSksRollbackPlan } from '../../dist/core/mad-sks/rollback-apply.js';
import { buildMadSksPermissionModel, parseMadSksFlags } from '../../dist/core/mad-sks/permission-model.js';
import { createMadSksAuthorizationManifest } from '../../dist/core/mad-sks/authorization-manifest.js';

test('MAD-SKS rollback-apply restores file executor rollback plans', async () => {
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-sks-rollback-'));
  const artifactDir = path.join(targetRoot, 'artifacts');
  await fsp.mkdir(artifactDir, { recursive: true });
  const permission = buildMadSksPermissionModel({
    targetRoot,
    userIntent: 'rollback unit test',
    flags: parseMadSksFlags(['--mad-sks', '--yes'])
  });
  const authorization = createMadSksAuthorizationManifest({ permission, userIntent: 'rollback unit test' });
  const authorizationPath = path.join(artifactDir, 'mad-sks-authorization.json');
  await fsp.writeFile(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`);

  const result = await runMadSksExecutor({
    executor: 'file-write',
    dry_run: false,
    target_root: targetRoot,
    target_path: 'created.txt',
    content: 'rollback me\n',
    artifact_dir: artifactDir,
    permission_model: permission,
    authorization_manifest: authorization,
    authorization_manifest_path: authorizationPath
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(targetRoot, 'created.txt')), true);

  const rollback = await applyMadSksRollbackPlan({
    rollbackPlanPath: result.rollback_plan_path,
    targetRoot,
    artifactDir,
    yes: true
  });

  assert.equal(rollback.ok, true);
  assert.equal(rollback.status, 'applied');
  assert.equal(fs.existsSync(path.join(targetRoot, 'created.txt')), false);
});
