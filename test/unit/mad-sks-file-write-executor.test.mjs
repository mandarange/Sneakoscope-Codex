import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runMadSksExecutor } from '../../dist/core/mad-sks/executors/index.js';
import { buildMadSksPermissionModel, parseMadSksFlags } from '../../dist/core/mad-sks/permission-model.js';
import { createMadSksAuthorizationManifest } from '../../dist/core/mad-sks/authorization-manifest.js';

test('MAD-SKS file-write executor performs target writes and blocks protected core writes', async () => {
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-sks-file-write-'));
  const artifactDir = path.join(targetRoot, 'artifacts');
  await fsp.mkdir(artifactDir, { recursive: true });
  const { permission, authorization, authorizationPath } = await authorizationFor(targetRoot, artifactDir);

  const result = await runMadSksExecutor({
    executor: 'file-write',
    dry_run: false,
    target_root: targetRoot,
    target_path: 'notes/result.txt',
    content: 'actual executor write\n',
    artifact_dir: artifactDir,
    permission_model: permission,
    authorization_manifest: authorization,
    authorization_manifest_path: authorizationPath
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'applied');
  assert.equal(fs.readFileSync(path.join(targetRoot, 'notes', 'result.txt'), 'utf8'), 'actual executor write\n');
  assert.ok(result.audit_ledger_path);
  assert.ok(result.rollback_plan_path);
  assert.ok(result.proof_evidence_path);

  const blocked = await runMadSksExecutor({
    executor: 'file-write',
    dry_run: false,
    target_root: targetRoot,
    target_path: path.resolve('src/core/version.ts'),
    content: 'blocked\n',
    artifact_dir: artifactDir,
    permission_model: permission,
    authorization_manifest: authorization,
    authorization_manifest_path: authorizationPath
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.some((blocker) => /target_root_boundary_escape|protected_core_path/.test(blocker)));
});

test('MAD-SKS file-write executor supports guarded string patch operations', async () => {
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-sks-file-patch-'));
  const artifactDir = path.join(targetRoot, 'artifacts');
  await fsp.mkdir(path.join(targetRoot, 'notes'), { recursive: true });
  await fsp.mkdir(artifactDir, { recursive: true });
  await fsp.writeFile(path.join(targetRoot, 'notes', 'patch.txt'), 'alpha\nbeta\n');
  const { permission, authorization, authorizationPath } = await authorizationFor(targetRoot, artifactDir);

  const result = await runMadSksExecutor({
    executor: 'file-write',
    operation: 'patch',
    dry_run: false,
    target_root: targetRoot,
    target_path: 'notes/patch.txt',
    search: 'beta',
    replace: 'gamma',
    artifact_dir: artifactDir,
    permission_model: permission,
    authorization_manifest: authorization,
    authorization_manifest_path: authorizationPath
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'applied');
  assert.equal(fs.readFileSync(path.join(targetRoot, 'notes', 'patch.txt'), 'utf8'), 'alpha\ngamma\n');
});

async function authorizationFor(targetRoot, artifactDir) {
  const permission = buildMadSksPermissionModel({
    targetRoot,
    userIntent: 'unit test',
    flags: parseMadSksFlags(['--mad-sks', '--yes'])
  });
  const authorization = createMadSksAuthorizationManifest({ permission, userIntent: 'unit test' });
  const authorizationPath = path.join(artifactDir, 'mad-sks-authorization.json');
  await fsp.writeFile(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`);
  return { permission, authorization, authorizationPath };
}
