import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMadSksAuthorizationManifest } from '../authorization-manifest.js';
import { buildMadSksPermissionModel, parseMadSksFlags } from '../permission-model.js';
import { runMadSksExecutor } from '../executors/index.js';

async function sqlPlaneInput(overrides: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-sql-plane-test-'));
  const userIntent = String(overrides.user_intent || 'update fixture row');
  const permission = buildMadSksPermissionModel({
    targetRoot: root,
    userIntent,
    flags: parseMadSksFlags(['--mad-sks', '--allow-db-write', '--yes'])
  });
  const authorization = createMadSksAuthorizationManifest({ permission, userIntent });
  return {
    executor: 'sql-plane',
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

function readBackFailedCycle() {
  return {
    schema: 'sks.mad-db-cycle-result.v1',
    ok: false,
    mission_id: 'M-test-readback',
    cycle_id: 'mad-db-test',
    action: 'exec',
    target: { blockers: [] },
    tool_inventory: { ok: true },
    execution: { ok: true },
    operation: { operation_classes: ['update'] },
    read_back: { ok: false, blockers: ['read_back_fixture_failed'] },
    read_only_restoration: { ok: true, blockers: [] },
    capability_closed: true,
    timings_ms: {},
    blockers: ['mad_db_read_back_verification_failed']
  };
}

test('sql-plane denies control-plane tool requests', async () => {
  const result = await runMadSksExecutor(await sqlPlaneInput({
    sql: 'select 1',
    tool_name: 'supabase.delete_project'
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('mad_db_control_plane_tool_denied'));
});

test('sql-plane fails when read-back verification fails', async () => {
  const previous = process.env.SKS_TEST_MOCK_MAD_DB_CYCLE;
  process.env.SKS_TEST_MOCK_MAD_DB_CYCLE = '1';
  try {
    const result = await runMadSksExecutor(await sqlPlaneInput({
      sql: 'update public.fixture set name = name where id = 1',
      verify_sql: 'select false as ok',
      accept_not_rollbackable: true,
      __test_mad_db_cycle_result: readBackFailedCycle()
    }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.ok(result.blockers.includes('mad_db_read_back_verification_failed'));
    assert.equal((result.sql_plane as any).read_back_passed, false);
    assert.equal((result.sql_plane as any).profile_closed, true);
  } finally {
    if (previous === undefined) delete process.env.SKS_TEST_MOCK_MAD_DB_CYCLE;
    else process.env.SKS_TEST_MOCK_MAD_DB_CYCLE = previous;
  }
});

test('sql-plane blocks proof when protected core snapshot comparison fails', async () => {
  const previousCycle = process.env.SKS_TEST_MOCK_MAD_DB_CYCLE;
  const previousCore = process.env.SKS_TEST_FORCE_PROTECTED_CORE_CHANGED;
  process.env.SKS_TEST_MOCK_MAD_DB_CYCLE = '1';
  process.env.SKS_TEST_FORCE_PROTECTED_CORE_CHANGED = '1';
  try {
    const result = await runMadSksExecutor(await sqlPlaneInput({
      sql: 'select 1',
      verify_sql: 'select 1',
      __test_protected_core_changed: true,
      __test_mad_db_cycle_result: {
        ...readBackFailedCycle(),
        ok: true,
        read_back: { ok: true, blockers: [] },
        blockers: []
      }
    }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'applied');
    assert.ok(result.proof_evidence_path);
  } finally {
    if (previousCycle === undefined) delete process.env.SKS_TEST_MOCK_MAD_DB_CYCLE;
    else process.env.SKS_TEST_MOCK_MAD_DB_CYCLE = previousCycle;
    if (previousCore === undefined) delete process.env.SKS_TEST_FORCE_PROTECTED_CORE_CHANGED;
    else process.env.SKS_TEST_FORCE_PROTECTED_CORE_CHANGED = previousCore;
  }
});

test('sql-plane denies TRUNCATE when user intent did not literally request it', async () => {
  const result = await runMadSksExecutor(await sqlPlaneInput({
    user_intent: 'clean up stale fixture rows',
    sql: 'truncate public.fixture',
    verify_sql: 'select 1',
    accept_not_rollbackable: true
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('catastrophic_sql_literal_request_missing'));
});
