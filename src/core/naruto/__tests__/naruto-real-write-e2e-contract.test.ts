import test from 'node:test'
import assert from 'node:assert/strict'
import {
  runHermeticWriteE2e,
  runRealCodexWriteE2e,
  validateNarutoWriteE2eContract
} from '../naruto-write-e2e.js'

test('hermetic Naruto write E2E proves parallel writes, merge, typecheck, cleanup, and proof level', async () => {
  const report = await runHermeticWriteE2e()

  assert.equal(report.schema, 'sks.naruto-write-e2e.v1')
  assert.equal(report.ok, true, report.blockers.join(', '))
  assert.equal(report.status, 'passed')
  assert.equal(report.proof_level, 'hermetic_write_e2e')
  assert.deepEqual(report.changed_files, ['src/a.ts', 'src/b.ts'])
  assert.equal(report.worker_ids.length, 2)
  assert.equal(report.patch_envelope_count, 2)
  assert.equal(report.parent_merge_artifact.ok, true)
  assert.deepEqual(report.parent_merge_artifact.changed_files, ['src/a.ts', 'src/b.ts'])
  assert.equal(report.typecheck.ok, true, report.typecheck.stderr_tail)
  assert.equal(report.cleanup.ok, true)
  assert.equal(report.cleanup.temp_root_removed, true)
  assert.equal(report.runtime_evidence.backend, 'hermetic')
  assert.equal(report.runtime_evidence.mock_or_readonly_rejected, true)
})

test('real Codex write mode blocks instead of passing as mock or hermetic when runtime is unavailable', async () => {
  const previousRequire = process.env.SKS_REQUIRE_CODEX_E2E
  const previousRealWrite = process.env.SKS_TEST_REAL_CODEX_WRITE_E2E
  process.env.SKS_REQUIRE_CODEX_E2E = '1'
  delete process.env.SKS_TEST_REAL_CODEX_WRITE_E2E
  try {
    const report = await runRealCodexWriteE2e()

    assert.equal(report.ok, false)
    assert.equal(report.status, 'blocked')
    assert.equal(report.proof_level, 'blocked')
    assert.deepEqual(report.blockers, ['real_codex_runtime_required'])
    assert.equal(report.runtime_evidence.real_codex, false)
    assert.equal(report.changed_files.length, 0)
    assert.equal(report.patch_envelope_count, 0)
  } finally {
    restoreEnv('SKS_REQUIRE_CODEX_E2E', previousRequire)
    restoreEnv('SKS_TEST_REAL_CODEX_WRITE_E2E', previousRealWrite)
  }
})

test('write E2E contract rejects read-only smoke evidence and incomplete write proof', () => {
  const readonlySmoke = validateNarutoWriteE2eContract({
    mode: 'real-codex',
    changed_files: [],
    worker_ids: ['worker-1', 'worker-2'],
    patch_envelope_count: 0,
    parent_merge_artifact: { ok: false },
    typecheck: { ok: true },
    cleanup: { ok: true },
    runtime_evidence: { real_codex: false, backend: 'codex-sdk', mock_or_readonly_rejected: false }
  })

  assert.equal(readonlySmoke.ok, false)
  assert.ok(readonlySmoke.blockers.includes('real_write_changed_files_missing'))
  assert.ok(readonlySmoke.blockers.includes('patch_envelope_count_below_2'))
  assert.ok(readonlySmoke.blockers.includes('parent_merge_artifact_missing'))
  assert.ok(readonlySmoke.blockers.includes('real_codex_runtime_required'))
  assert.ok(readonlySmoke.blockers.includes('mock_or_readonly_not_rejected'))

  const oneWorkerPatch = validateNarutoWriteE2eContract({
    mode: 'hermetic',
    changed_files: ['src/a.ts', 'src/b.ts'],
    worker_ids: ['worker-1'],
    patch_envelope_count: 1,
    parent_merge_artifact: { ok: true },
    typecheck: { ok: true },
    cleanup: { ok: true },
    runtime_evidence: { real_codex: false, backend: 'hermetic', mock_or_readonly_rejected: true }
  })

  assert.equal(oneWorkerPatch.ok, false)
  assert.ok(oneWorkerPatch.blockers.includes('worker_id_diversity_below_2'))
  assert.ok(oneWorkerPatch.blockers.includes('patch_envelope_count_below_2'))
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
