#!/usr/bin/env node
// @ts-nocheck
import { decideNarutoConcurrency } from '../core/naruto/naruto-concurrency-governor.js'
import { DEFAULT_NARUTO_CLONES } from '../core/agents/agent-schema.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
assertGate(DEFAULT_NARUTO_CLONES === 8, 'default Naruto clone roster must be 8')
const extreme = decideNarutoConcurrency({ requestedClones: 32, totalWorkItems: 64, backend: 'fake', parallelismMode: 'extreme' })
const safe = decideNarutoConcurrency({ requestedClones: 32, totalWorkItems: 64, backend: 'fake', parallelismMode: 'safe' })
assertGate(extreme.parallelism_mode === 'extreme' && safe.parallelism_mode === 'safe', 'governor must record parallelism mode', { extreme, safe })
assertGate(extreme.safe_active_workers <= 4 && safe.safe_active_workers <= extreme.safe_active_workers, 'all modes must honor the desktop-safe active-worker cap', { extreme, safe })
assertGate(readText('src/core/commands/naruto-command.ts').includes('--parallelism'), 'Naruto CLI must parse --parallelism')
emitGate('naruto:parallelism-mode', { extreme, safe })
