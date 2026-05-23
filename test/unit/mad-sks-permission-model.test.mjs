import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAD_SKS_AUTHORIZATION_SCHEMA,
  buildMadSksPermissionModel,
  parseMadSksFlags
} from '../../dist/core/mad-sks/permission-model.js';
import { createMadSksAuthorizationManifest } from '../../dist/core/mad-sks/authorization-manifest.js';

test('MAD-SKS permission model requires explicit full-system scope grants', () => {
  const plan = buildMadSksPermissionModel({
    targetRoot: '/tmp/customer-project',
    userIntent: 'repair target project dependencies and verify UI',
    flags: parseMadSksFlags(['--mad-sks', '--allow-db-write', '--allow-package-install', '--allow-service-control'])
  });

  assert.equal(plan.schema, 'sks.mad-sks-permission-model.v1');
  assert.equal(plan.mode, 'authorized');
  assert.equal(plan.target_root, '/tmp/customer-project');
  assert.deepEqual(plan.allowed_scopes.sort(), ['db_write', 'package_install', 'service_control', 'shell', 'target_files'].sort());
  assert.equal(plan.required_flags.system, '--allow-system');
  assert.equal(plan.required_flags.computer_use, '--allow-computer-use');
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.immutable_harness_guard, 'always_on');
});

test('MAD-SKS authorization manifest is proof-linkable and non-persistent', () => {
  const permission = buildMadSksPermissionModel({
    targetRoot: '/tmp/customer-project',
    userIntent: 'repair target project dependencies and verify UI',
    flags: parseMadSksFlags([
      '--mad-sks',
      '--allow-system',
      '--allow-db-write',
      '--allow-package-install',
      '--allow-service-control',
      '--allow-network',
      '--allow-computer-use'
    ])
  });
  const manifest = createMadSksAuthorizationManifest({
    permission,
    userIntent: 'repair target project dependencies and verify UI',
  });

  assert.equal(manifest.schema, MAD_SKS_AUTHORIZATION_SCHEMA);
  assert.equal(permission.mode, 'full_system_authority');
  assert.equal(manifest.target_root, '/tmp/customer-project');
  assert.ok(manifest.allowed_scopes.includes('system'));
  assert.ok(manifest.allowed_scopes.includes('package_install'));
  assert.ok(manifest.allowed_scopes.includes('computer_use'));
  assert.ok(manifest.forbidden_scopes.includes('sks_harness_code'));
  assert.match(manifest.hash, /^[a-f0-9]{64}$/);
  assert.equal(manifest.local_only_artifact_policy, true);
  assert.equal(manifest.immutable_harness_guard_required, true);
  assert.equal(manifest.rollback_plan_required, true);
  assert.equal(manifest.audit_ledger_required, true);
});
