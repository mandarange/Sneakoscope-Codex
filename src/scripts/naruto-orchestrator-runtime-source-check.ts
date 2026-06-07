#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const source = fs.readFileSync(path.join(process.cwd(), 'src/core/commands/naruto-command.ts'), 'utf8')
const ok = source.includes("runtime_source_of_truth: 'agent-orchestrator-scheduler'")
  && source.includes("production_runtime_source_of_truth: 'agent-orchestrator-scheduler'")
  && source.includes('pre_run_smoke_never_owns_production_runtime')
assertGate(ok, 'Naruto production runtime source of truth must be the native agent orchestrator scheduler, not pre-run active-pool smoke', { ok })
emitGate('naruto:orchestrator-runtime-source', { ok })
