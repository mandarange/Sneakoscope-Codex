#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const patchApply = await importDist('core/naruto/naruto-parallel-patch-apply.js')

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-patch-'))
const envelopes = Array.from({ length: 10 }, (_, index) => {
  const file = `file-${index}.txt`
  return envelope(index + 1, file, `after-${index}`)
})
const result = await patchApply.applyNarutoPatchEnvelopes(root, envelopes, { dryRun: false })
assertGate(result.ok === true, 'non-overlapping patch fixture must apply', result)
assertGate(result.batch_count === 1 && result.parallel_apply_count === 1, 'non-overlapping patch fixture must group into a parallel batch', result)
assertGate(result.results.every((row) => row.changed_files.length === 1 && Object.keys(row.before_hashes).length === 1 && Object.keys(row.after_hashes).length === 1), 'patch results must include before/after hashes and changed files', result)

const rollback = await patchApply.rollbackNarutoPatchResult(root, result.results[0])
assertGate(rollback.ok === true && rollback.restored.length === 1, 'rollback must restore before content for a patch result', rollback)

const conflict = await patchApply.applyNarutoPatchEnvelopes(root, [envelope(99, 'same.txt', 'a'), envelope(100, 'same.txt', 'b')], { dryRun: true })
assertGate(conflict.conflicts.length >= 1, 'overlapping patch fixture must serialize or mark conflict', conflict)

emitGate('naruto:parallel-patch-apply', {
  batch_count: result.batch_count,
  parallel_apply_count: result.parallel_apply_count,
  conflict_count: conflict.conflicts.length,
  rollback_restored: rollback.restored.length
})

function envelope(index, file, content) {
  return {
    schema: 'sks.agent-patch-envelope.v1',
    source: 'fixture',
    agent_id: `naruto-${index}`,
    session_id: `session-${index}`,
    slot_id: `slot-${index}`,
    generation_index: 1,
    task_slice_id: `NW-${index}`,
    lease_id: `lease-${index}`,
    allowed_paths: [file],
    operations: [{ op: 'write', path: file, content }]
  }
}

