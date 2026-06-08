import { spawn } from 'node:child_process'
import path from 'node:path'
import type { ReleaseGateNode } from './release-gate-node.js'
import { writeReleaseGateJson } from './release-gate-report.js'

export interface ReleaseGateBatchResult {
  schema: 'sks.release-gate-batch-result.v1'
  ok: boolean
  batch_size: number
  completed: number
  failed: number
  results: Array<{ id: string; ok: boolean; exit_code: number | null; duration_ms: number }>
}

const DISALLOWED_BATCH_RESOURCES = new Set(['zellij-real', 'git-worktree', 'local-llm-real', 'remote-model-real', 'publish', 'global-config'])

export function isReleaseGateBatchable(gate: ReleaseGateNode): boolean {
  if (gate.side_effect !== 'hermetic') return false
  if (!gate.resource.includes('cpu-light') || !gate.resource.includes('fs-read')) return false
  return gate.resource.every((resource) => resource === 'cpu-light' || resource === 'fs-read') && !gate.resource.some((resource) => DISALLOWED_BATCH_RESOURCES.has(resource))
}

export async function runReleaseGateBatch(root: string, gates: ReleaseGateNode[], input: { concurrency?: number; reportRoot?: string } = {}): Promise<ReleaseGateBatchResult> {
  const concurrency = Math.max(1, Math.floor(Number(input.concurrency || process.env.SKS_RELEASE_BATCH_CONCURRENCY || 4)))
  const nonBatchable = gates.filter((gate) => !isReleaseGateBatchable(gate))
  if (nonBatchable.length) {
    return {
      schema: 'sks.release-gate-batch-result.v1',
      ok: false,
      batch_size: gates.length,
      completed: 0,
      failed: nonBatchable.length,
      results: nonBatchable.map((gate) => ({ id: gate.id, ok: false, exit_code: null, duration_ms: 0 }))
    }
  }
  const queue = [...gates]
  const results: ReleaseGateBatchResult['results'] = []
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const gate = queue.shift()
      if (!gate) continue
      const result = await runOne(root, gate)
      results.push(result)
      if (input.reportRoot) writeChildResult(input.reportRoot, result)
    }
  })
  await Promise.all(workers)
  const failed = results.filter((row) => !row.ok).length
  return {
    schema: 'sks.release-gate-batch-result.v1',
    ok: failed === 0,
    batch_size: gates.length,
    completed: results.length - failed,
    failed,
    results
  }
}

function runOne(root: string, gate: ReleaseGateNode): Promise<ReleaseGateBatchResult['results'][number]> {
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(gate.command, { cwd: root, shell: true, stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => child.kill('SIGTERM'), gate.timeout_ms)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ id: gate.id, ok: code === 0, exit_code: code, duration_ms: Date.now() - started })
    })
  })
}

function writeChildResult(reportRoot: string, result: ReleaseGateBatchResult['results'][number]) {
  const dir = path.join(reportRoot, result.id.replace(/[^A-Za-z0-9_.:-]/g, '_'))
  writeReleaseGateJson(path.join(dir, 'result.json'), {
    schema: 'sks.release-gate-batch-child-result.v1',
    ...result
  })
}
