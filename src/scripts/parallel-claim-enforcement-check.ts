#!/usr/bin/env node
// @ts-nocheck
import { assertFiles, assertGate, emitGate, packageScripts, readText } from './sks-1-18-gate-lib.js'

assertFiles([
  'src/core/agents/parallel-runtime-proof.ts',
  'schemas/agents/parallel-runtime-proof.schema.json',
  'src/scripts/parallel-runtime-real-blackbox.ts',
  'src/scripts/naruto-real-parallelism-blackbox.ts'
])
const scripts = packageScripts()
for (const id of ['parallel:runtime-proof', 'parallel:runtime-real-blackbox', 'naruto:real-parallelism-blackbox']) assertGate(Boolean(scripts[id]), `${id} script missing`)
assertGate(readText('src/core/agents/agent-scheduler.ts').includes('batch_dispatch_started'), 'scheduler batch dispatch proof missing')
assertGate(readText('src/core/agents/native-cli-session-swarm.ts').includes('worker_process_spawned'), 'native worker process spawn proof missing')
assertGate(readText('src/scripts/parallel-runtime-real-blackbox.ts').includes('speedup_ratio >= 5') || readText('src/scripts/parallel-runtime-real-blackbox.ts').includes('proof.speedup_ratio >= 5'), 'wall-clock speedup assertion missing')
const narutoRealBlackbox = readText('src/scripts/naruto-real-parallelism-blackbox.ts')
assertGate(!narutoRealBlackbox.includes("'--mock'") && !narutoRealBlackbox.includes('"--mock"'), 'Naruto real parallelism blackbox must not use --mock')
assertGate(narutoRealBlackbox.includes("'--real'") && narutoRealBlackbox.includes("'--backend'") && narutoRealBlackbox.includes("'codex-sdk'"), 'Naruto real parallelism blackbox must request real codex-sdk backend evidence')
emitGate('parallel:claim-enforcement')
