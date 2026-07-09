import test from 'node:test'
import assert from 'node:assert/strict'
import {
  runHermeticWriteE2e,
  runRealCodexWriteE2e,
  validateNarutoWriteE2eContract
} from '../naruto-write-e2e.js'
import {
  realisticNarutoRealWriteProofFixture,
  validateNarutoRealWriteProof
} from '../naruto-real-write-proof.js'
import { buildNarutoWorkGraph } from '../naruto-work-graph.js'
import { extractNarutoPromptPaths } from '../naruto-task-hints.js'

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

test('Naruto write graph uses explicit prompt file paths instead of patch-envelope placeholders', () => {
  const prompt = 'modify src/a.ts and src/b.ts independently'
  const paths = extractNarutoPromptPaths(prompt)
  const graph = buildNarutoWorkGraph({
    prompt,
    requestedClones: 2,
    totalWorkItems: 2,
    honorExplicitTotalWorkItems: true,
    writeCapable: true,
    targetPaths: paths,
    maxActiveWorkers: 2
  })

  assert.deepEqual(paths, ['src/a.ts', 'src/b.ts'])
  assert.deepEqual(graph.work_items.flatMap((item) => item.write_paths), ['src/a.ts', 'src/b.ts'])
  assert.equal(graph.ok, true, graph.blockers.join(', '))
})

test('real Codex write mode blocks instead of passing as mock or hermetic when runtime is unavailable', async () => {
  const previousRequire = process.env.SKS_REQUIRE_CODEX_E2E
  const previousRealWrite = process.env.SKS_TEST_REAL_CODEX_WRITE_E2E
  const previousUnavailable = process.env.SKS_TEST_REAL_CODEX_RUNTIME_UNAVAILABLE
  process.env.SKS_REQUIRE_CODEX_E2E = '1'
  process.env.SKS_TEST_REAL_CODEX_RUNTIME_UNAVAILABLE = '1'
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
    restoreEnv('SKS_TEST_REAL_CODEX_RUNTIME_UNAVAILABLE', previousUnavailable)
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

test('explicit Naruto real write proof schema accepts realistic write proof', () => {
  const proof = realisticNarutoRealWriteProofFixture()
  const validation = validateNarutoRealWriteProof(proof)

  assert.equal(proof.schema, 'sks.naruto-real-write-proof.v1')
  assert.equal(validation.ok, true, validation.blockers.join(', '))
})

test('explicit Naruto real write proof schema blocks missing or inferred broad mission evidence', () => {
  const missing = validateNarutoRealWriteProof(null)
  assert.equal(missing.ok, false)
  assert.ok(missing.blockers.includes('naruto_real_write_proof_invalid_json'))

  const broadMissionJson = {
    schema: 'sks.naruto-gate.v1',
    passed: true,
    mission_id: 'M-wide-json-scan',
    worker_ids: ['worker-a', 'worker-b'],
    patch_envelopes: [{ agent_id: 'worker-a' }]
  }
  const validation = validateNarutoRealWriteProof(broadMissionJson)

  assert.equal(validation.ok, false)
  assert.ok(validation.blockers.includes('naruto_real_write_proof_schema_invalid'))
  assert.ok(validation.blockers.includes('backend_codex_sdk_required'))
  assert.ok(validation.blockers.includes('real_write_changed_files_missing'))
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
