import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { evaluateReleaseParallelFullCoverage } from '../../release-parallel-full-coverage.js'
import { RELEASE_GATE_CONTRACT_IDS, releaseGateContractSnapshot } from '../release-gate-contract.js'

test('release manifest matches the independent full gate contract exactly', () => {
  const manifest = JSON.parse(fs.readFileSync('release-gates.v2.json', 'utf8'))
  const ids = manifest.gates
    .filter((gate: any) => Array.isArray(gate.preset) && gate.preset.includes('release'))
    .map((gate: any) => String(gate.id))
    .sort()
  assert.deepEqual(ids, RELEASE_GATE_CONTRACT_IDS)
  for (const id of [
    'package:published-contract',
    'publish:packlist-performance',
    'release:metadata-current',
    'docs:truthfulness'
  ]) assert.ok(ids.includes(id), id)

  const contract = releaseGateContractSnapshot()
  assert.equal(contract.count, ids.length)
  assert.match(contract.sha256, /^[a-f0-9]{64}$/)
})

test('release coverage rejects both removed and uncontracted gates', () => {
  const removed = evaluateReleaseParallelFullCoverage(RELEASE_GATE_CONTRACT_IDS.slice(1))
  assert.equal(removed.ok, false)
  assert.deepEqual(removed.missing_critical_gates, [RELEASE_GATE_CONTRACT_IDS[0]])

  const added = evaluateReleaseParallelFullCoverage([...RELEASE_GATE_CONTRACT_IDS, 'self-authorized:new-gate'])
  assert.equal(added.ok, false)
  assert.deepEqual(added.unexpected_release_gates, ['self-authorized:new-gate'])
})
