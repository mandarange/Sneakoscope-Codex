#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, exists, importDist, root } from './sks-1-18-gate-lib.js'

const worker = await importDist('core/agents/agent-worker-pipeline.js')
const cli = path.join(root, 'dist', 'bin', 'sks.js')
const childEnv = { ...process.env, SKS_DISABLE_GIT_WORKTREE: '1' }
assertGate(exists('dist/bin/sks.js'), 'dist/bin/sks.js missing (build first)')

const readOnlyWorker = worker.validateAgentWorkerResult({
  mission_id: 'M-readonly-routing',
  agent_id: 'readonly-agent',
  session_id: 'readonly-session',
  persona_id: 'verifier',
  task_slice_id: 'readonly-slice',
  status: 'done',
  backend: 'codex-sdk',
  summary: 'Read-only worker inspected files without proposing a patch.',
  findings: ['read-only inspection completed'],
  proposed_changes: [],
  changed_files: ['src/core/agents/agent-proof-evidence.ts'],
  lease_compliance: { ok: true, violations: [] },
  artifacts: [],
  blockers: [],
  confidence: 'fixture',
  handoff_notes: '',
  unverified: [],
  writes: [],
  no_patch_reason: {
    ok: true,
    reason: 'read_only_or_no_write_paths',
    read_only_or_noop_evidence: true
  },
  verification: { status: 'passed', checks: ['readonly-no-patch-routing'] }
})
assertGate(readOnlyWorker.status === 'done' && !readOnlyWorker.blockers.includes('no_patch_generated'), 'read-only/no-write worker changed_files must not require patch envelopes', readOnlyWorker)

const writeWorker = worker.validateAgentWorkerResult({
  ...readOnlyWorker,
  agent_id: 'write-agent',
  session_id: 'write-session',
  task_slice_id: 'write-slice',
  changed_files: ['src/core/agents/agent-proof-evidence.ts'],
  no_patch_reason: undefined
})
assertGate(writeWorker.status === 'blocked' && writeWorker.blockers.includes('no_patch_generated'), 'write-capable changed_files without patch envelope must still block', writeWorker)

const readonlyRun = spawnSync(process.execPath, [
  cli,
  'naruto',
  'run',
  'readonly routing must inspect `src/core/agents/agent-proof-evidence.ts` and `package.json` without writes',
  '--agents',
  '4',
  '--work-items',
  '4',
  '--backend',
  'fake',
  '--readonly',
  '--json',
  '--no-open-zellij'
], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 600000, maxBuffer: 6 * 1024 * 1024 })
const readonlyJson = parseJson(readonlyRun.stdout)
assertGate(readonlyRun.status === 0 && readonlyJson?.ok === true, 'readonly Naruto fake blackbox must exit ok', { status: readonlyRun.status, stdout: tail(readonlyRun.stdout), stderr: tail(readonlyRun.stderr) })
assertGate(readonlyJson.proof === 'passed', 'readonly Naruto proof must pass', { proof: readonlyJson.proof, blockers: readonlyJson.run?.proof?.blockers })
assertGate(readonlyJson.work_graph?.write_allowed_count === 0, 'readonly Naruto work graph must have zero write-allowed items', readonlyJson.work_graph)
assertGate(Number(readonlyJson.role_distribution?.implementation_like_workers || 0) === 0, 'readonly Naruto role distribution must have zero implementation-like workers', readonlyJson.role_distribution)
assertGate((readonlyJson.role_distribution?.entries || []).every((entry) => entry.write_allowed === false), 'readonly Naruto role distribution must deny writes for every role', readonlyJson.role_distribution)

const readonlyRoot = path.join(root, '.sneakoscope', 'missions', readonlyJson.mission_id, 'agents')
const readonlyProof = readJson(path.join(readonlyRoot, 'agent-proof-evidence.json'))
const readonlyStrategy = readJson(path.join(readonlyRoot, 'user-request-strategy.json'))
const readonlyPolicy = readJson(path.join(readonlyRoot, 'agent-parallel-write-policy.json'))
assertGate(readonlyPolicy.write_mode === 'off' && readonlyPolicy.readonly === true, 'readonly run must force native write policy off', readonlyPolicy)
assertGate(readonlyStrategy.gate?.write_task_count === 0, 'readonly strategy must not infer write targets from file mentions', readonlyStrategy.gate)
assertGate(readonlyProof.changed_files_lease_checked === false, 'readonly no-write proof must skip changed_files write-lease checks', readonlyProof)
assertGate(!(readonlyProof.blockers || []).some((blocker) => /no_patch_generated|lease_changed_file_violation/.test(String(blocker))), 'readonly proof must not contain patch/lease write blockers', readonlyProof.blockers || [])

const writeRun = spawnSync(process.execPath, [
  cli,
  'naruto',
  'run',
  'write-capable routing must patch `README.md` through leased envelopes',
  '--agents',
  '3',
  '--work-items',
  '3',
  '--backend',
  'fake',
  '--parallel-write',
  '--json',
  '--no-open-zellij'
], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 600000, maxBuffer: 6 * 1024 * 1024 })
const writeJson = parseJson(writeRun.stdout)
assertGate(writeRun.status === 0 && writeJson?.ok === true, 'write-capable Naruto fake blackbox must exit ok', { status: writeRun.status, stdout: tail(writeRun.stdout), stderr: tail(writeRun.stderr) })
const writeRoot = path.join(root, '.sneakoscope', 'missions', writeJson.mission_id, 'agents')
const writeStrategy = readJson(path.join(writeRoot, 'user-request-strategy.json'))
const writePolicy = readJson(path.join(writeRoot, 'agent-parallel-write-policy.json'))
assertGate(writePolicy.write_mode === 'parallel' && writePolicy.readonly === false, 'write-capable Naruto run must carry parallel write policy', writePolicy)
assertGate(writeStrategy.gate?.write_task_count >= 1, 'write-capable strategy must retain explicit write target inference', writeStrategy.gate)

emitGate('naruto:readonly-routing', {
  readonly_mission_id: readonlyJson.mission_id,
  write_mission_id: writeJson.mission_id,
  readonly_write_tasks: readonlyStrategy.gate?.write_task_count,
  write_write_tasks: writeStrategy.gate?.write_task_count
})

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function tail(value, limit = 2000) {
  const text = String(value || '')
  return text.length <= limit ? text : text.slice(-limit)
}
