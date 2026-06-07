#!/usr/bin/env node
import fs from 'node:fs/promises'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

async function main() {
  const intakePath = process.argv[2]
  if (!intakePath) throw new Error('naruto worker intake path is required')
  const intake = await readJson<any>(intakePath, null)
  if (!intake?.result_path || !intake?.heartbeat_path || !intake?.item?.id) {
    throw new Error('naruto worker intake is invalid')
  }
  await fs.appendFile(intake.heartbeat_path, `${JSON.stringify({
    schema: 'sks.naruto-actual-worker-heartbeat.v1',
    ts: nowIso(),
    item_id: intake.item.id,
    status: 'running'
  })}\n`)
  await new Promise((resolve) => setTimeout(resolve, 25))
  await writeJsonAtomic(intake.result_path, {
    schema: 'sks.naruto-actual-worker-result.v1',
    ok: true,
    generated_at: nowIso(),
    item_id: intake.item.id,
    placement: intake.placement,
    backend: intake.backend,
    worktree_path: intake.worktree_path
  })
}

main().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error(err?.message || String(err))
  process.exit(1)
})
