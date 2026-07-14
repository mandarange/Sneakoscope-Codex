import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { compareReleasePacks, inspectReleaseTarball } from '../release-pack-receipt.js'

test('release pack receipts bind exact local and staged tarball bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-release-pack-receipt-'))
  try {
    const first = createTarball(root, 'first', '6.3.0')
    const second = createTarball(root, 'second', '6.3.1')
    const local = inspectReleaseTarball({
      tarball: first,
      kind: 'local',
      sourceCommit: 'a'.repeat(40),
      root,
      npmPackProof: { proof_id: 'a'.repeat(64), info_sha256: 'b'.repeat(64), file_list_sha256: 'c'.repeat(64) }
    })
    const staged = inspectReleaseTarball({ tarball: first, kind: 'staged', root })
    const different = inspectReleaseTarball({ tarball: second, kind: 'staged', root })
    assert.equal(local.ok, true, local.blockers.join(','))
    assert.equal(local.package_name, 'sneakoscope')
    assert.equal(local.package_version, '6.3.0')
    assert.match(local.sha256, /^[a-f0-9]{64}$/)
    assert.match(local.sha512_integrity, /^sha512-/)
    assert.equal(compareReleasePacks(local, staged).ok, true)
    const mismatch = compareReleasePacks(local, different)
    assert.equal(mismatch.ok, false)
    assert.equal(mismatch.blockers.includes('package_version_mismatch'), true)
    assert.equal(mismatch.blockers.includes('tarball_sha256_mismatch'), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('release pack comparison rejects matching but malformed receipts', () => {
  const malformed = {
    schema: 'sks.release-pack-receipt.v1',
    ok: true,
    kind: 'local',
    package_name: 'sneakoscope',
    package_version: '6.3.0',
    source_commit: null,
    tarball_name: '',
    tarball_path: '',
    bytes: 0,
    unpacked_bytes: 0,
    sha256: '',
    sha512_integrity: '',
    file_count: 0,
    file_list_sha256: '',
    budget: { ok: false, max_packed_bytes: 0, max_unpacked_bytes: 0, max_file_count: 0, blockers: ['failed'] },
    npm_pack_proof: null,
    generated_at: '',
    blockers: []
  } as any
  const result = compareReleasePacks(malformed, { ...malformed, kind: 'staged' })
  assert.equal(result.ok, false)
  assert.equal(result.blockers.includes('local_receipt_invalid'), true)
  assert.equal(result.blockers.includes('staged_receipt_invalid'), true)
})

test('release pack comparison recomputes frozen package budgets instead of trusting receipt claims', () => {
  const forged = {
    schema: 'sks.release-pack-receipt.v1', ok: true, kind: 'local', package_name: 'sneakoscope', package_version: '6.3.0',
    source_commit: 'a'.repeat(40), tarball_name: 'sneakoscope-6.3.0.tgz', tarball_path: '.sneakoscope/reports/release/6.3.0/artifacts/sneakoscope-6.3.0.tgz', bytes: 999_999_999, unpacked_bytes: 999_999_999,
    sha256: 'a'.repeat(64), sha512_integrity: 'sha512-YQ==', file_count: 1, file_list_sha256: 'b'.repeat(64),
    budget: { ok: true, max_packed_bytes: 999_999_999, max_unpacked_bytes: 999_999_999, max_file_count: 999_999, blockers: [] },
    npm_pack_proof: { proof_id: 'c'.repeat(64), info_sha256: 'd'.repeat(64), file_list_sha256: 'e'.repeat(64) },
    generated_at: new Date().toISOString(), blockers: []
  } as any
  const result = compareReleasePacks(forged, { ...forged, kind: 'staged', source_commit: null, npm_pack_proof: null })
  assert.equal(result.ok, false)
  assert.equal(result.blockers.includes('local_receipt:package_budget_invalid_or_failed'), true)
  assert.equal(result.blockers.includes('staged_receipt:package_budget_invalid_or_failed'), true)
})

function createTarball(root: string, name: string, version: string): string {
  const staging = path.join(root, name, 'package')
  fs.mkdirSync(path.join(staging, 'dist/bin'), { recursive: true })
  fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({ name: 'sneakoscope', version }))
  fs.writeFileSync(path.join(staging, 'dist/bin/sks.js'), '#!/usr/bin/env node\n')
  const tarball = path.join(root, `${name}.tgz`)
  const result = spawnSync('tar', ['-czf', tarball, '-C', path.dirname(staging), 'package'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return tarball
}
