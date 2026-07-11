import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  loadReleaseGateManifest,
  runReleaseGateDag,
  selectReleaseGateClosure
} from '../release-gate-dag.js'
import type { ReleaseGateManifestV2, ReleaseGateNode } from '../release-gate-node.js'

function gate(id: string, deps: string[], command: string): ReleaseGateNode {
  return {
    id,
    command,
    deps,
    resource: ['cpu-light', 'fs-write'],
    side_effect: 'hermetic',
    timeout_ms: 10_000,
    output_contract: 'sks.gate-result.v1',
    cache: { enabled: false, inputs: [] },
    isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' },
    preset: ['release']
  }
}

function nodeCommand(source: string) {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`
}

test('single codex-lb gate selection closes over and executes its Codex App dependency', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-gate-only-'))
  const marker = path.join(root, 'codex-app-ready.marker')
  const manifest: ReleaseGateManifestV2 = {
    schema: 'sks.release-gates.v2',
    gates: [
      gate('codex-app:fast-ui-preservation', [], nodeCommand(`require('fs').writeFileSync(${JSON.stringify(marker)}, 'ready'); console.log(JSON.stringify({schema:'sks.gate-result.v1',ok:true}))`)),
      gate('codex-lb:comprehensive', ['codex-app:fast-ui-preservation'], nodeCommand(`if (!require('fs').existsSync(${JSON.stringify(marker)})) process.exit(2); console.log(JSON.stringify({schema:'sks.gate-result.v1',ok:true}))`))
    ]
  }
  try {
    await fs.writeFile(path.join(root, 'release-gates.v2.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    const result = await runReleaseGateDag({ root, onlyGateIds: ['codex-lb:comprehensive'], noCache: true })
    assert.equal(result.ok, true)
    assert.deepEqual(result.selected_gate_ids, ['codex-app:fast-ui-preservation', 'codex-lb:comprehensive'])
    assert.deepEqual(result.executed_gates, ['codex-app:fast-ui-preservation', 'codex-lb:comprehensive'])
    assert.equal(result.completed, 2)
    assert.equal(result.failed, 0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('current codex-lb comprehensive selection includes its declared Codex App dependency', () => {
  const manifest = loadReleaseGateManifest(process.cwd())
  const selected = selectReleaseGateClosure(manifest, ['codex-lb:comprehensive']).map((entry) => entry.id)
  assert.ok(selected.includes('codex-app:fast-ui-preservation'))
  assert.ok(selected.includes('codex-lb:comprehensive'))
})

test('single-gate selection fails immediately for unknown gates and dependency cycles', () => {
  const manifest: ReleaseGateManifestV2 = {
    schema: 'sks.release-gates.v2',
    gates: [
      gate('gate:a', ['gate:b'], 'true'),
      gate('gate:b', ['gate:a'], 'true')
    ]
  }
  assert.throws(() => selectReleaseGateClosure(manifest, ['gate:missing']), /release_gate_only_selection_unknown:gate:missing/)
  assert.throws(() => selectReleaseGateClosure(manifest, ['gate:a']), /release_gate_only_selection_dependency_cycle:gate:a->gate:b->gate:a/)
})
