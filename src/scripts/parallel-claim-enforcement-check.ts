#!/usr/bin/env node
// @ts-nocheck
import { assertFiles, assertGate, emitGate, readJson, readText } from './sks-1-18-gate-lib.js'

assertFiles([
  'src/core/agents/parallel-runtime-proof.ts',
  'schemas/agents/parallel-runtime-proof.schema.json',
  'src/scripts/parallel-runtime-proof-check.ts',
  'src/scripts/parallel-runtime-real-blackbox.ts',
  'src/scripts/naruto-real-parallelism-blackbox.ts',
  'src/scripts/release-full-parallelism-blackbox.ts',
  'src/scripts/release-parallel-speed-budget-check.ts',
  'src/scripts/scheduler-parallel-proof-consistency-check.ts'
])
const manifest = readJson('release-gates.v2.json')
const gates = new Map((manifest.gates || []).map((gate: any) => [gate.id, gate]))
for (const id of ['parallel:claim-enforcement', 'release:full-parallelism-blackbox', 'release:parallel-speed-budget', 'scheduler:parallel-proof-consistency']) {
  assertGate(gates.has(id), `${id} release gate missing`)
}
for (const id of ['release:full-parallelism-blackbox', 'release:parallel-speed-budget', 'scheduler:parallel-proof-consistency']) {
  assertGate(gates.get(id)?.resource?.includes('timing-sensitive'), `${id} must run in timing-sensitive isolation`, gates.get(id))
}
assertGate(readText('src/core/agents/agent-scheduler.ts').includes('batch_dispatch_started'), 'scheduler batch dispatch proof missing')
assertGate(readText('src/core/agents/native-cli-session-swarm.ts').includes('worker_process_spawned'), 'native worker process spawn proof missing')
assertGate(readText('src/scripts/parallel-runtime-real-blackbox.ts').includes('speedup_ratio >= 5') || readText('src/scripts/parallel-runtime-real-blackbox.ts').includes('proof.speedup_ratio >= 5'), 'wall-clock speedup assertion missing')
const narutoRealBlackbox = readText('src/scripts/naruto-real-parallelism-blackbox.ts')
assertGate(!narutoRealBlackbox.includes("'--mock'") && !narutoRealBlackbox.includes('"--mock"'), 'Naruto real parallelism blackbox must not use --mock')
assertGate(narutoRealBlackbox.includes("'--real'") && narutoRealBlackbox.includes("'--backend'") && narutoRealBlackbox.includes("'codex-sdk'"), 'Naruto real parallelism blackbox must request real codex-sdk backend evidence')
assertGate(narutoRealBlackbox.includes('proofCacheTtlMs') && narutoRealBlackbox.includes('proof_signature') && narutoRealBlackbox.includes('forceRealRun'), 'Naruto real parallelism blackbox proof reuse must be TTL/signature bounded with a force-real bypass')
emitGate('parallel:claim-enforcement')
